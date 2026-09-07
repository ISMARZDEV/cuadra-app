import { useCallback, useEffect, useRef, useState } from "react";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { getLanguage } from "@/i18n";

/** Preferencia de locale por idioma de la app, en BCP-47 y de más a menos específico. */
const PREFERRED: Record<string, string[]> = {
  es: ["es-DO", "es-MX", "es-US", "es-ES", "es"],
  en: ["en-US", "en-GB", "en"],
  pt: ["pt-BR", "pt-PT", "pt"],
};

/**
 * Qué le decimos al reconocedor.
 *
 * ⚠️ **No se le puede pasar `es-DO` a ciegas.** El reconocedor sólo admite los locales que tiene
 * instalados, y pedirle uno que no conoce hace que la sesión falle ENTERA — sin texto y sin más
 * pista que un error genérico. Se elige el primero de nuestra lista que el dispositivo declare, y
 * si no hay ninguno se deja que decida él (`undefined`).
 */
function pickLocale(supported: string[], lang: string): string | undefined {
  const wanted = PREFERRED[lang] ?? PREFERRED.es;
  const lower = supported.map((l) => l.toLowerCase());
  for (const candidate of wanted) {
    const hit = lower.indexOf(candidate.toLowerCase());
    if (hit !== -1) return supported[hit];
  }
  // Nada exacto: vale cualquiera del mismo IDIOMA (es-* si pedíamos español).
  const prefix = `${lang.toLowerCase()}-`;
  const family = supported.find((l) => l.toLowerCase().startsWith(prefix));
  return family;
}

export interface VoiceCapture {
  /** Lo dictado hasta ahora. Se va completando MIENTRAS se habla (resultados parciales). */
  transcript: string;
  /** True desde que el reconocedor arranca hasta que se detiene. */
  listening: boolean;
  /** `false` si el usuario negó el permiso o el dispositivo no puede reconocer voz. */
  available: boolean;
}

/**
 * DICTADO EN EL PROPIO DISPOSITIVO — sin servidor, sin coste y sin que el audio salga del teléfono.
 *
 * ⭐⭐ **Por qué el reconocedor del sistema y no Whisper de pago.** `SFSpeechRecognizer` transcribe
 * EN EL DISPOSITIVO: **coste cero**, **sin backend**, **privado** y **funciona sin red**. Y devuelve
 * PARCIALES en streaming, que es lo que hace que el texto se escriba mientras hablas — la
 * alternativa más precisa (`SFSpeechAnalyzer`) entrega segmentos cerrados y no escribe en vivo.
 *
 * ⚠️ **Es un TurboModule, y eso importa**: `@react-native-voice/voice` FALLA EN SILENCIO en modo
 * bridgeless, que es donde corre esta app.
 *
 * ⚠️⚠️ **LOS FALLOS SE REGISTRAN EN DEV.** La primera versión se tragaba todo con `catch {}`: bueno
 * para el usuario —un dictado roto no puede tumbar el gesto— y PÉSIMO para trabajar, porque «no
 * aparece texto» y «el reconocedor no arrancó» se ven exactamente igual. Ahora degrada igual de
 * silencioso en producción, pero en `__DEV__` dice por qué.
 */
export function useVoiceCapture(active: boolean): VoiceCapture {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [available, setAvailable] = useState(true);
  const asked = useRef(false);
  /** Locale resuelto contra lo que el dispositivo admite. `null` = todavía sin averiguar. */
  const locale = useRef<string | null | undefined>(null);

  useSpeechRecognitionEvent("result", (event) => {
    const best = event.results?.[0]?.transcript ?? "";
    // ⚠️ NO se acumula: el reconocedor reenvía la frase ENTERA en cada parcial, así que concatenar
    // duplicaría el texto a cada palabra.
    if (best) setTranscript(best);
  });

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    if (__DEV__) console.warn("[voz] error del reconocedor:", event.error, event.message);
    // `no-speech` es que no se dijo nada y `aborted` que lo cancelamos nosotros: ninguno apaga la
    // función. Cualquier otro código sí la deja indisponible.
    if (event.error !== "no-speech" && event.error !== "aborted") setAvailable(false);
  });

  const start = useCallback(async () => {
    try {
      if (!asked.current) {
        asked.current = true;
        const permiso = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        if (__DEV__) console.warn("[voz] permiso:", JSON.stringify(permiso));
        if (!permiso.granted) {
          setAvailable(false);
          return;
        }
      }

      // El locale se resuelve UNA vez y se guarda: preguntar en cada pulsación añadiría una espera
      // asíncrona justo en el instante en que el dedo ya está abajo.
      if (locale.current === null) {
        try {
          const { locales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
          locale.current = pickLocale(locales, getLanguage());
          if (__DEV__) console.warn("[voz] locale elegido:", locale.current, "de", locales.length);
        } catch (e) {
          locale.current = undefined; // que decida el sistema
          if (__DEV__) console.warn("[voz] no pude listar locales:", e);
        }
      }

      setTranscript("");
      ExpoSpeechRecognitionModule.start({
        lang: locale.current,
        // Los PARCIALES son la razón de elegir este módulo: sin esto el texto sólo aparecería al
        // soltar, y no se vería escribir.
        interimResults: true,
        maxAlternatives: 1,
        // ⚠️ **PREFERENCIA, NO EXIGENCIA.** Con `requiresOnDeviceRecognition: true` la sesión FALLA
        // ENTERA si ese idioma no está descargado para uso offline — y entonces no hay dictado en
        // absoluto. En `false` iOS usa lo local cuando puede y recurre a sus servidores cuando no:
        // se conserva la función a costa de que ESE caso concreto no sea offline. Un dictado que
        // funciona a veces por la red es mejor que uno que no funciona nunca.
        requiresOnDeviceRecognition: false,
        continuous: false,
      });
    } catch (e) {
      if (__DEV__) console.warn("[voz] no pude arrancar:", e);
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      // `stop` cierra la sesión y deja llegar el resultado FINAL; `abort` lo tiraría. Al soltar el
      // dedo queremos quedarnos con lo dicho.
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    void start();
    // Al desmontar se ABORTA: ahí no hay nada que conservar y dejar el micro abierto sería peor.
    return () => ExpoSpeechRecognitionModule.abort();
  }, [active, start]);

  return { transcript, listening, available };
}
