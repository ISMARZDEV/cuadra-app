import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  type LayoutChangeEvent,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
// El paquete no declara `main`: sólo expone subpaths. `anchoredEndSpace` —el prop que produce el
// anclaje— NO existe en el `LegendList` de `/react-native` (los tipos lo omiten): sólo lo acepta
// `KeyboardAwareLegendList`, que vive en `/keyboard` y arrastra react-native-keyboard-controller.
import type { LegendListRef } from "@legendapp/list/react-native";
import { KeyboardAwareLegendList, useKeyboardScrollToEnd } from "@legendapp/list/keyboard";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useColorScheme } from "nativewind";
import { type Href, useFocusEffect, useRouter } from "expo-router";

import { GlassSurface } from "@/components/ui/glass-surface";
import {
  NAVBAR_CIRCLE,
  NAVBAR_VIEWBOX,
} from "@/components/navigation/notched-glass";
import { useOrbStore } from "@/store/orb-store";
import { useDrawer } from "@/store/drawer-store";
import { useChatExpandStore } from "@/store/chat-expand-store";

import { AgentMessage } from "./components/agent-message";
import { BasketCard } from "./components/basket-card";
import { ProductCard } from "./components/product-card";
import { ProviderProductsCard } from "./components/provider-products-card";
import { ChatDock } from "./components/chat-dock";
import { ChatEmptyState } from "./components/chat-empty-state";
import { ChatHeader } from "./components/chat-header";
import { ChatInputBar } from "./components/chat-input-bar";
import { ChatSessionsSidebar } from "./components/chat-sessions-sidebar";
import { DockInteractionView } from "./components/dock-interaction-view";
// (DockInteraction type comes from the hook's `interaction` — no local mapping needed.)
import { QuickActions } from "./components/quick-actions";
import { TypingIndicator } from "./components/typing-indicator";
import { UserBubble } from "./components/user-bubble";
import { CHAT_LINE_HEIGHT } from "./chat-typography";
import { ChatRole } from "./enums";
import type { ChatMessage } from "./interfaces";
import { useChat } from "./use-chat";

// SVG gradient overlay — Figma "Siri AI" card: dark 85% at top → 18% at bottom.
function CardGradient({ isDark }: { isDark: boolean }) {
  const color = isDark ? "#000000" : "#ffffff";
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="chatCardGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="0.27" stopColor={color} stopOpacity="0.84" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#chatCardGrad)" />
    </Svg>
  );
}

// Banda superior del scroll — va DELANTE de la lista (a diferencia de CardGradient, que es un lavado
// de fondo por detrás), así el texto que sube se DESVANECE en vez de cortarse a ras del borde.
//
// No es sólo un degradado: es un **desenfoque con degradado**. El texto que asciende se difumina y
// se apaga, y eso es lo que produce la sensación de que ARRIBA HAY MÁS conversación — un corte
// limpio comunica «acá se acaba», un difuminado comunica «esto sigue». Es lo que hace ChatGPT.
//
// Receta: `MaskedView` cuyo mask es un degradado vertical (opaco arriba → transparente abajo), y
// dentro un `BlurView` más un lavado del color de la tarjeta. El mask hace que TANTO el desenfoque
// COMO el lavado se desvanezcan juntos; si sólo se pusiera el blur, su borde inferior se vería como
// una línea recta.
//
// El degradado del mask se dibuja con `react-native-svg`, NO con `expo-linear-gradient`: su vista
// nativa no se enlaza de forma fiable en el dev build (mismo motivo documentado en glass-button).
// `pointerEvents="none"`: es puramente visual, jamás bloquea toques.
// Aire entre el borde inferior del header y el primer mensaje EN REPOSO.
const TOP_CONTENT_GAP = 10;

