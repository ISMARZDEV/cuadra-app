import { useEffect, useRef, useState, type RefObject } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";

import { orbFrame } from "@/components/navigation/orb-frame";
import { SHELL_LAYER } from "@/components/navigation/shell-layers";
import { OrbSphere } from "@/components/ui/orb-sphere";
import { orbCaptureEmpty, orbCaptureSuccess, orbTranscriptTick } from "@/lib/haptics/orb-haptics";
import { useVoiceCapture } from "@/features/aispace/voice/use-voice-capture";
import { VoiceTranscript } from "@/features/aispace/voice/voice-transcript";
import { useChatDraftStore } from "@/store/chat-draft-store";
import { useOrbStore } from "@/store/orb-store";

import { LiquidFocus } from "./liquid-focus";
import { useBackdropSnapshot } from "./use-backdrop-snapshot";

/**
 * El velo claro y el oscuro, en flotantes 0..1 como los quiere el shader.
 *
 * El patrón trae un neutro claro por defecto y avisa de que en tema oscuro hay que darle uno
 * oscuro: un velo claro sobre un fondo oscuro no atenúa, ACLARA — subiría el contraste justo donde
 * se quería bajarlo.
 */
// ⭐ Es el fondo REAL de la app, no un neutro elegido a ojo: en la referencia la cúpula ES el color
// del tema —blanco en claro— y cualquier otro tono se lee como una neblina puesta encima en vez de
// como el fondo emergiendo. Convertidos a 0..1 porque es lo que quiere el shader.
/** Cuánto se enseña «Pensando…» antes de saltar al chat. Es el tiempo de la RETIRADA de la lente
 *  más un respiro: saltar antes cortaría la animación a media vuelta. */
const THINKING_MS = 620;

const VEIL_LIGHT = [1.0, 1.0, 1.0] as const;
const VEIL_DARK = [0.043, 0.078, 0.063] as const; // #0B1410, el `bg` oscuro del tema

/**
 * LA LENTE LÍQUIDA DEL ORBE, montada sobre el armazón de pestañas.
 *
 * ⭐ **No introduce ningún gesto.** El orbe ya tiene un estado de MANTENER PULSADO desde antes
 * (`orb-store.pressing`, que la barra escribe en `onPanResponderGrant`/`Release`), así que la lente
 * se limita a seguirlo. Añadirle un reconocedor de Gesture Handler encima del `PanResponder` de la
 * barra sería poner dos dueños sobre el mismo toque — exactamente la negociación que `cuadra-mobile`
 * §6 documenta como fuente de gestos que «a veces no responden».
 *
 * ⭐⭐⭐ **`dimmed` va en FALSE, y esto costó una entrega rechazada.** Al principio lo até a
 * `listening`, y el resultado fue un gris lechoso plano: sobre el velo CLARO del shader caía además
 * la capa NEGRA del atenuado, y blanco contra negro no atenúa — aplana. En la referencia el
 * atenuado es la fase de PROCESADO, DESPUÉS de soltar: **nunca convive con la lente.**
 *
 * Además aquí no hay grabadora, así que no habría nada real que esperar: una cola de atenuado
 * inventada diría que la app procesa algo que no procesa, y el patrón lo prohíbe —«the caller owns
 * transcript arrival, not a fake fixed-delay typewriter»—. El día que exista voz, se engancha a
 * ella, no a `listening`.
 *
 * ⚠️ **La foto del fondo EXCLUYE esta capa pero NO la barra de pestañas.** `backdropRef` envuelve
 * sólo a `<Tabs>`, así que ni la lente ni el botón de mocks entran en la imagen. La barra sí, y eso
 * es un riesgo conocido: su copia deformada queda debajo de la barra viva, que es de VIDRIO y deja
 * ver a través. Si el fantasma se nota, se arregla mirando —no razonando—: es exactamente el tipo
 * de decisión que el patrón deja abierta.
 */
