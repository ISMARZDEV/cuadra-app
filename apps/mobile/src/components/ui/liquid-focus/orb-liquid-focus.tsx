import { useEffect, useRef, type RefObject } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";

import { orbFrame } from "@/components/navigation/orb-frame";
import { orbVisualVisible, pillReplacesOrb } from "@/components/navigation/orb-handoff";
import { SHELL_LAYER } from "@/components/navigation/shell-layers";
import { OrbSphere } from "@/components/ui/orb-sphere";
import { orbCaptureEmpty, orbCaptureSuccess, orbTranscriptTick } from "@/lib/haptics/orb-haptics";
import { useThinkingGate } from "@/features/aispace/voice/use-thinking-gate";
import { useVoiceCapture } from "@/features/aispace/voice/use-voice-capture";
import {
  TEXT_EXIT_MS,
  VoiceThinkingPill,
  VoiceTranscriptText,
} from "@/features/aispace/voice/voice-transcript";
import { useVoiceSendStore } from "@/store/voice-send-store";
import { useOrbStore } from "@/store/orb-store";

import { LiquidFocus } from "./liquid-focus";
import { LENS_MOTION } from "./use-liquid-focus";
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
/**
 * TOPE de la espera tras soltar.
 *
 * ⭐ No es la duración del «Pensando…»: lo normal es que la sesión cierre mucho antes y el salto
 * ocurra entonces. Esto sólo impide quedarse colgado si el reconocedor no emite su `end` —cosa
 * documentada cuando una llamada entrante se lleva el audio—. Diez segundos es lo que pidió el
 * usuario y da margen de sobra a una frase larga.
 */
const SETTLE_TIMEOUT_MS = 10_000;
/** Tope del TELÓN. Generoso —una respuesta puede tardar— pero finito: la pantalla no puede quedarse
 *  tapada sin salida si el agente falla en silencio. */
const ANSWER_TIMEOUT_MS = 30_000;

/** Aire entre que el texto termina de irse y la cúpula empieza a bajar. Corto: es una respiración,
 *  no una pausa. */
const EXIT_GAP_MS = 90;
/** Respiro mínimo antes de saltar: la lente tarda ~420 ms en retirarse y cortarla se ve fatal. */
const MIN_THINKING_MS = 620;
/**
 * DÓNDE VIVE EL DICTADO, como FRACCIÓN del alto de pantalla.
 *
 * ⭐ Anclarlo al orbe fue un error: el orbe está pegado al borde inferior, así que cualquier
 * separación razonable dejaba el texto abajo del todo. En la referencia el texto respira en el
 * tercio bajo-medio y el control se queda solo abajo — son dos zonas distintas, no una pila.
 *
 * Se expresa en fracción y no en puntos por la misma razón que el plegado del detalle: un número
 * fijo ata la maquetación a un teléfono (`cuadra-motion`).
 */
const TRANSCRIPT_Y = 0.34;

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
 * La atenuación y la lente son dos materiales: el contexto se oscurece DETRÁS y la cúpula recupera
 * luz encima. Antes el dim se pintaba sobre el shader, ensuciaba el blanco y se desactivó entero;
 * eso dejó la cabecera tan viva como el control. El orden correcto permite que convivan y que el
 * dim continúe durante el estado real de `thinking`, como en la referencia.
 *
 * ⚠️ **La foto del fondo EXCLUYE esta capa pero NO la barra de pestañas.** `backdropRef` envuelve
 * sólo a `<Tabs>`, así que ni la lente ni el botón de mocks entran en la imagen. La barra sí, y eso
 * es un riesgo conocido: su copia deformada queda debajo de la barra viva, que es de VIDRIO y deja
 * ver a través. Si el fantasma se nota, se arregla mirando —no razonando—: es exactamente el tipo
 * de decisión que el patrón deja abierta.
 */
