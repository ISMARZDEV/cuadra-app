import { useEffect, useRef, useState, type RefObject } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  Easing,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useColorScheme } from "nativewind";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";

import { orbFrame } from "@/components/navigation/orb-frame";
import { SHELL_LAYER } from "@/components/navigation/shell-layers";
import { OrbSphere } from "@/components/ui/orb-sphere";
import { orbCaptureEmpty, orbTranscriptTick } from "@/lib/haptics/orb-haptics";
import { sounds } from "@/lib/sounds";
import { useThinkingGate } from "@/features/aispace/voice/use-thinking-gate";
import { EXIT_STAIR_ONSETS_MS, STAIR_ONSETS_MS } from "@/features/aispace/voice/send-stairs";
import { useHapticStairs } from "@/features/aispace/voice/use-haptic-stairs";
import { useVoiceCapture } from "@/features/aispace/voice/use-voice-capture";
import { transcriptOnStage } from "@/features/aispace/voice/transcript-stage";
import { TEXT_HOLD_MS, VoiceTranscriptText } from "@/features/aispace/voice/voice-transcript";
import { useVoiceSendStore } from "@/store/voice-send-store";
import { useOrbStore } from "@/store/orb-store";

import { LiquidFocus } from "./liquid-focus";
import { transcriptHeightInfluence } from "./model";
import { LENS_MOTION } from "./use-liquid-focus";
import { useBackdropSnapshot } from "./use-backdrop-snapshot";

/**
 * El velo claro y el oscuro, en flotantes 0..1 como los quiere el shader.
 *
 * El patrón trae un neutro claro por defecto y avisa de que en tema oscuro hay que darle uno
 * oscuro: un velo claro sobre un fondo oscuro no atenúa, ACLARA — subiría el contraste justo donde
 * se quería bajarlo.
 */
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

/**
 * EL COLOR DE LA CÚPULA, en flotantes 0..1 como los quiere el shader.
 *
 * ⭐⭐⭐ **En oscuro es NEGRO PURO, y antes era el `bg` del tema — que no es lo mismo.** El fondo
 * oscuro de Cuadra es `#0B1410`, y ese color lleva verde de verdad: G=20 sobre R=11. Sobre una
 * pantalla ya oscurecida, ese tinte no se lee como «el fondo emergiendo» sino como una película
 * VERDOSA puesta encima — el usuario lo describió como «verdoso sucio», y tenía razón: el canal
 * dominante de la cúpula era el verde.
 *
 * La cúpula NO tiene que ser el fondo: tiene que ser AUSENCIA. En claro eso es blanco puro y en
 * oscuro es negro puro, y así los dos temas dicen lo mismo — aquí no hay nada, mira el control.
 *
 * ⚠️ Comprobado que el shader no depende de la luminancia exacta: usa `step(0.5, veilLuma)` para
 * decidir el sombreado del canto del agua, y tanto `#0B1410` (luma 0.07) como el negro (0.0) caen
 * del mismo lado. Cambiar el tinte no toca esa rama.
 */