export function OrbLiquidFocus({ backdropRef }: { backdropRef: RefObject<View | null> }) {
  const pressing = useOrbStore((s) => s.pressing);
  // La foto se toma en el momento en que el dedo se apoya. Ver `use-backdrop-snapshot`.
  const snapshot = useBackdropSnapshot(pressing, backdropRef);
  const { width, height } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const frame = orbFrame(width, insets.bottom);

  // ── DICTADO ─────────────────────────────────────────────────────────────────────────────────
  const router = useRouter();
  const setDraft = useChatDraftStore((s) => s.setDraft);
  const hideOrb = useOrbStore((s) => s.hide);
  const { transcript, listening } = useVoiceCapture(pressing);
  // «Pensando…»: vive tras SOLTAR y sólo si se dictó algo. Es un estado propio y no `!pressing`,
  // porque en reposo tampoco se pulsa y ahí no hay nada que pensar.
  const [thinking, setThinking] = useState(false);
  const dicho = useRef("");
  const palabras = useRef(0);

  // Un TIC por PALABRA nueva, no por carácter ni por temporizador: es el suceso que el usuario
  // reconoce —acaba de entrar una palabra— y a razón de una por golpe no cansa.
  useEffect(() => {
    dicho.current = transcript;
    const n = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
    if (n > palabras.current) orbTranscriptTick();
    palabras.current = n;
  }, [transcript]);

  // AL SOLTAR se decide qué hacer con lo dictado.
  const wasPressing = useRef(false);
  useEffect(() => {
    if (pressing) {
      wasPressing.current = true;
      setThinking(false);
      return;
    }
    if (!wasPressing.current) return;
    wasPressing.current = false;

    const texto = dicho.current.trim();
    if (!texto) {
      // No haber hablado NO es un error: un toque seco y el orbe sigue donde estaba.
      orbCaptureEmpty();
      palabras.current = 0;
      return;
    }
    orbCaptureSuccess();
    setThinking(true);
    // ⚠️ El salto espera a que la lente se haya RETIRADO. Navegar en el mismo instante cortaría la
    // animación a media retirada y el usuario vería la pantalla nueva aparecer bajo una cúpula que
    // todavía se está yendo.
    const salto = setTimeout(() => {
      setThinking(false);
      dicho.current = "";
      palabras.current = 0;
      // El texto viaja por el borrador del chat, que es el camino que ya existe para precargar el
      // input — no se inventa una ruta con parámetros.
      setDraft(texto);
      hideOrb();
      router.push("/(tabs)" as Href);
    }, THINKING_MS);
    return () => clearTimeout(salto);
  }, [pressing, router, setDraft, hideOrb]);

  return (
    // ⚠️ `pointerEvents="none"`: el dedo que activa esto está en el ORBE, que vive por encima
    // (`SHELL_LAYER.tabBar`). Una capa que se quedara los toques mientras se mantiene pulsado se
    // comería el propio gesto que la sostiene.
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: SHELL_LAYER.lens }]}
    >
      <LiquidFocus
        listening={pressing}
        dimmed={false}
        width={width}
        height={height}
        // El fondo NO va dentro: es `<Tabs>`, que se dibuja detrás. Este montaje es un VELO
        // superpuesto, no un envoltorio — por eso también sobra el `foreground`.
        backdrop={null}
        snapshot={snapshot}
        // ⭐ EL CONTROL ACTIVO, NÍTIDO SOBRE EL FONDO ESMERILADO. Es lo que hace la referencia con
        // su micrófono, y lo que `zIndex` NO podía dar: la barra vive dentro de `<Tabs>`, así que su
        // z-index compite sólo con sus hermanos y jamás puede ganarle a una capa hermana de su
        // ANCESTRO. Esa lección ya estaba escrita en `product-screen.tsx` y la repetí igual.
        foreground={
          pressing || thinking ? (
            <View
              pointerEvents="none"
              style={{ position: "absolute", left: 0, right: 0, bottom: frame.bottom, alignItems: "center" }}
            >
              {/* Lo dictado va SOBRE el orbe, separado por su alto: escribir a su lado dejaría el
                  texto contra el canto de la pantalla en cuanto pase de una línea. */}
              <View style={{ position: "absolute", bottom: frame.height + 22, alignItems: "center" }}>
                <VoiceTranscript
                  transcript={transcript}
                  listening={listening}
                  thinking={thinking}
                  isDark={isDark}
                />
              </View>
              <OrbSphere size={frame.size} visible />
            </View>
          ) : null
        }
        veilColor={isDark ? VEIL_DARK : VEIL_LIGHT}
      />

    </View>
  );
}
