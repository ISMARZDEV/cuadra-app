import { useCallback, useEffect, useRef, useState } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";
import {
  AVAudioSessionCategory,
  AVAudioSessionCategoryOptions,
  AVAudioSessionMode,
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";

import { getLanguage } from "@/i18n";
import { orbCommandApplied } from "@/lib/haptics/orb-haptics";

import { applyCommand, detectCommand } from "./voice-commands";

/** Preferencia de locale por idioma de la app, en BCP-47 y de más a menos específico. */
const PREFERRED: Record<string, string[]> = {
  es: ["es-DO", "es-MX", "es-US", "es-ES", "es"],
  en: ["en-US", "en-GB", "en"],
  pt: ["pt-BR", "pt-PT", "pt"],
};

/**
 * Qué le decimos al reconocedor.
 *
 * ⚠️ **No se le puede pasar `es-DO` a ciegas.** Sólo admite los locales instalados, y pedirle uno
 * que no conoce hace fallar la sesión ENTERA — sin texto y con un error genérico.
 */
function pickLocale(supported: string[], lang: string): string | undefined {
  const wanted = PREFERRED[lang] ?? PREFERRED.es;
  const lower = supported.map((l) => l.toLowerCase());
  for (const candidate of wanted) {
    const hit = lower.indexOf(candidate.toLowerCase());
    if (hit !== -1) return supported[hit];
  }
  const prefix = `${lang.toLowerCase()}-`;
  return supported.find((l) => l.toLowerCase().startsWith(prefix));
}

export interface VoiceCapture {
  /** Lo dictado hasta ahora: los tramos ya cerrados más el que se está diciendo. */
  transcript: string;
  /** True desde que el reconocedor arranca hasta que la sesión termina del todo. */
  listening: boolean;
  /** `false` si se negó el permiso o el dispositivo no puede reconocer voz. */
  available: boolean;
  /**
   * LA VOZ, en 0..1, lista para conducir movimiento.
   *
   * Es un `SharedValue` y no estado de React a propósito: llega cada 100 ms y sólo la consume el
   * hilo de UI. En estado provocaría ~10 renders por segundo de toda la pantalla para mover unos
   * píxeles — el mismo error que documenta `chat-draft-store` con el borrador.
   */
  level: SharedValue<number>;
  /**
   * True cuando la sesión ha CERRADO por completo (evento `end`) tras un `stop()`.
   *
   * Es la señal de «ya no va a llegar más texto»: quien envíe el dictado debe esperar a esto y no
   * al instante de soltar el dedo, o mandaría la frase a medias.
   */
  settled: boolean;
}

/**
 * DICTADO EN EL PROPIO DISPOSITIVO — sin servidor, sin coste y con parciales en vivo.
 *
 * ⭐⭐⭐ **HAY QUE ESPERAR AL EVENTO `end` ANTES DE VOLVER A ARRANCAR.** Está en la documentación del
 * paquete —«Always await the "end" event before calling start() again»— y es la causa del defecto
 * más desconcertante de todos: soltar y volver a pulsar deprisa arrancaba una sesión sobre otra que
 * todavía se estaba apagando, y el reconocedor fallaba EN SILENCIO. El síntoma era «a veces
 * escucha y a veces no», que es lo que más cuesta atribuir.
 *
 * ⭐⭐ **`continuous: true`, y no es lo que parece.** En modo NO continuo, iOS 18+ cierra la sesión
 * en cuanto llega un resultado final — o sea, **al primer silencio**. Con dictado por «mantener
 * pulsado» eso corta la frase cada vez que el usuario piensa a mitad. En continuo la sesión dura lo
 * que dure el dedo, a cambio de que los resultados lleguen POR TRAMOS: cada final abre uno nuevo, y
 * hay que ACUMULARLOS (ver `finalized`). Es justo lo contrario de lo que hacía la primera versión.
 *
 * ⭐ **`iosTaskHint: "dictation"`** ajusta el modelo a frases habladas en lugar de a búsquedas
 * cortas, que es exactamente el caso de uso.
 *
 * ⚠️ Los fallos se registran en `__DEV__`: degradar en silencio está bien para el usuario y es
 * pésimo para trabajar, porque «no aparece texto» y «no arrancó» se ven igual.
 */
export function useVoiceCapture(active: boolean): VoiceCapture {
  /**
   * Los tramos ya cerrados, en LISTA y no en una cadena.
   *
   * ⭐⭐ Es lo que hace posible «borra eso»: de un texto pegado no se puede quitar «lo último» sin
   * adivinar dónde empezaba. Con la lista, deshacer es quitar el último elemento — exacto y
   * reversible por construcción.
   */
  const [segments, setSegments] = useState<string[]>([]);
  const [partial, setPartial] = useState("");
  const [listening, setListening] = useState(false);
  const [available, setAvailable] = useState(true);
  const [settled, setSettled] = useState(false);
  const level = useSharedValue(0);

  const asked = useRef(false);
  const locale = useRef<string | null | undefined>(null);
  /** ⭐ La guarda del ciclo de vida: true desde `start()` hasta que llega `end`. */
  const busy = useRef(false);
  /** Si se pidió arrancar mientras la sesión anterior aún cerraba, se reintenta al llegar `end`. */
  const wants = useRef(false);

  useSpeechRecognitionEvent("result", (event) => {
    const best = event.results?.[0]?.transcript ?? "";
    if (!best) return;
    if (event.isFinal) {
      // ⭐ Antes de acumular: ¿este tramo era una ORDEN? El vocabulario es fijo y sólo casa si el
      // tramo es NADA MÁS que el comando — ver `voice-commands`.
      const orden = detectCommand(best, getLanguage());
      if (orden) {
        setSegments((prev) => applyCommand(prev, orden));
        setPartial("");
        // Un háptico propio: sin él, «borra eso» y no entenderte se ven exactamente igual —la
        // frase desaparece— y el usuario no sabe si le hizo caso o si falló el reconocedor.
        orbCommandApplied();
        return;
      }
      // En modo continuo cada final CIERRA un tramo y el siguiente empieza de cero: hay que
      // acumular, o sólo sobreviviría la última frase dicha.
      setSegments((prev) => [...prev, best]);
      setPartial("");
      return;
    }
    setPartial(best);
  });

  useSpeechRecognitionEvent("start", () => {
    setListening(true);
    setSettled(false);
  });

  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    level.value = 0;
    busy.current = false;
    setSettled(true);
    // Si mientras cerraba se volvió a pulsar, ahora sí se puede arrancar.
    if (wants.current) void startNow();
  });

  useSpeechRecognitionEvent("volumechange", (event) => {
    // El módulo entrega −2..10 y «por debajo de 0 es inaudible». Se normaliza a 0..1 sobre el tramo
    // AUDIBLE (0..10): mapear el rango entero metería silencio dentro de la escala y el pulso
    // nunca llegaría al reposo.
    level.value = Math.max(0, Math.min(1, event.value / 10));
  });

  useSpeechRecognitionEvent("error", (event) => {
    if (__DEV__) console.warn("[voz] error:", event.error, event.message);
    // `no-speech` es no haber hablado y `aborted` una cancelación nuestra: ninguno apaga la función.
    if (event.error !== "no-speech" && event.error !== "aborted") setAvailable(false);
  });

  const startNow = useCallback(async () => {
    if (busy.current) {
      wants.current = true;
      return;
    }
    wants.current = false;
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
      if (locale.current === null) {
        try {
          const { locales } = await ExpoSpeechRecognitionModule.getSupportedLocales({});
          locale.current = pickLocale(locales, getLanguage());
          if (__DEV__) console.warn("[voz] locale:", locale.current, "de", locales.length);
        } catch (e) {
          locale.current = undefined;
          if (__DEV__) console.warn("[voz] sin lista de locales:", e);
        }
      }

      setSegments([]);
      setPartial("");
      setSettled(false);
      busy.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: locale.current,
        interimResults: true,
        maxAlternatives: 1,
        // Preferencia, no exigencia: con `true` la sesión falla entera si ese idioma no está
        // descargado, y entonces no hay dictado en absoluto.
        requiresOnDeviceRecognition: false,
        // Ver la cabecera: sin esto la frase se corta en el primer silencio.
        continuous: true,
        iosTaskHint: "dictation",
        // El volumen alimenta el movimiento: la lente ya tenía una entrada `pulse` sin conectar.
        volumeChangeEventOptions: { enabled: true, intervalMillis: 100 },
        // ⭐⭐⭐ **LA SESIÓN DE AUDIO, Y AQUÍ ESTABA LA INTERMITENCIA.**
        //
        // Cuadra REPRODUCE sonidos durante el gesto: `sounds.reveal()` al aparecer el orbe y
        // `sounds.tick()` en cada paso del arrastre, con `lib/sounds` fijando la sesión en modo
        // reproducción. Reproducir mientras `SFSpeechRecognizer` graba reconfigura la
        // `AVAudioSession` y puede DESACTIVAR la sesión de reconocimiento — sin error visible.
        //
        // Que fallara o no dependía de si sonaba un tic durante el dictado: de ahí el «a veces sí
        // y a veces no», que es el síntoma más difícil de atribuir que existe.
        //
        // `playAndRecord` + `mixWithOthers` declara justo eso: grabo Y hay otros reproduciendo,
        // convivid. `defaultToSpeaker` evita que el audio se vaya al auricular de llamadas al
        // activar la grabación, y el modo `measurement` desactiva el procesado que colorea la voz.
        iosCategory: {
          category: AVAudioSessionCategory.playAndRecord,
          categoryOptions: [
            AVAudioSessionCategoryOptions.mixWithOthers,
            AVAudioSessionCategoryOptions.defaultToSpeaker,
            AVAudioSessionCategoryOptions.allowBluetooth,
          ],
          mode: AVAudioSessionMode.measurement,
        },
      });
    } catch (e) {
      busy.current = false;
      if (__DEV__) console.warn("[voz] no arrancó:", e);
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (!active) {
      wants.current = false;
      // `stop` deja llegar el resultado FINAL; `abort` lo tiraría. Al soltar queremos lo dicho.
      if (busy.current) ExpoSpeechRecognitionModule.stop();
      return;
    }
    void startNow();
    return () => {
      // Al desmontar no hay nada que conservar, y dejar el micro abierto sería peor.
      wants.current = false;
      ExpoSpeechRecognitionModule.abort();
    };
  }, [active, startNow]);

  const transcript = [...segments, partial].filter(Boolean).join(" ").trim();
  return { transcript, listening, available, settled, level };
}