const VEIL_LIGHT = [1.0, 1.0, 1.0] as const;
const VEIL_DARK = [0.0, 0.0, 0.0] as const;

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
export function OrbLiquidFocus({
  backdropRef,
  touchPressure,
}: {
  backdropRef: RefObject<View | null>;
  touchPressure: SharedValue<number>;
}) {
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
  const { transcript, settled, level, speechPresence, clear: clearTranscript } = useVoiceCapture(pressing);
  const transcriptInfluence = useSharedValue(0);
  const trackTranscriptHeight = (textHeight: number) => {
    // Una línea es la base. De dos a cuatro líneas el texto va empujando el plano hacia arriba;
    // después se satura para que una frase larga no expulse el menisco de la pantalla.
    const normalized = transcriptHeightInfluence(textHeight);
    transcriptInfluence.set(withTiming(normalized, {
      duration: 180,
      easing: Easing.out(Easing.quad),
    }));
  };
  useEffect(() => {
    if (transcript.trim()) return;
    transcriptInfluence.set(withTiming(0, {
      duration: 160,
      easing: Easing.out(Easing.quad),
    }));
  }, [transcript, transcriptInfluence]);
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

  // Un toque vacío necesita una cola propia: `thinking` se apaga al decidir que no hay nada que
  // enviar, pero la cúpula todavía debe recogerse durante la onda de salida. Mantener esta señal
  // separada evita que el arco desaparezca en el mismo frame en que empieza a contraerse.
  const [emptyRetreating, setEmptyRetreating] = useState(false);
  /**
   * ⭐⭐ **LA FRASE SE QUEDA, Y ESO PIDE UNA SEÑAL PROPIA.** Antes `visible={!curtain}` bastaba: al
   * entrar el telón el texto arrancaba su viaje inmediatamente. Ahora se queda `TEXT_HOLD_MS` con el
   * brillo recorriéndola —para poder LEERLA— y sólo después se desvanece, así que «hay telón» y «el
   * texto se está yendo» dejaron de ser el mismo suceso. Colgarlo de `curtain` lo enviaría sin que
   * nadie hubiera visto nada, que es el defecto que esto viene a evitar.
   */
  const [textLeaving, setTextLeaving] = useState(false);

  /**
   * LAS DOS ESCALERAS DEL CICLO — la misma señal, en sus dos umbrales.
   *
   * ⚠️ Van AQUÍ, debajo de `textLeaving`, y no arriba con el resto de hooks: leer un `const` antes de
   * su declaración es un TDZ que revienta en el primer render. Lo cazó el typecheck esta vez; en un
   * `useDerivedValue` no lo habría cazado nadie (`cuadra-motion` §12b).
   *
   * ⭐⭐⭐ **Tres peldaños que ascienden de difuso a nítido, dos veces: cuando el mensaje SUENA que se
   * va, y cuando la cúpula se RETIRA con la onda hacia arriba.** Un solo vocabulario para «esto se
   * está yendo», así que el usuario no tiene que aprender dos señales distintas.
   *
   * Los offsets difieren porque lo que acompañan difiere: la primera se pega a los ataques MEDIDOS
   * del clip (200/300/400 ms) para que se sienta como el sonido teniendo cuerpo; la segunda arranca
   * en cero, porque un movimiento empieza cuando empieza y retrasarla 200 ms la volvería un eco.
   *
   * ⚠️⚠️ **Esto SUSTITUYÓ a un aviso de dos toques que iba 180 ms antes de la salida, y el motivo es
   * aritmético.** Su último toque caía en 1950 ms y el primer peldaño de la salida en 2000: **50 ms
   * de hueco, la mitad del mínimo que el Taptic Engine separa**. Se habrían fundido en un golpe
   * sucio y, de paso, dos patrones seguidos acercan la cadencia al punto en que la cola del motor
   * descarta en silencio. Cuando dos hápticos caen así de cerca, la salida no es espaciarlos: es
   * darse cuenta de que sobraba uno.
   */
  useHapticStairs(phase === "answering", STAIR_ONSETS_MS);
  useHapticStairs(textLeaving, EXIT_STAIR_ONSETS_MS);
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
    if (pressing) {
      setEmptyRetreating(false);
      setTextLeaving(false);
    }
  }, [pressing]);

  // ⭐⭐⭐ **EL ORBE SE RETIRA: EL CICLO SE OLVIDA ENTERO.**
  //
  // Aquí vivía el defecto que reportó el usuario —«tras enviar se queda con el último texto y lo
  // muestra cuando hago slide»—. El transcript no se borraba al terminar un dictado: se ESCONDÍA,
  // porque la única guarda del pintado era `orbActive`. Al volver a revelar el orbe, minutos
  // después, el residuo del reconocedor reaparecía plantado sobre una pantalla en reposo.
  //
  // La vida de lo dictado es la del ORBE, no la del gesto: el gesto lo empieza, pero sólo cuando el
  // orbe se retira deja de haber a quién importarle. Y el suceso es UNO —«se acabó el ciclo»—, así
  // que las dos cosas que hay que soltar se sueltan aquí y no en dos efectos que puedan divergir.
  useEffect(() => {
    if (orbActive) return;
    setEmptyRetreating(false);
    setTextLeaving(false);
    clearTranscript();
  }, [orbActive, clearTranscript]);

  useEffect(() => {
    if (!thinking) return;

    const decidir = () => {
      const texto = dicho.current.trim();
      setThinking(false);
      palabras.current = 0;
      if (!texto) {
        // No haber hablado NO es un error: primero se recoge la cúpula y luego el orbe vuelve a
        // reposo. La señal persiste mientras la onda vacía termina para que no haya un corte.
        setEmptyRetreating(true);
        orbCaptureEmpty();
        return;
      }
      setEmptyRetreating(false);
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
    // ⭐ EL SONIDO ARRANCA AQUÍ Y NO AL SOLTAR, por dos razones que apuntan al mismo sitio. La
    // primera es de significado: al levantar el dedo todavía no se sabe si hay algo que enviar —eso
    // lo decide `settled`—, así que sonar antes anunciaría envíos que no ocurren. La segunda es
    // técnica y es la importante: reproducir audio mientras el reconocedor sigue abierto reconfigura
    // la `AVAudioSession` y puede desactivar la sesión de voz EN SILENCIO. Aquí ya cerró.
    sounds.voiceSend();
    // Tiempo 1 — la frase SE QUEDA, quieta y legible, con el brillo recorriéndola. Es el rato en que
    // el usuario comprueba que se entendió lo que dictó, y el orbe ya se está agitando debajo.
    const irse = setTimeout(() => setTextLeaving(true), TEXT_HOLD_MS);
    // Tiempo 2 — se navega y SE ENVÍA, cuando la escena ya está vacía.
    //
    // ⚠️⚠️ **La espera la marca la CÚPULA (`releaseMs`, 900 ms), no el texto (`TEXT_EXIT_MS`, 300).**
    // Las dos salidas ARRANCAN juntas pero no duran lo mismo, así que temporizar contra la corta
    // dejaba la navegación ocurriendo con la cúpula a media retirada. Cuando dos cosas se van a la
    // vez, lo que hay que esperar es la ÚLTIMA — y aquí la lenta es la que tapa la pantalla.
    //
    // El envío va DESPUÉS a propósito: si se entrega antes, el mensaje sube a su sitio detrás de la
    // cúpula y al retirarse ya está todo hecho —nunca se ve la animación de envío del chat, que es
    // justo lo que une dictar con conversar—.
    let enviado = false;
    const enviar = setTimeout(() => {
      enviado = true;
      useVoiceSendStore.getState().dispatch();
      router.push("/(tabs)" as Href);
      useVoiceSendStore.getState().finish();
    }, TEXT_HOLD_MS + LENS_MOTION.releaseMs + EXIT_GAP_MS);
    return () => {
      clearTimeout(irse);
      clearTimeout(enviar);
      // ⚠️ **Cancelar NO es enviar.** Si el ciclo muere antes de tiempo —un gesto nuevo, el orbe que
      // se oculta— el sonido SÍ se corta en seco: no hay envío al que acompañar, y dejarlo sonando
      // anunciaría algo que no ha ocurrido. El corte suave es sólo para el final feliz.
      if (!enviado) sounds.voiceSendStop();
    };
  }, [phase, router]);

  // Publica el ciclo al store únicamente para pausar el auto-ocultado mientras el reconocedor o el
  // telón siguen vivos. Ya NO decide quién dibuja el orbe: hay una sola instancia visual.
  const setLensHold = useOrbStore((s) => s.setLensHold);
  useEffect(() => {
    setLensHold(orbActive && (thinking || curtain));
  }, [thinking, curtain, orbActive, setLensHold]);


  /**
   * EL REPOSO, cuando ya no queda nada en escena.
   *
   * ⭐⭐⭐ **Y AQUÍ YA NO SE OCULTA EL ORBE, que era el defecto.** Esto llamaba a `hideOrb()` 620 ms
   * después de navegar, así que al aterrizar en el chat el orbe se esfumaba de golpe: acababas de
   * dictar y el control desaparecía justo cuando más probable era que quisieras volver a usarlo.
   * Dictar no es una razón para cerrar el orbe — es la prueba de que se está usando.
   *
   * Retirándolo, el cierre vuelve a ser lo que siempre debió: el ocioso por ABANDONO. Y el store ya
   * estaba preparado para esto sin tocar nada — al caer `lensHold`, `setLensHold` rearma la cuenta
   * DESDE CERO, precisamente para no castigar al usuario por haber dictado. `hideOrb()` cortocircuitaba
   * ese camino y por eso la previsión no servía de nada.
   */
  useEffect(() => {
    if (phase !== "leaving") return;
    const t = setTimeout(resetVoice, LENS_MOTION.fallMs);
    return () => clearTimeout(t);
  }, [phase, resetVoice]);


  /**
   * EL ORBE ES EL «PENSANDO» — ya no hay relevo, y ahí se fue una familia entera de defectos.
   *
   * ⭐⭐⭐ Antes el orbe se retiraba y una píldora con la palabra escrita ocupaba su sitio. Eran dos
   * elementos disputándose el mismo punto de la pantalla, y garantizar que jamás coincidieran costó
   * un módulo (`orb-handoff`), un test exhaustivo de 64 estados y tres defectos reportados —dos
   * orbes pintados a la vez, la píldora entrando mientras la cúpula salía, el relevo colgado de la
   * señal equivocada—. **El arbitraje perfecto entre dos cosas es peor que no necesitar arbitrar.**
   *
   * Ahora el control no cambia de identidad: se AGITA. El orbe pasa a moverse más y más rápido
   * mientras el agente trabaja (`OrbSphere thinking`), que dice lo mismo sin ceder el sitio a nadie.
   */
  const ciclo = { active: orbActive, pressing, thinking, curtain };
  // ⭐⭐ **LA RED.** `clearTranscript` arregla la CAUSA del residuo; esto hace que no pueda volver por
  // otra puerta: no existe ningún estado de reposo en el que un texto viejo pueda salir a pantalla.
  // Y `hayTexto` se deriva de lo que SE VE, no del transcript crudo.
  const enPantalla = transcriptOnStage(ciclo, transcript, spoken);
  const hayTexto = enPantalla !== "";
  /**
   * ¿HAY CÚPULA PUESTA? Una sola derivación para las dos entradas que la gobiernan.
   *
   * ⭐⭐⭐ **La cúpula dura lo que dura lo que SOSTIENE, y se va CON ello.** Al soltar el dedo se
   * quedaba mientras el reconocedor cerraba (`thinking`) y durante el envío (`curtain`), pero se
   * retiraba en momentos distintos que el texto: primero se iba ella y la frase quedaba flotando
   * sobre la pantalla desnuda, o al revés, seguía puesta después de que no quedara nada dentro.
   *
   * `!textLeaving` es lo que las ata: en el instante en que la frase empieza a desvanecerse, la
   * cúpula empieza su retirada. **Arrancan juntas** —que es lo que se lee como un solo suceso— aunque
   * no terminen a la vez: el texto tarda 300 ms y la onda radial de la cúpula, 900.
   *
   * ⚠️ Las tres señales cubren el ciclo sin dejar un fotograma sin dueño: el dedo (`lensReady`), la
   * espera al reconocedor (`thinking`) y el envío (`curtain`). Que UNA discrepara de las otras fue
   * el origen de tres defectos distintos, siempre por el mismo sitio — por eso se derivan aquí una
   * sola vez y las dos entradas leen el MISMO valor.
   */
  const veiled = lensReady || thinking || (curtain && !textLeaving);
  // Soltar vacío inicia una recogida redondeada mientras el reconocedor termina de cerrar. Si
  // aparece texto, `retreating` vuelve a false; si hubo voz sin texto todavía, `speechPresence`
  // neutraliza su geometría directamente en UI thread.
  const retreatingEmpty = !pressing && !hayTexto && (thinking || emptyRetreating);

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
        // La cúpula la gobierna `veiled`, derivada arriba: dedo + espera del reconocedor + envío,
        // y se retira EN EL MISMO INSTANTE en que el texto empieza a irse. Ver su docstring.
        listening={veiled}
        // Antes el dim llegaba a 100% mientras `captureRef` todavía preparaba el fotograma: la
        // entrada empezaba con un flash gris de pantalla completa. Ahora dim y menisco nacen juntos.
        // Va con las MISMAS tres señales que `listening`: que discreparan fue el origen de tres
        // defectos distintos, siempre por el mismo sitio.
        dimmed={veiled}
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
                // Mientras se dicta manda lo que llega en vivo; ya enviado, lo que quedó dicho; en
                // reposo, NADA. La regla entera vive en `transcript-stage` — ver `enPantalla`.
                text={enPantalla}
                // La salida NO cuelga del telón: la frase se queda `TEXT_HOLD_MS` para poder leerse.
                visible={!textLeaving}
                // El brillo recorre la frase exactamente mientras el agente trabaja.
                shimmer={curtain}
                isDark={isDark}
                onHeightChange={trackTranscriptHeight}
              />
            </View>

            {/* ⭐ UNA SOLA INSTANCIA, y ahora también una sola CONDICIÓN: mientras el orbe esté
                vivo, se ve. Sin píldora que lo sustituya no queda nada que arbitrar, así que la
                visibilidad vuelve a ser lo que siempre debió ser — `active`, a secas.

                `thinking` cubre el ciclo ENTERO: desde que sueltas (aún cerrando la sesión de voz)
                hasta que el telón se levanta con la respuesta puesta. Es un solo estado continuo,
                que es como se lee «estoy ocupado»; trocearlo lo convertiría en parpadeo. */}
            <OrbSphere
              size={frame.size}
              visible={orbActive}
              thinking={thinking || curtain}
            />
          </View>
        }
        // ⭐ EL PLIEGUE RESPIRA CON TU VOZ. `pulse` existía en el modelo desde el patrón y le pasaba
        // 0 fijo; ahora lleva el volumen real del micrófono, así que la deformación late con lo que
        // dices en vez de con un reloj. Es la diferencia entre un efecto que ACOMPAÑA y uno que se
        // limita a estar puesto.
        pulse={level}
        touchPressure={touchPressure}
        transcriptInfluence={transcriptInfluence}
        speechPresence={speechPresence}
        retreating={retreatingEmpty}
        veilColor={isDark ? VEIL_DARK : VEIL_LIGHT}
      />

    </View>
  );
}