function TopScrollFade({ isDark, height }: { isDark: boolean; height: number }) {
  const color = isDark ? "#000000" : "#ffffff";
  return (
    <MaskedView
      style={{ position: "absolute", top: 0, left: 0, right: 0, height }}
      pointerEvents="none"
      maskElement={
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="topScrollFade" x1="0" y1="0" x2="0" y2="1">
              {/* Totalmente opaco en el borde superior y ya transparente al 70%: el último tramo
                  se deja limpio para que el texto entre en foco ANTES de terminar la banda. */}
              <Stop offset="0" stopColor="#000000" stopOpacity="1" />
              <Stop offset="0.7" stopColor="#000000" stopOpacity="0.35" />
              <Stop offset="1" stopColor="#000000" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#topScrollFade)" />
        </Svg>
      }
    >
      <BlurView
        intensity={26}
        tint={isDark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      {/* El lavado del color de la tarjeta: el blur solo difumina, no APAGA. Sin esto el texto se
          vería borroso pero igual de brillante, y no leería como que se está yendo. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: color, opacity: 0.65 }]} />
    </MaskedView>
  );
}

// ── Geometría del anclaje ────────────────────────────────────────────────────
// A cuánto del borde superior de la lista se apoya el mensaje recién enviado. Pegado al borde se
// lee como si se estuviera escapando hacia arriba; con este respiro queda claramente A LA VISTA.
const ANCHOR_TOP_GAP = 12;
// Techo de la altura del mensaje ANCLADO que se posiciona en el offset: dos líneas más el aire de
// la burbuja. Un mensaje más largo se recorta por arriba en vez de empujar todo hacia abajo — es
// el criterio de la implementación de referencia. Se deriva del interlineado del chat para no
// quedar desincronizado cuando cambie la tipografía (ya pasó al bajar de 24 a 22).
const ANCHOR_MAX_SIZE = 2 * CHAT_LINE_HEIGHT + 32;

// Keyboard events — WillShow/Hide on iOS for smooth sync, Did on Android.
const KB_SHOW = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const KB_HIDE = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

// AISpace chat screen — Figma "Aispace Chat" (node 178:5090).
//
// Bottom margin is animated between three states without squishing the card:
//   • Orb hidden  → card sits 18px above the bar body top.
//   • Orb active  → card rises to clear the orb sphere.
//   • Keyboard open → card rises to sit flush on the keyboard (fills all available space).
//
// We drive this manually via Keyboard.addListener instead of KeyboardAvoidingView so the
// card SLIDES UP intact rather than being squished from the bottom.
export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const orbActive = useOrbStore((s) => s.active);
  // Expand hides the tab bar (cuadra-tab-bar.tsx) AND grows the card DOWN to reclaim that space —
  // side margins/corner radius stay exactly as-is (a full-bleed "cover everything" take didn't
  // read well, see git log; this is just "the card gets taller", not "the card becomes the screen").
  const expanded = useChatExpandStore((s) => s.expanded);
  const setExpanded = useChatExpandStore((s) => s.setExpanded);
  const listRef = useRef<LegendListRef>(null);

  // Live chat — streams turns from the agent (SSE) and stages HITL writes (§7.4).
  const chat = useChat();
  const router = useRouter();

  // ── Glass dock (collapsible panel above the input) ─────────────────────────
  // Open manually to show quick-action suggestions; auto-opens when a HITL step (`pending`) arrives
  // and auto-closes when it resolves (Figma flow). Fase 1 maps the single-step `pending` (summary +
  // approve/cancel) onto the generic {prompt, options} the dock renders; Fase 2 will emit richer
  // multi-step interactions over the same contract.
  // The dock is open when a HITL step is active OR the user manually opened the quick-actions menu.
  // Deriving it (instead of a synced state) means the dock never flashes the quick-actions during a
  // flow transition — between steps the interaction is swapped, never nulled, so it stays open.
  const [manualOpen, setManualOpen] = useState(false);
  const dockOpen = !!chat.interaction || manualOpen;
  useEffect(() => {
    if (chat.interaction) setManualOpen(false); // a flow took over the dock → drop the manual menu
  }, [chat.interaction]);

  // Height of the bottom zone (dock + input). The chat scrolls BEHIND it (so the translucent glass
  // has the chat to refract → it finally reads as glass, Figma); this height is reserved as the
  // ScrollView's bottom padding so the last message clears the overlay.
  const [bottomZoneH, setBottomZoneH] = useState(0);
  // Header's measured height — positions the TopScrollFade right where it ends (below the buttons).
  const [headerH, setHeaderH] = useState(0);

  // ── Sessions drawer ───────────────────────────────────────────────────────
  // Swipe the chat aside (or tap the header menu) to reveal the sessions sidebar. The chat card
  // slides ~80% to the right + scales down a touch; the sidebar parallaxes in behind it; the tab
  // bar slides down (handled in cuadra-tab-bar.tsx). All off the shared `drawerProgress` (0→1).
  const { progress: drawerProgress, open: drawerOpen, setOpen: setDrawerOpen } = useDrawer();
  const chatInputRef = useRef<TextInput>(null);
  const restoreKbRef = useRef(false);
  const OPEN_X = width * 0.8; // how far the chat slides → leaves a ~20% sliver (like the reference)
  const SIDEBAR_W = width * 0.82;
  const openXRef = useRef(OPEN_X);
  openXRef.current = OPEN_X;
  const dragStart = useRef(0);

  const trackDrag = (dx: number) => {
    drawerProgress.value = Math.min(1, Math.max(0, dragStart.current + dx / openXRef.current));
  };
  const settleDrag = (vx: number) => {
    const p = drawerProgress.value;
    setDrawerOpen(vx > 0.4 ? true : vx < -0.4 ? false : p > 0.5);
  };

  // Pan on the card itself. Uses the CAPTURE phase so it intercepts clearly-horizontal drags BEFORE
  // the inner ScrollView grabs them (bubble-phase PanResponder loses to a native ScrollView).
  // Vertical drags fail the check → scrolling still works.
  // LEFT-EDGE pan catcher — the card has a 10px side margin, so a rightward edge-swipe opens the
  // drawer (ChatGPT/iOS drawer gesture). This thin strip CLAIMS on touch start so the inner ScrollView
  // never competes. We do NOT put a pan responder on the whole card: horizontal swipes inside the
  // basket/product carousels must scroll freely without pulling the drawer.
  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = drawerProgress.value;
      },
      onPanResponderMove: (_, g) => trackDrag(g.dx),
      onPanResponderRelease: (_, g) => settleDrag(g.vx),
      onPanResponderTerminate: () => settleDrag(0),
    }),
  ).current;

  // Reset the drawer when the screen unmounts so the tab bar never stays hidden.
  useEffect(() => () => setDrawerOpen(false), [setDrawerOpen]);
  // Same for expand — otherwise leaving the tab while full-screen would leave the navbar hidden.
  useEffect(() => () => setExpanded(false), [setExpanded]);

  // Keyboard ↔ drawer: if you were typing and open the drawer, hide the keyboard; when you come back
  // (close the drawer or pick a session) restore the keyboard so you continue where you left off.
  useEffect(() => {
    if (drawerOpen) {
      restoreKbRef.current = chatInputRef.current?.isFocused() ?? false;
      if (restoreKbRef.current) Keyboard.dismiss();
    } else if (restoreKbRef.current) {
      restoreKbRef.current = false;
      const id = setTimeout(() => chatInputRef.current?.focus(), 280);
      return () => clearTimeout(id);
    }
  }, [drawerOpen]);

  // ── Navbar geometry (mirrors cuadra-tab-bar.tsx) ──────────────────────────
  const barWidth = Math.min(width - 24, 380);
  const navScale = barWidth / NAVBAR_VIEWBOX.width;
  const navHeight = NAVBAR_VIEWBOX.height * navScale;
  const navBottomPad = Math.max((insets.bottom || 12) - 16, 6) + 14;

  // Orb hidden: card bottom sits 18px above the bar body top (gives a visible gap).
  const barBodyHeight = navHeight * 0.54;
  const marginHidden = navBottomPad + barBodyHeight + 18;

  // Orb active: card clears the orb sphere (which can stick above the composition).
  const orbOvalWidth = NAVBAR_CIRCLE.r * 2 * navScale * 1.35;
  const orbOvalHeight = orbOvalWidth * 0.86;
  const orbTopInComp = NAVBAR_CIRCLE.cy * navScale - orbOvalHeight / 2; // may be negative
  const marginActive = navBottomPad + navHeight - orbTopInComp + 14;

  // ── Animated values ───────────────────────────────────────────────────────
  const lift = useSharedValue(orbActive ? 1 : 0);
  const keyboardH = useSharedValue(0);
  const expandLift = useSharedValue(expanded ? 1 : 0);

  // Natural ease-out curve — matches iOS system transitions (no bounce, no overshoot).
  const EASE_OUT = Easing.out(Easing.cubic);

  useEffect(() => {
    lift.value = withTiming(orbActive ? 1 : 0, {
      duration: 300,
      easing: EASE_OUT,
    });
  }, [orbActive, lift]);

  // Same 300ms curve as the tab bar's own hide animation (cuadra-tab-bar.tsx) so the card growing
  // down and the navbar sliding away read as ONE coordinated motion.
  useEffect(() => {
    expandLift.value = withTiming(expanded ? 1 : 0, { duration: 300, easing: EASE_OUT });
  }, [expanded, expandLift]);

  // Keep the latest message pinned to the bottom (WhatsApp/ChatGPT behaviour). Called when the
  // keyboard finishes animating and when the orb resizes the card, so the freshest messages are
  // never hidden behind the input as the scroll viewport shrinks.
  //
  // El seguimiento de CONTENIDO nuevo ya no se hace acá: lo hace `maintainScrollAtEnd` de
  // LegendList, que además respeta al usuario que subió a leer historial — que era exactamente lo
  // que hacía a mano el par `nearBottomRef` + `followIfAtBottom` que esto reemplazó.
  // NO es `scrollToEnd()`, y la diferencia es el bug entero.
  //
  // `KeyboardAwareLegendList` SIEMPRE suma relleno de teclado al rango scrolleable — su doc dice
  // que `keyboardLiftBehavior` sólo decide si el contenido SE LEVANTA, mientras que «the scrollable
  // range is ALWAYS extended via contentInset». Ese relleno es `max(blankSpace, alturaTeclado)`, y
  // `blankSpace` sale ÚNICAMENTE del `anchoredEndSpace` (keyboard.mjs:76-95): sin ancla viva vale 0
  // y queda el teclado entero. Medido en device: el contenido saltó de 399.9 a 734.9 con un teclado
  // de 335 — exactamente +335.
  //
  // Pero nuestra TARJETA ya sube sola con el teclado (el `marginBottom` animado, hecho a mano para
  // que DESLICE en vez de aplastarse), así que ese relleno es el teclado contado DOS VECES.
  // `scrollToEnd()` apuntaba al final del relleno: 291.9pt dentro de un vacío, llevándose la
  // conversación por encima del borde superior. Sólo se notaba con conversaciones CORTAS, porque
  // ahí el contenido real ni siquiera llena el viewport y se iba TODO.
  //
  // Descontar el fantasma da el final REAL. Si el contenido entra en el viewport el resultado es
  // negativo y se corta en 0 — que es justo «no te muevas».
  const scrollToBottom = useCallback((animated = false) => {
    const s = listRef.current?.getState();
    if (!s) return;
    // Ya NO se descuenta el alto del teclado: con `kbFreeze` la librería no añade su relleno, así
    // que `contentLength` es contenido de verdad. Restarlo ahora dejaría el scroll CORTO — los
    // últimos mensajes tapados por el input. (Compensar el fantasma fue el arreglo anterior;
    // eliminarlo es el bueno, porque un arrastre MANUAL no se puede compensar.)
    const target = Math.max(0, s.contentLength - s.scrollLength);
    void listRef.current?.scrollToOffset({ offset: target, animated });
  }, []);

  // Scroll viewport's own height (not content) — feeds ChatEmptyState's center→top dock entrance
  // (it needs to know the available space to compute where "centered" is).
  const [scrollViewportH, setScrollViewportH] = useState(0);
  const onScrollViewLayout = useCallback((e: LayoutChangeEvent) => {
    setScrollViewportH(e.nativeEvent.layout.height);
  }, []);

  // ── Anclaje tipo ChatGPT ───────────────────────────────────────────────────
  // Al enviar, el mensaje propio SUBE AL TOPE y la respuesta fluye por debajo. Lo produce
  // `anchoredEndSpace`, que mete espacio en blanco bajo el mensaje anclado cuando el contenido no
  // llena el viewport — sin ese espacio no hay a dónde scrollear para subirlo del todo. Cuando el
  // espacio llega a cero (la respuesta ya desbordó), la lista vuelve sola a "sigue-el-final".
  //
  // El índice se fija ANTES de agregar: el mensaje que se va a crear ocupará `messages.length`.
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);
  // Arranca en FALSE: mientras el ancla manda, seguir el final pelearía con ella y arrastraría el
  // mensaje fuera de vista. Sólo se enciende cuando la respuesta ya desbordó (abajo).
  const [following, setFollowing] = useState(false);
  // Guard de UNA SOLA VEZ por turno. Sin él, `onSizeChanged` dispara con tamaño 0 apenas monta
  // —antes de que haya layout— y enciende el seguimiento del final: la lista scrollea hasta
  // después de todo el espacio de cola y el mensaje recién enviado queda ARRIBA del viewport.
  // Ese fue exactamente el «sube demasiado» que se vio en el device.
  const hasOverflowedRef = useRef(false);
  // ¿La lista llegó a reportar un espacio de cola POSITIVO en este turno? Es la prueba de que ya
  // midió de verdad; hasta entonces cualquier 0 es ruido de los primeros frames, no un desborde.
  const sawAnchorSpaceRef = useRef(false);
  // ¿El ancla está SOSTENIENDO ahora mismo un mensaje arriba? Sólo entre el envío y el momento en
  // que la respuesta desborda. Fuera de esa ventana el chat es un chat normal: pegado abajo.
  const anchorHolding = anchorIndex !== null && !following;
  // Leído por el listener de teclado (más abajo) sin volver a suscribirlo en cada envío: si
  // `anchorHolding` estuviera en el arreglo de dependencias del efecto, cada turno desuscribiría
  // y resuscribiría el listener de `Keyboard` — y si un evento cae justo en esa ventana, se pierde.
  const anchorHoldingRef = useRef(anchorHolding);
  anchorHoldingRef.current = anchorHolding;

  // SOLTAR EL ANCLA AL SALIR de la pantalla. Si queda puesta, al volver la lista re-mide el espacio
  // de cola que reserva bajo el mensaje anclado y, con el seguimiento del final encendido, scrollea
  // hasta el fondo de ESE espacio: la conversación entera se va hacia arriba y desaparece. Ese era
  // el «al abrir el chat los mensajes suben».
  //
  // Va en el CLEANUP del efecto de foco (al salir), no al entrar: al entrar ya no hay ancla, y
  // limpiarla ahí no evitaría el salto de este mismo montaje.
  useFocusEffect(
    useCallback(() => {
      return () => {
        setAnchorIndex(null);
        setFollowing(false);
        hasOverflowedRef.current = false;
        sawAnchorSpaceRef.current = false;
      };
    }, []),
  );

  // EL ANCLA NO TIENE UN «SEGUNDO FINAL». Hubo aquí un efecto que la soltaba al terminar el turno
  // y era un ERROR: cuando la respuesta es CORTA el espacio de cola nunca llega a cero, y ese
  // espacio es exactamente lo que sostiene el mensaje enviado arriba. Soltarlo lo dejaba caer y
  // se perdía el anclaje entero — el efecto que se quería.
  //
  // El espacio en blanco sobrante NO es basura pendiente de limpiar: es la mitad de la función.
  // La implementación de referencia nunca borra `anchorIndex`; sólo enciende el seguimiento de la
  // cola cuando el espacio llega a cero, y si nunca llega, el mensaje se queda arriba. Punto.
  //
  // (Se había añadido creyendo que causaba el «se va todo al abrir el teclado». No era eso: era el
  // relleno fantasma del teclado, ver `scrollToBottom`. Un síntoma, dos arreglos — sobraba uno.)

  // Un arrastre MANUAL pausa el seguimiento de la cola, para poder subir a leer mientras la
  // respuesta sigue llegando sin que te devuelva de un tirón.
  //
  // Acá estaba `Keyboard.dismiss`, heredado del ScrollView, y causaba DOS síntomas con una sola
  // causa: cerraba el teclado apenas tocabas para scrollear, y ese cambio de layout interrumpía
  // el gesto a la mitad — se sentía como que el scroll estaba bloqueado. El teclado se sigue
  // pudiendo cerrar arrastrando hacia abajo (`keyboardDismissMode="interactive"`, intacto).
  const onScrollBeginDrag = useCallback(() => {
    if (hasOverflowedRef.current) setFollowing(false);
  }, []);
  // `anchoredEndSpace` sólo RESERVA el espacio de cola: no mueve la lista. El scroll que sube el
  // mensaje al tope es esta llamada. Sin ella el primer mensaje parecía funcionar —no había nada
  // que scrollear— y del segundo en adelante el ancla quedaba puesta pero nadie la subía.
  // CONGELADO SIEMPRE, y es la pieza que hace que el teclado no se cuente dos veces.
  //
  // `freeze` congela TODOS los cambios de layout que el teclado provoca en la lista: relleno,
  // inset y posición. Es exactamente lo que corresponde acá, porque de la subida con el teclado se
  // encarga NUESTRA tarjeta (el `marginBottom` animado). Sin congelar, la librería añade un
  // contentInset del alto del teclado — 335pt medidos en device — y eso es lo que dejaba arrastrar
  // el último mensaje hasta sacarlo de la pantalla: había 291.9pt de vacío que agarrar, aunque el
  // contenido real (399.9) cabía entero en el viewport (443).
  //
  // `keyboardLiftBehavior="never"` NO alcanza: sólo apaga el auto-scroll, no el relleno (su doc:
  // «the scrollable range is ALWAYS extended via contentInset»).
  const kbFreeze = useSharedValue(true);
  const { scrollMessageToEnd } = useKeyboardScrollToEnd({ listRef, freeze: kbFreeze });
  const sendAndAnchor = useCallback(
    (text: string) => {
      hasOverflowedRef.current = false;
      sawAnchorSpaceRef.current = false;
      setFollowing(false);
      const idx = chat.messages.length;
      setAnchorIndex(idx);
      chat.send(text);
      // OJO: el scroll NO se dispara acá. Va en el efecto de abajo, atado a `anchorIndex`.
    },
    [chat],
  );

  // El scroll que sube el mensaje, DESPUÉS de que el ancla nueva ya está aplicada.
  //
  // Llamarlo dentro de `sendAndAnchor` —en la misma línea que `setAnchorIndex`— era el «rebote»:
  // React todavía no había re-renderizado, así que la lista scrolleaba con la configuración de
  // ancla ANTERIOR y el `anchorOffset` nuevo (el que reserva el alto del header) no existía aún.
  // El mensaje aterrizaba pegado al header y sólo se acomodaba cuando llegaba la respuesta y la
  // geometría se recalculaba. Atado al efecto, la lista ya conoce el ancla cuando scrollea.
  //
  // `closeKeyboard: true` es parte del anclaje, no cosmético: con el teclado abierto la tarjeta se
  // encoge y el scroll aterriza fuera de la zona visible (el mensaje sólo aparecía AL CERRARLO).
  // Sin animar el PRIMERO: no hay recorrido que mostrar y animar desde cero se ve como un tirón.
  useEffect(() => {
    if (anchorIndex === null) return;
    // `scrollMessageToEnd` descongela al terminar (pone `freeze` en false), así que hay que volver
    // a congelar: si no, a partir del primer envío la librería recupera su relleno de teclado y
    // vuelve el vacío arrastrable. El scroll SÍ funciona congelado — el propio hook congela
    // ANTES de scrollear, así está diseñado.
    void scrollMessageToEnd({ animated: anchorIndex > 0, closeKeyboard: true }).then(() => {
      kbFreeze.value = true;
    });
  }, [anchorIndex, scrollMessageToEnd, kbFreeze]);

  // Un turno = una fila. Cada rama es la MISMA que tenía el ScrollView; lo único que cambia es que
  // ahora la lista las pide de a una en vez de recibirlas todas montadas.
  const isStreaming = chat.isStreaming;
  const lastIndex = chat.messages.length - 1;
  const renderMessage = useCallback(
    ({ item, index }: { item: ChatMessage; index: number }) => {
      if (item.role === ChatRole.User) return <UserBubble text={item.text} />;
      // Canasta por presupuesto: accordion por proveedor + carrusel de productos.
      if (item.basket) return <BasketCard data={item.basket} />;
      // Resultados de búsqueda de productos: carrusel por proveedor, sin totales.
      if (item.provider_products) return <ProviderProductsCard data={item.provider_products} />;
      // La comparación de Save se pinta acá dentro, no manda al navegador.
      if (item.product) return <ProductCard data={item.product} />;
      return (
        // La fila de acciones sólo bajo una respuesta TERMINADA: cualquier mensaje que ya no es el
        // último lo está, y el último sólo cuando paró el stream.
        <AgentMessage
          text={item.text}
          href={item.href}
          showActions={index < lastIndex || !isStreaming}
        />
      );
    },
    [lastIndex, isStreaming],
  );

  useEffect(() => {
    const onShow = Keyboard.addListener(KB_SHOW, (e) => {
      // iOS reports the keyboard's own animation duration in the event — use it so the card
      // slides up in perfect sync with the keyboard.
      const dur = e.duration > 0 ? e.duration : 250;
      keyboardH.value = withTiming(e.endCoordinates.height, {
        duration: dur,
        easing: EASE_OUT,
      });
      // Sólo perseguir el fondo si YA estabas ahí (o el ancla lo sostiene arriba, que se resuelve
      // solo). Sin este guard, tocar el input para escribir mientras leías historial arriba te
      // arrastraba al final igual — perdías el lugar por el solo hecho de abrir el teclado.
      // Se lee ANTES de que la animación arranque (evento `Will`), así que refleja dónde estabas
      // parado justo antes de tocar el input, no después de que el viewport ya se encogió.
      if (anchorHoldingRef.current) return;
      const wasNearEnd = listRef.current?.getState()?.isNearEnd ?? true;
      if (!wasNearEnd) return;
      // Pin to the bottom RIGHT AFTER the viewport finishes shrinking (a single early scroll fires
      // before there's any scroll range and ends up a no-op, leaving recent messages hidden).
      // onLayout/onContentSizeChange handle the in-between frames; this settles the final position.
      // `scrollToBottom` apunta al final REAL del contenido, descontando el relleno fantasma que la
      // librería añade por el teclado — ver su definición, ahí está la medición y el porqué.
      setTimeout(() => scrollToBottom(true), dur + 20);
    });
    const onHide = Keyboard.addListener(KB_HIDE, (e) => {
      const dur = e.duration > 0 ? e.duration : 250;
      keyboardH.value = withTiming(0, { duration: dur, easing: EASE_OUT });
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [keyboardH, scrollToBottom]);

  // Same idea as the keyboard above: the orb showing/hiding resizes the card (via `lift`'s
  // marginBottom, 300ms) exactly like the keyboard does, so it needs the SAME "pin to bottom once
  // the resize settles" treatment — otherwise the conversation stays scrolled wherever it was and
  // the latest message ends up hidden behind the (now smaller or bigger) visible area.
  useEffect(() => {
    const id = setTimeout(() => scrollToBottom(true), 300 + 20);
    return () => clearTimeout(id);
  }, [orbActive, scrollToBottom]);

  // marginBottom = max(orb margin, keyboard height + gap).
  // When the keyboard is open it always wins; the gap keeps the card from sitting flush on the
  // keyboard (a small breathing space, like WhatsApp/iMessage).
  //
  // kbMargin is UNCONDITIONAL (keyboardH.value + KEYBOARD_GAP, no `> 0` branch) on purpose: a hard
  // branch on `keyboardH.value > 0` snaps to a DIFFERENT value the instant the keyboard-close
  // animation lands on exactly 0 — invisible in the normal path (orbMargin, ~100px+, always wins
  // over that final ~12px either way) but a visible "bounce" in the expanded path below, where
  // nothing else was there to mask it. Math.max() of two continuous values has no such snap.
  const KEYBOARD_GAP = 12;
  const bottomInset = insets.bottom || 0;
  const shadowStyle = useAnimatedStyle(() => {
    const orbMargin = marginHidden + lift.value * (marginActive - marginHidden);
    const kbMargin = keyboardH.value + KEYBOARD_GAP;
    const normalClosedMargin = Math.max(kbMargin, orbMargin);
    // Expanded: the tab bar is hidden, so the card doesn't need to clear it anymore — grow down to
    // just the keyboard gap, or (keyboard closed) the home-indicator inset so the input pill isn't
    // flush against it.
    const expandedClosedMargin = Math.max(kbMargin, bottomInset);
    const e = expandLift.value;
    const closedMargin = normalClosedMargin + (expandedClosedMargin - normalClosedMargin) * e;
    const p = drawerProgress.value;
    // As the drawer opens, the card slides right AND grows DOWN into the (now hidden) navbar's
    // space — same progress, so it's one coordinated motion, not navbar-then-card.
    // NOTE: translateX ONLY — do NOT add a `scale` here. The card holds native iOS-26 GlassViews
    // (the card border + the header glass buttons); scaling a GlassView makes iOS stretch the
    // rasterised liquid-glass, which saturates the tint and shows a distorted texture during the
    // animation. Translation is safe; scaling is not.
    return {
      marginBottom: closedMargin + (navBottomPad - closedMargin) * p,
      transform: [{ translateX: p * OPEN_X }],
    };
  });

  // Sidebar: parallaxes in from the left and fades up. Opacity ramps faster than the slide so it's
  // already visible while the chat is still moving (appears WITH the navbar hiding, not after).
  const sidebarStyle = useAnimatedStyle(() => {
    const p = drawerProgress.value;
    return { opacity: Math.min(1, p * 1.8), transform: [{ translateX: (1 - p) * -28 }] };
  });

  return (
    // NOTE: do NOT wrap this tree in <TouchableWithoutFeedback> — it claims the touch responder on
    // start and steals the ScrollView's vertical pan/bounce on the New Architecture. The keyboard is
    // dismissed by the ScrollView itself (keyboardDismissMode="interactive" + keyboardShouldPersistTaps).
    // Transparent → the root AppBackground gradient shows through, same as every other screen
    // (Insights / News / Config). No screen-local background here.
    <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Sessions sidebar — sits behind the card on the left, revealed as the chat slides away. */}
      <Animated.View
        pointerEvents={drawerOpen ? "auto" : "none"}
        style={[{ position: "absolute", left: 0, top: 0, bottom: 0, width: SIDEBAR_W }, sidebarStyle]}
      >
        <ChatSessionsSidebar />
      </Animated.View>

      {/* Shadow holder — no overflow:hidden on iOS or shadows are clipped. Horizontal pan here
          drives the drawer; the gesture only claims clearly-horizontal drags so vertical scroll
          still works. */}
      <Animated.View style={[styles.shadowWrap, shadowStyle]}>
        {/* Liquid Glass card with gradient border: iOS 26 → GlassView, older/Android → BlurView + SquircleView + gradient border. */}
        <GlassSurface
          // Real RN border (style) — the native GlassView honors it; its `borderWidth` PROP (the
          // fallback gradient) is a no-op on the device. This is what makes the contour visible.
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: 48,
              borderWidth: 1.5,
              borderColor: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.18)",
            },
          ]}
          intensity={5}
          borderWidth={5.5}
        >
          {/* Clips children to the 48px card radius. */}
          <View style={styles.cardClip}>
            {/* Gradient overlay — sits above blur, below content. */}
            <CardGradient isDark={isDark} />

            {/* La lista va PRIMERA y ocupa la tarjeta entera: el header la SOBREVUELA (abajo), no le
                quita alto. Esa es la diferencia estructural con ChatGPT que hacía que el texto se
                cortara a ras en vez de pasar por detrás de los botones — ningún degradado podía
                arreglarlo mientras el header fuera un hermano que ocupa espacio. */}
            <KeyboardAwareLegendList
              ref={listRef}
              className="flex-1"
              data={chat.messages}
              keyExtractor={(m: ChatMessage) => m.id}
              renderItem={renderMessage}
              // EL ANCLAJE. Sin ancla (primer render, conversación restaurada) la lista se comporta
              // como siempre. `onSizeChanged` avisa cuando el espacio de cola se consumió: ahí la
              // respuesta ya desbordó el viewport y toca volver a seguir el final.
              anchoredEndSpace={
                anchorIndex === null
                  ? undefined
                  : {
                      anchorIndex,
                      // Se mide desde el borde superior del VIEWPORT, y ahí ahora está el header
                      // sobrevolando: sin sumarlo, el mensaje anclado quedaría detrás de los
                      // botones. Es el mismo cálculo que hace la referencia (`insets.top + 56`).
                      anchorOffset: headerH + ANCHOR_TOP_GAP,
                      // Techo al espacio de cola. Sin él la lista reserva tanto blanco como haga
                      // falta y el mensaje se despega demasiado del resto de la conversación.
                      anchorMaxSize: ANCHOR_MAX_SIZE,
                      onSizeChanged: (size: number) => {
                        // El espacio de cola tuvo que ser POSITIVO al menos una vez antes de que un
                        // 0 cuente como desbordado. Sin esta condición, un 0 transitorio de los
                        // primeros frames —cuando todavía no hay layout— suelta el ancla al
                        // instante: la lista se pega al final y, con una respuesta corta, el
                        // mensaje enviado queda a media pantalla en vez de arriba. Es el mismo
                        // 0-prematuro que ya nos había mordido; el guard de una-sola-vez impedía
                        // que se repitiera, pero no que ocurriera DEMASIADO PRONTO.
                        if (size > 0) {
                          sawAnchorSpaceRef.current = true;
                          return;
                        }
                        if (!sawAnchorSpaceRef.current || hasOverflowedRef.current) return;
                        hasOverflowedRef.current = true;
                        // SÓLO se enciende el seguimiento. `anchorIndex` NO se limpia — igual que
                        // la implementación de referencia, que nunca lo borra.
                        //
                        // Borrarlo fue un error propio: si la respuesta es CORTA y el espacio de
                        // cola nunca llega a cero, ese espacio es justo lo que sostiene el mensaje
                        // enviado arriba. Quitarlo lo dejaba caer. El espacio en blanco no es un
                        // residuo a limpiar: ES la función.
                        //
                        // (Lo borré creyendo que causaba el «se va todo al abrir el teclado». No
                        // era eso: era el relleno fantasma del teclado — ver `scrollToBottom`.)
                        setFollowing(true);
                      },
                    }
              }
              // La tarjeta del chat YA sube sola con el teclado (el marginBottom animado de arriba,
              // hecho a mano para que SLIDE en vez de aplastarse). Si además levantara la lista,
              // el gesto se haría dos veces. Acá sólo se quiere el anclaje.
              keyboardLiftBehavior="never"
              // RN 0.81+ deja de acertar los toques sobre el área del contentInset / espacio de
              // cola (facebook/react-native#54123); la librería trae la solución detrás de bandera.
              applyWorkaroundForContentInsetHitTestBug
              // Congela los reajustes por teclado mientras dura el scroll del anclaje, para que no
              // compitan (viene del mismo hook que hace ese scroll).
              freeze={kbFreeze}
              // El seguimiento de la cola está ENCENDIDO por defecto —un chat vive pegado abajo— y
              // sólo se SUSPENDE mientras el ancla sostiene un mensaje arriba.
              //
              // Atarlo a `following` a secas fue un error: al ABRIR el chat no hay ancla y
              // `following` arranca en false, así que la lista se quedaba arriba del todo y la
              // conversación parecía «irse para arriba» sola. Sólo debe subir cuando VOS enviás.
              maintainScrollAtEnd={
                anchorHolding ? undefined : { on: { dataChange: true, itemLayout: true } }
              }
              // El umbral por defecto es demasiado estrecho para un stream rápido y corta el
              // seguimiento a la primera (lo documenta el propio demo de referencia).
              maintainScrollAtEndThreshold={1}
              // `false` EXPLÍCITO, no por descuido (la librería avisa en runtime si no se declara).
              // Reciclar filas mejora el rendimiento, pero acá ROMPERÍA las animaciones: la entrada
              // de la burbuja del usuario, el fade por palabra de `streaming-text` y la del
              // indicador se disparan TODAS en un `useEffect` de montaje. Una fila reciclada no se
              // remonta —se reusa con props nuevas— así que un mensaje nuevo entraría sin animar.
              // Si alguien intenta "optimizar" esto poniéndolo en true, se apagan las Fases 1 y 2.
              recycleItems={false}
              // OBLIGATORIO, y lo destapó el test de la pantalla: una lista virtualizada MEMOIZA
              // sus filas, así que un cambio que sólo vive en el closure de `renderItem` —acá
              // `isStreaming`, que decide si la última respuesta muestra la fila de acciones— no
              // llega solo. Sin esto, al terminar el stream los botones no aparecían hasta que
              // algo más forzara un re-render. Con el ScrollView el problema no existía porque
              // todas las filas se remontaban en cada render.
              extraData={isStreaming}
              ListEmptyComponent={
                <ChatEmptyState onSelect={sendAndAnchor} viewportHeight={scrollViewportH} />
              }
              ListFooterComponent={
                /* Status line while a turn is in flight (no token/pending yet) — the label shimmers
                   and says WHAT the agent is doing, which the backend announces when it starts a
                   tool. Fades out and hands off to the first agent word. */
                <TypingIndicator visible={chat.isThinking} status={chat.status} />
              }
              showsVerticalScrollIndicator={false}
              // Side gutter for the whole conversation — THE single knob for how far the text sits
              // from the card edges (each row adds its own px-3 = 12px on top, so total ≈ 22px).
              // paddingBottom reserves the overlaid bottom zone so the last message clears the glass.
              // El header SOBREVUELA la lista, así que el contenido tiene que empezar por debajo de
              // él: sin este padding el primer mensaje nacería tapado por los botones. Al scrollear,
              // en cambio, el texto SÍ pasa por detrás — que es justo el efecto buscado.
              // Top-aligned siempre (mensajes Y estado vacío); `flexGrow` mantiene el contenedor de
              // al menos un viewport de alto (no hace nada cuando ya hay con qué scrollear).
              contentContainerStyle={{
                paddingTop: headerH + TOP_CONTENT_GAP,
                paddingBottom: 8 + bottomZoneH,
                paddingHorizontal: 6,
                flexGrow: 1,
              }}
              // "handled": a tap on a HANDLER (the TextInput) focuses it in one tap and keeps the
              // keyboard; a tap on a NON-handler (a message, empty space) dismisses the keyboard.
              // This gives tap-outside-to-dismiss WITHOUT a TouchableWithoutFeedback wrapper (which
              // steals the ScrollView's pan/bounce — cuadra-mobile §6). The multi-tap was the input's
              // Pressable wrapper, removed there — not this prop.
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onScrollBeginDrag={onScrollBeginDrag}
              // Elastic rubber-band at top AND bottom even when the content fits (ChatGPT/iMessage).
              alwaysBounceVertical
              bounces
              overScrollMode="always"
              scrollEventThrottle={16}
              onLayout={onScrollViewLayout}
            />

            {/* DESPUÉS de la lista → se dibuja DELANTE de ella. Arranca en 0 (el borde de la
                tarjeta), no bajo el header: la banda tiene que cubrir la franja por la que el texto
                pasa DETRÁS de los botones. */}
            <TopScrollFade isDark={isDark} height={headerH + TOP_CONTENT_GAP} />

            {/* El header, AL FINAL y en absoluto: por encima de la lista y de la banda, así los
                botones quedan nítidos mientras el texto se difumina detrás de ellos. */}
            <View
              style={{ position: "absolute", top: 0, left: 0, right: 0 }}
              onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
            >
              <ChatHeader />
            </View>

            {/* Bottom zone — OVERLAYS the scroll (absolute, on top in z-order) so the chat shows
                through its translucent glass (Figma bleed-through). Its measured height feeds the
                ScrollView's paddingBottom above. Glass dock = quick actions (manual) or the HITL
                step (§7.4); the chevron is always visible; the body grows above the input. */}
            <View
              style={{ position: "absolute", left: 0, right: 0, bottom: 0 }}
              onLayout={(e) => setBottomZoneH(e.nativeEvent.layout.height)}
            >
              {/* Glass + tint as a FILL BACKGROUND (absoluteFill) — NOT a wrapper around the content.
                  Why: on Fabric a native GlassView that AUTO-SIZES to its children mis-anchors when
                  that content grows (the dock opening) — it re-measures from the top, so the whole
                  zone drifts up and the input detaches from the card's bottom edge (even with the
                  keyboard closed). Same proven pattern as the card itself (GlassSurface = absoluteFill
                  background; a plain-RN View sizes the container): the glass never drives the layout,
                  so the input stays glued to `bottom: 0` and the dock body grows UPWARD above it.
                  Contour: FLUSH square top (the divider that meets the chat) + bottom corners rounded
                  to the card's 48 radius so the edge continues the card. */}
              <GlassSurface
                // Real RN border (native GlassView honors it). The TOP edge is the divider between
                // the chat and the input zone (full width, above the chevron — como estaba arriba);
                // bottom corners follow the card's 48 radius so the contour continues the card.
                style={[
                  StyleSheet.absoluteFill,
                  {
                    borderWidth: 0.5,
                    borderColor: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.18)",
                    borderBottomLeftRadius: 48,
                    borderBottomRightRadius: 48,
                    overflow: "hidden",
                  },
                ]}
                intensity={50}
                borderWidth={0}
              >
                {/* Chat-dock tint — black on dark, white on light. Explicit overlay (the native
                    GlassView's own tintColor is too subtle and ignores opacity). Bump the opacity
                    values to make it stronger. Sits BEHIND the dock + input content. */}
                <View
                  pointerEvents="none"
                  style={[
                    StyleSheet.absoluteFill,
                    { backgroundColor: isDark ? "#060808" : "#FFFFFF", opacity: isDark ? 0.4 : 0.6 },
                  ]}
                />
              </GlassSurface>

              {/* Content — pure RN flow; THIS is what measures the zone height and bottom-pins the
                  input. The dock body mounts ABOVE the input and grows the zone upward; the input row
                  stays welded to the card's bottom edge. Bottom corners are clipped by the card's own
                  cardClip (radius 48), so no rounding is needed here. */}
              <ChatDock
                open={dockOpen}
                onToggle={() => {
                  if (!chat.interaction) setManualOpen((o) => !o); // chevron toggles the manual menu
                }}
              >
                {chat.interaction ? (
                  <DockInteractionView
                    interaction={chat.interaction}
                    // Tocar la tarjeta ELIGE el producto y sigue la conversación acá. Salir del chat
                    // es una decisión aparte: solo la barra lima ("ver producto") manda a Save.
                    onSelect={(opt) => {
                      void chat.select(opt, chat.interaction?.prompt);
                    }}
                    onViewProduct={(opt) => {
                      void chat.select(opt, chat.interaction?.prompt);
                      router.push("/save" as Href);
                    }}
                  />
                ) : manualOpen ? (
                  <QuickActions
                    onSelect={(prompt) => {
                      sendAndAnchor(prompt);
                      setManualOpen(false);
                    }}
                  />
                ) : null}
              </ChatDock>

              <ChatInputBar inputRef={chatInputRef} onSend={sendAndAnchor} />
            </View>

            {/* When the drawer is open the chat is just a sliver — tapping it closes the drawer. */}
            {drawerOpen ? (
              <Pressable
                accessibilityLabel="Cerrar sesiones"
                onPress={() => setDrawerOpen(false)}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
        </GlassSurface>
      </Animated.View>

      {/* Left-edge swipe zone (only while closed): a thin strip on the very edge that opens the
          drawer on a rightward edge-pan, since the card's 10px margin leaves the edge unreachable. */}
      {!drawerOpen ? (
        <View
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, zIndex: 30 }}
          {...edgePanResponder.panHandlers}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    flex: 1,
    marginHorizontal: 10,
    marginTop: 4,
    borderRadius: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  cardClip: {
    flex: 1,
    borderRadius: 48,
    overflow: "hidden",
  },
});