export function OrbLiquidFocus({ backdropRef }: { backdropRef: RefObject<View | null> }) {
  const pressing = useOrbStore((s) => s.pressing);
  const orbActive = useOrbStore((s) => s.active);
  // La foto se toma en el momento en que el dedo se apoya. Ver `use-backdrop-snapshot`.
  const snapshot = useBackdropSnapshot(pressing, backdropRef);
  const lensReady = pressing && snapshot !== null;
  const { width, height } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const frame = orbFrame(width, insets.bottom);

  // ── DICTADO ─────────────────────────────────────────────────────────────────────────────────
  const router = useRouter();
  const queueVoice = useVoiceSendStore((s) => s.queue);
  const hideOrb = useOrbStore((s) => s.hide);
  const { transcript, listening, settled, level } = useVoiceCapture(pressing);
  const phase = useVoiceSendStore((st) => st.phase);
  const spoken = useVoiceSendStore((st) => st.spoken);
  const resetVoice = useVoiceSendStore((st) => st.reset);
  // ⭐ EL TELÓN. La lente ya no cuelga sólo del dedo: sigue puesta mientras el agente responde, y
  // por debajo se navega al chat sin que el usuario vea el salto.
  const curtain = phase !== "idle";
  // «Pensando…»: vive tras SOLTAR y sólo si se dictó algo. Es un estado propio y no `!pressing`,
  // porque en reposo tampoco se pulsa y ahí no hay nada que pensar.
  //
  // ⚠️⚠️ **Lo enciende un ajuste EN EL RENDER, no un efecto — y esa era la causa del parpadeo.**
  // Con un efecto, React commiteaba un fotograma con el dedo ya levantado y «pensando» todavía
  // apagado; en ese hueco el velo se quedaba sin ninguna señal, la onda de salida se disparaba y la
  // cúpula se iba para volver acto seguido. Ver `use-thinking-gate`.
  const [thinking, setThinking] = useThinkingGate(pressing);
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

  // ⭐⭐ **UN GESTO NUEVO CANCELA EL CICLO ANTERIOR.** Si el de antes se quedó a medias —el chat no
  // llegó a avisar, la pantalla estaba congelada, lo que sea—, al volver a pulsar salía la píldora
  // «Pensando…» de ESE ciclo en vez del orbe. El dedo del usuario es la señal más reciente que
  // existe: manda sobre cualquier estado viejo.
  //
  // Esto SÍ es trabajo de un efecto: toca un store ajeno, y llegar un fotograma tarde no se ve.
  // Encender «pensando», en cambio, sí se veía — por eso vive en el render (`useThinkingGate`).
  useEffect(() => {
    if (!pressing) return;
    if (useVoiceSendStore.getState().phase !== "idle") useVoiceSendStore.getState().reset();
  }, [pressing]);

  // ⚠️ Al levantar el dedo NO se decide todavía si hay texto: el reconocedor puede estar aún
  // cerrando su último tramo, y preguntar en ese instante manda la frase A MEDIAS —o la descarta
  // por «vacía» cuando en realidad venía en camino. Por eso «pensando» ESPERA a `settled`.

  // AL CERRAR LA SESIÓN se envía — pero la cúpula NO se retira: se queda de telón.
  useEffect(() => {
    if (!thinking) return;

    const decidir = () => {
      const texto = dicho.current.trim();
      setThinking(false);
      palabras.current = 0;
      if (!texto) {
        // No haber hablado NO es un error: un toque seco y el orbe se queda donde estaba.
        orbCaptureEmpty();
        return;
      }
      orbCaptureSuccess();
      dicho.current = "";
      // ⭐ AQUÍ NO SE ENVÍA NI SE NAVEGA. Sólo se entra en el telón con el texto puesto: el envío
      // ocurre cuando la cúpula YA SE FUE, para que la animación de envío del chat se VEA. Enviando
      // aquí, todo pasaba detrás de la cúpula y al levantarse ya estaba hecho.
      queueVoice(texto);
    };

    if (settled) {
      const t = setTimeout(decidir, MIN_THINKING_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(decidir, SETTLE_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [thinking, settled, router, queueVoice]);

  // ⭐ EL TELÓN DURA LO QUE TARDA LA DESINTEGRACIÓN, no lo que tarde el agente.
  //
  // Antes esperaba a la respuesta, y por eso al levantarse ya estaba todo hecho: nunca se veía el
  // mensaje subir a su sitio. Ahora el telón sólo cubre el viaje del texto; cuando termina, se
  // navega y SE ENVÍA — y la animación del chat ocurre a la vista.
  useEffect(() => {
    if (phase !== "answering") return;
    const t = setTimeout(() => {
      useVoiceSendStore.getState().dispatch();
      router.push("/(tabs)" as Href);
      useVoiceSendStore.getState().finish();
    }, TEXT_EXIT_MS + EXIT_GAP_MS);
    return () => clearTimeout(t);
  }, [phase, router]);

  // Publica el ciclo al store únicamente para pausar el auto-ocultado mientras el reconocedor o el
  // telón siguen vivos. Ya NO decide quién dibuja el orbe: hay una sola instancia visual.
  const setLensHold = useOrbStore((s) => s.setLensHold);
  useEffect(() => {
    setLensHold(orbActive && (thinking || curtain));
  }, [thinking, curtain, orbActive, setLensHold]);


  // LA SALIDA, EN DOS TIEMPOS. Primero se va el texto (`TEXT_EXIT_MS`); sólo cuando ha terminado
  // —más un respiro— se suelta el telón y la cúpula baja con su propio reloj.
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(() => {
      resetVoice();
      hideOrb();
    }, LENS_MOTION.fallMs);
    return () => clearTimeout(t);
  }, [phase, resetVoice, hideOrb]);


  /**
   * EL RELEVO ORBE → «PENSANDO…».
   *
   * ⭐⭐ **Ocurre AL SOLTAR, no al entrar el telón — y ésa era la segunda mitad del defecto.**
   * Colgado de `curtain`, el relevo esperaba a que la sesión de voz cerrase; para entonces el velo
   * ya estaba retirándose, así que «Pensando…» y la salida de la cúpula entraban a la vez y parecía
   * que la píldora hiciera desaparecer el fondo. Ahora la píldora ocupa el sitio del orbe mientras
   * la cúpula SIGUE PUESTA, y sólo después la onda se lleva el texto.
   *
   * ⚠️ Exige texto dictado: un toque seco sin hablar no puede sacar un «Pensando…» — no hay nada
   * que pensar, y el orbe tiene que quedarse donde estaba.
   *
   * ⚠️ Con el dedo APOYADO manda siempre el orbe. Es la red: si algún camino dejara el telón
   * puesto, lo peor que puede pasar es que el fondo siga velado — nunca que el control desaparezca
   * mientras lo tocas.
   */
  const ciclo = { active: orbActive, pressing, thinking, curtain };
  const hayTexto = transcript.trim() !== "";
  const relevo = pillReplacesOrb(ciclo, hayTexto);

  return (
    // ⚠️ `pointerEvents="none"`: el dedo que activa esto pertenece al orbe original de la barra.
    // Una capa que reclamara toques al aparecer se comería el propio gesto que la sostiene.
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { zIndex: SHELL_LAYER.lens }]}
    >
      <LiquidFocus
        // El dedo reacciona de inmediato, pero el reloj visual arranca sólo cuando existe el
        // fotograma de ESTE ciclo. Así la cúpula nunca monta a mitad de entrada ni enseña la
        // captura retenida de la pulsación anterior.
        // ⚠️ `lensReady` sólo cubre el DICTADO (`pressing && snapshot`). El telón tiene que seguir
        // puesto DESPUÉS de soltar, mientras el agente responde: con `lensReady` a secas la cúpula
        // se apagaba en el instante de levantar el dedo y el «Pensando…» quedaba sobre la pantalla
        // desnuda. Se conserva la guarda del fotograma y se le suma el telón.
        // ⚠️⚠️ **`thinking` NO SOBRA: sin él la cúpula PARPADEA.**
        //
        // Al soltar, `pressing` cae de inmediato pero `phase` sigue en `idle`: el envío espera a que
        // la sesión de voz cierre de verdad (para no mandar la frase a medias). En esa ventana
        // —cientos de milisegundos— `lensReady` y `curtain` son AMBOS falsos, así que la cúpula se
        // apagaba y volvía a encenderse al entrar `answering`. `thinking` es exactamente ese hueco.
        //
        // El `dimmed` de abajo ya lo incluía; que `listening` no lo hiciera era la asimetría que
        // producía el defecto — y la clase de fallo que se ve, no se razona.
        // ⭐⭐ **`curtain` NO va aquí, y ese es el efecto entero.** Con el telón dentro de
        // `listening`, la cúpula seguía puesta durante toda la desintegración y la onda de salida
        // arrancaba DESPUÉS: dos movimientos de 900 ms en fila, casi dos segundos, y el texto
        // parecía apagarse solo antes de que pasara nada.
        //
        // Soltándolo aquí, la onda radial nace al mismo tiempo que el texto empieza a subir: la
        // onda SE LLEVA la frase hacia arriba, que es lo que se pidió y lo que se lee como enviar.
        listening={lensReady || thinking}
        // Antes el dim llegaba a 100% mientras `captureRef` todavía preparaba el fotograma: la
        // entrada empezaba con un flash gris de pantalla completa. Ahora dim y menisco nacen juntos.
        dimmed={lensReady || thinking}
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
          // ⭐ UNA SOLA INSTANCIA VISUAL, montada durante toda la vida de esta capa. Antes la barra
          // pintaba otra `OrbSphere` y ambas se relevaban: aunque el handoff fuera lógico y atómico,
          // cada instancia conservaba su propia pose animada y el cambio se leía como un salto. La
          // barra ahora sólo aporta el hitbox; este orbe persiste antes, durante y después del velo.
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, right: 0, bottom: frame.bottom, alignItems: "center" }}
          >
            {/* Lo dictado se coloca contra la PANTALLA, no contra el orbe — ver `TRANSCRIPT_Y`. */}
            <View
              style={{
                position: "absolute",
                bottom: height * TRANSCRIPT_Y - frame.bottom,
                left: 0,
                right: 0,
                alignItems: "center",
              }}
            >
              <VoiceTranscriptText
                // Mientras se dicta manda lo que llega en vivo; ya enviado, lo que quedó dicho.
                text={orbActive ? (curtain ? spoken : transcript) : ""}
                visible={!curtain}
                isDark={isDark}
              />
            </View>

            {/* Nunca se desmonta para cederle el sitio a otra copia. `visible` conserva una sola
                pose/onda y anima únicamente el cambio real de activo o el morph a píldora. */}
            <OrbSphere size={frame.size} visible={orbVisualVisible(ciclo, hayTexto)} />
            {relevo ? (
              <View style={{ position: "absolute" }}>
                <VoiceThinkingPill visible isDark={isDark} />
              </View>
            ) : null}
          </View>
        }
        // ⭐ EL PLIEGUE RESPIRA CON TU VOZ. `pulse` existía en el modelo desde el patrón y le pasaba
        // 0 fijo; ahora lleva el volumen real del micrófono, así que la deformación late con lo que
        // dices en vez de con un reloj. Es la diferencia entre un efecto que ACOMPAÑA y uno que se
        // limita a estar puesto.
        pulse={level}
        veilColor={isDark ? VEIL_DARK : VEIL_LIGHT}
      />

    </View>
  );
}
