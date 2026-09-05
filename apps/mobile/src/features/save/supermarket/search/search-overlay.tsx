import { X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColorScheme } from "nativewind";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";

import SearchIcon from "@/assets/carrusel-save/search-icon.svg";
import { saveBgFor } from "../../save-background";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassField } from "@/components/ui/glass-field";
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value";
import { useNavHideStore } from "@/store/nav-hide-store";
import { useRecentSearchesStore } from "@/store/recent-searches-store";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { useSearchSuggestions } from "../../api";
import {
  BAR_DOWN_AT,
  BAR_TRAVEL_MS,
  STAGE,
} from "../search-choreography";
import { ShimmerSkeleton } from "../../components/shimmer-skeleton";
import { useReduceMotion } from "../../components/use-reduce-motion";
import { CascadeItem } from "./cascade-item";
import { SearchRow } from "./search-row";
import { ROW_HEIGHT, searchRowsSkeletonShapes } from "./search-skeleton-layout";

// EL BUSCADOR ABIERTO: la hoja que sube desde donde estaba la píldora y se queda arriba.
//
// No navega a ningún sitio, y ESA es la decisión de fondo. Antes tocar el buscador te dejaba en la
// rejilla de categorías, o sea: para buscar había que ATRAVESAR una pantalla que no habías pedido.
// Ahora buscar ocurre DONDE ESTABAS — el mismo gesto que hace Instagram, y por la misma razón:
// buscar es una intención pasajera, y una intención pasajera no merece un cambio de contexto.
//
// LA CONTINUIDAD ES LO QUE LO VENDE. La píldora no aparece arriba: SUBE hasta arriba desde el punto
// exacto donde el dedo la tocó (`fromY`, medido por el llamador). Un elemento que se teletransporta
// obliga a buscarlo de nuevo con la vista; uno que viaja se sigue solo, y al cerrarse vuelve a su
// sitio, así que nunca se pierde el hilo de dónde se estaba.

/** Alto de la píldora. El MISMO que el de la home, o el viaje no se leería como el mismo objeto. */
const SEARCH_H = 52;
/**
 * Sangría lateral. 14, LA MISMA que la home (`home-screen`), y tiene que serlo: la píldora que
 * viaja se apoya exactamente encima de la de reposo, así que un punto de diferencia se ve como un
 * tirón lateral al arrancar y al aterrizar.
 */
const GUTTER_X = 14;
/** Hueco entre la píldora y el botón de cerrar. */
const CLOSE_GAP = 10;
/** El gris de la home en claro. El mismo valor, porque es literalmente el mismo suelo. */
const BG_LIGHT = "#F4F4F4";
/** Diámetro del botón de cerrar. El MISMO que los del header — es la misma familia de controles. */
const CLOSE_BUTTON = 48;
/** Cuántas filas fantasma se enseñan mientras llega la respuesta. */
const SKELETON_ROWS = 6;
/**
 * Aire entre la barra ya posada y «Recientes».
 *
 * Eran 18 y se veía el título ROZANDO el buscador — con el `scale: 0.98` de la cascada, además, el
 * título entra un pelo más alto de donde acaba, y ese pelo se comía lo poco que había. 26 deja el
 * hueco que la referencia enseña y da sitio al movimiento sin que nada se toque.
 */
const CONTENT_GAP = 26;

// ── LA COREOGRAFÍA ────────────────────────────────────────────────────────────
//
// CUATRO relojes con papeles separados. No es sobreingeniería: cada uno tiene que empezar cuando
// el anterior ya casi terminó, y con un solo `progress` compartido eso no se puede expresar.
//
//   t=0     `sheet`   el telón cubre la home            (120ms)
//   t=0     `lift`    la barra SUBE                     (380ms)  ← protagonista
//   t=300   `squeeze` la barra se ESTRECHA y sale la X  (200ms)
//   t=400   `cascade` «Recientes» y las filas, en escalera
//
// LA REGLA QUE ORDENA TODO: nada se dibuja donde la barra TODAVÍA ESTÁ. El contenido se posiciona
// contra el sitio FINAL de la barra, así que mientras ella viaja ese sitio está ocupado — si el
// contenido apareciera antes, se le echaría encima. Pasó, y se veía «Recientes» TOCANDO el
// buscador. Por eso `cascade` no arranca hasta que `lift` va por sus tres cuartas partes.

// LAS CURVAS.
//
// `ENTER` — «emphasized» de M3, la SIMÉTRICA: arranca suave, coge velocidad y frena al llegar.
//
// Estuvo en «emphasized decelerate» (`0.05, 0.7, 0.1, 1`), que sale a velocidad máxima desde el
// primer fotograma. Esa curva es la correcta para algo que ENTRA DESDE FUERA de la pantalla, pero
// aquí la barra ya está a la vista y quieta: salir disparada desde el reposo se lee como un tirón,
// no como fluidez. Con la simétrica el arranque tiene rampa —el ease-in que faltaba— y el
// aterrizaje conserva su frenada.
const ENTER = Easing.bezier(0.2, 0, 0, 1);
/**
 * `LEAVE` — «emphasized» de M3, simétrica: arranca suave, coge velocidad y frena al llegar.
 *
 * ⚠️ AQUÍ HAY UNA DECISIÓN QUE MERECE EXPLICARSE, porque el reverso LITERAL sería otra cosa. El
 * espejo matemático de `ENTER` es `bezier(0.9, 0, 0.95, 0.3)` —«accelerate»—, que llega a su
 * destino a MÁXIMA velocidad: un frenazo seco justo en el punto que más se mira, el aterrizaje.
 *
 * Lo que hace que el cierre se lea como «deshacer» no es la curva: es que recorra EL MISMO CAMINO,
 * entre los MISMOS extremos y en el MISMO tiempo. Eso sí es idéntico. La curva simétrica conserva
 * la reversibilidad espacial y además aterriza suave, que es lo que se pidió.
 */
const LEAVE = Easing.bezier(0.2, 0, 0, 1);
/** El asentamiento de la compresión: un ajuste fino, no un viaje. */
const SETTLE = Easing.out(Easing.cubic);

// ── LA TIMELINE, EN UN SOLO SITIO ─────────────────────────────────────────────
//
// Abrir = recorrerla hacia ADELANTE. Cerrar = recorrerla hacia ATRÁS. Los dos sentidos salen de
// esta misma tabla, así que no pueden separarse con el tiempo: tocar un número cambia los dos.

/** Cuánto DURA cada tramo. `lift` dura lo mismo en los dos sentidos y eso NO es negociable: es el
 *  mismo viaje, y una vuelta más corta se leería como una retirada, no como deshacer. */
/**
 * EL PRIMER ACTO ES DEL HEADER, y la hoja espera.
 *
 * 520ms = lo que tarda la ÚLTIMA categoría en irse del todo: la más rezagada arranca hacia los
 * ~250 (escalón + desorden) y su salida dura otros 260. Estuvo en 320 —el momento en que empieza a
 * subir la elipse— y la barra seguía adelantándose: subía con categorías todavía dentro del verde.
 *
 * La elipse SÍ arranca en 320 (`HEADER_AWAY_DELAY` en `home-screen`): ella puede empezar a subir en
 * cuanto quedan pocas, porque las arrastra consigo. La barra no: es la protagonista del segundo
 * acto y no puede pisar al primero.
 */
// (`STAGE` vive ahora en `search-choreography`, junto a los demás tiempos que la hoja y la pantalla
// tienen que acordar. Estuvo aquí duplicado y se desincronizó — ver el encabezado de ese módulo.)

const DUR = {
  /**
   * LARGO a propósito, ya no es un corte.
   *
   * Nació como un telón instantáneo porque no había nada que mirar debajo. Ahora sí lo hay —el
   * header retirándose— y taparlo de golpe se comía justo la parte interesante. A 420ms el fondo se
   * llena POCO A POCO mientras el header termina de irse, que es lo que se pidió.
   */
  sheet: 420,
  lift: BAR_TRAVEL_MS,
  squeeze: 200,
  /** La cascada sale MÁS RÁPIDA de lo que entra, y es lo correcto: al entrar cada fila se presenta
   *  —hay algo que leer—; al salir ya no hay nada que mirar, y estirarlo se lee como indecisión.
   *  El ORDEN sí se respeta: la escalera se deshace de abajo arriba (ver `cascade-item`). */
  cascadeIn: 620,
  cascadeOut: 240,
} as const;

/** CUÁNDO empieza cada tramo al ABRIR. */
const OPEN_AT = {
  /**
   * ⚠️ NADA DE LA HOJA EMPIEZA EN CERO, y ése era el defecto.
   *
   * El primer acto NO es del buscador: es del HEADER. Las categorías se retiran una a una con su
   * rebote y sólo entonces la elipse empieza a subir (ver `HEADER_AWAY_DELAY` en `home-screen`).
   * Con la barra arrancando en t=0 se adelantaba a todo eso: llegaba arriba con el verde y las
   * categorías todavía en su sitio, y las tres cosas parecían no tener nada que ver entre sí.
   *
   * Esperando a `STAGE`, la barra sube EXACTAMENTE cuando el header se aparta y el fondo se va
   * llenando — los tres a la vez, que es lo que se lee como «la pantalla se reorganiza».
   */
  sheet: STAGE,
  lift: STAGE,
  /** Al 79% del viaje: la barra ya casi se posó, así que estrecharse se lee como continuación del
   *  mismo gesto y no como una animación nueva. */
  squeeze: STAGE + 300,
  /** Con la barra ya en su sitio. Antes de esto, su hueco todavía está ocupado. */
  cascade: STAGE + 400,
} as const;

/**
 * CUÁNDO empieza cada tramo al CERRAR — el orden inverso al de la apertura.
 *
 * El cuerpo se va primero, la barra se ensancha, y sólo entonces baja: la barra no empieza el viaje
 * mientras todavía cambia de ancho. Aterriza en `BAR_LANDS_AT` (380 + 380 = 760), y el telón NO la
 * espera — se va desde los 200 para que la home reaparezca durante el descenso, no después.
 *
 * ⚠️ FUERA DE ESTE ARCHIVO PASA ALGO MÁS EN ESOS MISMOS MILISEGUNDOS: el header verde y su ruleta
 * bajan CON la barra, desde `BAR_DOWN_AT` y durante lo mismo (ver `search-choreography`). No se
 * coordinan por un aviso de esta hoja sino por el reloj compartido, y eso es deliberado: colgarlo
 * de `onClosed` —que avisa cuando la barra YA aterrizó— era justo el defecto que se corrigió.
 */
/** Recorrido mínimo. Ver `travel`: sin él, una medida mala convierte el viaje en una aparición. */
const MIN_TRAVEL = 56;

const CLOSE_AT = {
  cascade: 0,
  squeeze: 200,
  lift: BAR_DOWN_AT,
  /**
   * ⚠️ EL TELÓN SE VA **ANTES** QUE LA BARRA, Y ANTES QUE ELLA EMPIECE.
   *
   * Estuvo en 640 —esperando a que la barra aterrizara— y se veía mal, con razón: el fondo aguantaba
   * SÓLIDO durante todo el descenso y luego se esfumaba de golpe al final. Dos sucesos donde debería
   * haber uno, y el último es un corte.
   *
   * Arranca en 200 —antes incluso de que la barra empiece a bajar— y se desvanece despacio: la home
   * va reapareciendo MIENTRAS todo lo demás sucede. Adelantarlo es lo que hace visible la entrada
   * de la pantalla de detrás, que ahora se lanza en el propio toque. Un solo suceso, sin corte final.
   */
  sheet: 200,
} as const;



interface SearchOverlayProps {
  visible: boolean;
  /**
   * Dónde está la píldora en reposo, en coordenadas de VENTANA. De aquí sale el viaje: la copia de
   * la hoja arranca justo encima de la original, así que el relevo entre las dos es invisible.
   */
  fromY: number;
  placeholder: string;
  onClose: () => void;
  /**
   * Enviar: lleva a la rejilla con la búsqueda puesta.
   *
   * Tocar una sugerencia también pasa por aquí, con el NOMBRE del producto. No hay pantalla de
   * detalle en la app —`app/(tabs)/save/` no tiene ruta de producto—, así que enviar a un detalle
   * inexistente sería un callejón; la rejilla filtrada por ese nombre enseña ese producto y sus
   * hermanos de otra marca o tamaño, que es lo que se está comparando.
   */
  onSubmit: (query: string) => void;
  /**
   * La hoja terminó de irse.
   *
   * Existe por el RELEVO: la home esconde su píldora mientras esta hoja vive, o se verían LAS DOS a
   * la vez —pasó, y era exactamente lo que hacía que la animación se leyera mal—. Devolverla en
   * cuanto se pulsa cerrar la haría aparecer DEBAJO de la copia que todavía está bajando; hay que
   * esperar a que la copia llegue y desaparezca. Ese instante es éste.
   */
  onClosed: () => void;
  /**
   * La barra ya casi aterrizó y el telón casi se fue: es el momento de que la pantalla de detrás
   * REPITA su entrada.
   *
   * ⚠️ POR QUÉ NO VALE `onClosed`: aquél se dispara cuando TODO terminó, así que la home se quedaba
   * un instante quieta y su animación arrancaba después, como un segundo suceso. Se notaba, y el
   * usuario lo reportó. Los dos movimientos tienen que solaparse: la home empieza a montarse
   * MIENTRAS la barra termina de bajar, y así se lee como una sola transición.
   *
   * Se dispara EN EL TOQUE, no a mitad del descenso: las dos animaciones duran, así que lanzarlas
   * juntas es lo único que hace que terminen juntas. Ver `close`.
   */
  onReturning: () => void;
}

export function SearchOverlay({
  visible,
  fromY,
  placeholder,
  onClose,
  onSubmit,
  onClosed,
  onReturning,
}: SearchOverlayProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const insets = useSafeAreaInsets();
  const { width, height: windowH } = useWindowDimensions();
  const reduceMotion = useReduceMotion();

  // El fondo de la hoja es EL MISMO que el de la home, no un gris propio: la hoja sustituye a la
  // pantalla, así que abrirla no puede cambiar el color del suelo. En oscuro se pregunta por el
  // valor del degradado ARRIBA (fracción 0), que es donde se apoya.
  const sheetBg = saveBgFor(isDark);
  const text = isDark ? "#FFFFFF" : "#034842";
  // Los del compositor del chat: sobre vidrio, el gris al 45% de antes se hunde. `muted` viste el
  // marcador de posición Y las filas secundarias de la lista, así que el cambio va a las dos.
  const muted = isDark ? "#6A6A6A" : "#BEC2C0";
  /** El cursor y la selección, del chat: lima sobre oscuro, verde de marca sobre claro. */
  const cursor = isDark ? "#DEFFB7" : "#034842";
  const iconColor = isDark ? "#C2FB7E" : "#034842";

  const inputRef = useRef<TextInput>(null);
  /** ¿Hay una petición de foco pendiente? La arma la apertura, la consume el `onLayout` del campo. */
  const wantsFocus = useRef(false);
  const [query, setQuery] = useState("");
  // MONTADO ≠ VISIBLE: al cerrar hay que seguir dibujando hasta que la píldora termine de bajar. Sin
  // este desdoble, cerrar hace desaparecer la hoja de golpe y el viaje de vuelta no existe.
  const [mounted, setMounted] = useState(visible);

  const recents = useRecentSearchesStore((s) => s.recents);
  const restored = useRecentSearchesStore((s) => s.restored);
  const restore = useRecentSearchesStore((s) => s.restore);
  const removeRecent = useRecentSearchesStore((s) => s.remove);

  // Lo tecleado, ya quieto. 220ms: por debajo se dispara una consulta a media palabra y por encima
  // la lista se siente perezosa. El campo NO espera —se pinta al instante—, sólo espera la RED.
  const settled = useDebouncedValue(query, 220);
  const suggestions = useSearchSuggestions(settled);
  const typing = settled.trim().length >= 2;

  const sheet = useSharedValue(0);
  const lift = useSharedValue(0);
  const squeeze = useSharedValue(0);
  const cascade = useSharedValue(0);
  /**
   * EL RECORRIDO, EN UN SHARED VALUE — y esto NO es una preferencia de estilo: es la corrección del
   * destello que sobrevivió a los otros cuatro intentos. Se rellena más abajo, donde se calcula.
   *
   * ⚠️ `useAnimatedStyle` CONGELA EL UPDATER DE SU PRIMERA PASADA y no lo reasigna nunca
   * (`if (!animatedUpdaterData.current)` en `hook/useAnimatedStyle.js`). Cuando la vista se MONTA,
   * el estilo con el que NACE no sale del updater de este render: sale de aquel, ejecutado en ese
   * instante (`initialUpdaterRun(handle.initial.updater)` en `createAnimatedComponent/PropsFilter.js`).
   *
   * Y un worklet captura las variables JS de su clausura POR VALOR. Con `travel` como número
   * normal, el updater congelado seguía llevando el `travel` del PRIMER render de la pantalla —con
   * `fromY` todavía a 0, o sea el suelo `MIN_TRAVEL`, 56—. La barra nacía 56px bajo su sitio final:
   * ARRIBA. Un fotograma después el updater bueno corría con el recorrido real y la barra SALTABA
   * abajo. Eso es exactamente lo que se veía, y «a veces» porque es una carrera con el hilo de UI.
   *
   * Un shared value se captura por REFERENCIA: el updater congelado lee `.value` al ejecutarse y
   * obtiene el recorrido de ESTA apertura. Por eso `lift` nunca dio problema y `travel` sí — la
   * asimetría entre los dos era la firma del defecto.
   *
   * REGLA GENERAL: dentro de un `useAnimatedStyle`, todo lo que CAMBIE entre montajes tiene que
   * entrar por un shared value. Un número JS sólo vale si es constante de por vida.
   */
  const travelValue = useSharedValue(MIN_TRAVEL);

  /**
   * ⚠️ EL RESETEO OCURRE **DURANTE EL RENDER**, NO EN UN EFECTO. Aquí estaba el destello.
   *
   * Estos valores SOBREVIVEN entre aperturas: el componente no se desmonta, sólo devuelve `null`.
   * Así que si un cierre quedó a medias —o se reabrió antes de que terminara—, `lift` seguía valiendo
   * algo cercano a 1, o sea LA BARRA ARRIBA.
   *
   * Yo los plantaba en 0 dentro del `useEffect` de la animación… que corre DESPUÉS de pintar. La
   * secuencia real era:
   *
   *   1. `visible` pasa a true → se PINTA la copia con el valor viejo → aparece ARRIBA
   *   2. corre el efecto → se plantan en 0 → la copia SALTA abajo
   *   3. termina el retardo → sube
   *
   * Que es exactamente lo que se veía: «aparece arriba, vuelve abajo y entonces sube». Y pasaba
   * «a veces» porque sólo ocurre si el valor anterior no había llegado a 0.
   *
   * Mutar un shared value en el cuerpo del render es seguro —no provoca re-render, no es estado de
   * React— y es lo ÚNICO que sucede antes del primer fotograma. `cancelAnimation` además mata los
   * `withDelay` del cierre que pudieran seguir en vuelo y sobrescribirlo después.
   */
  const wasVisible = useRef(visible);
  if (visible && !wasVisible.current) {
    cancelAnimation(sheet);
    cancelAnimation(lift);
    cancelAnimation(squeeze);
    cancelAnimation(cascade);
    sheet.value = 0;
    lift.value = 0;
    squeeze.value = 0;
    cascade.value = 0;
  }
  wasVisible.current = visible;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      void restore();
      // Se ARMA la petición de foco; quien la dispara es el `onLayout` del campo — ver `focusOnce`.
      wantsFocus.current = true;
      return;
    }
    // Al cerrarse se desarma, o la próxima apertura heredaría una petición vieja.
    wantsFocus.current = false;
  }, [visible, restore]);

  /**
   * SUBIR EL TECLADO AL ABRIR. Cuesta más de lo que parece y ya falló dos veces.
   *
   * `autoFocus` no vale: enfoca en el montaje, que aquí cae dentro del arranque de la animación, y
   * iOS descarta el `becomeFirstResponder` EN SILENCIO — el campo se queda con el cursor puesto y
   * sin teclado, así que había que tocarlo otra vez.
   *
   * `requestAnimationFrame` tampoco: sigue siendo esperar por TIEMPO. Un frame puede no bastar, y
   * si basta es por casualidad.
   *
   * Lo que funciona es esperar al ESTADO REAL de la vista: `onLayout` del propio `TextInput` es la
   * señal de que la vista nativa existe y ya tiene tamaño, que es exactamente la condición que iOS
   * necesita para aceptar el foco. El `ref` de una sola vez evita repetirlo en cada relayout —
   * llamar `focus()` con el teclado ya arriba lo hace parpadear.
   */
  const focusOnce = () => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    inputRef.current?.focus();
  };

  // LA BARRA DE TABS SE APARTA mientras se busca. No es estética: la hoja cubre la pantalla y la
  // barra se quedaba FLOTANDO encima, tapando la última fila y ofreciendo salidas a otra sección
  // desde dentro de una búsqueda. Es el mismo interruptor que usa la rejilla.
  //
  // ⚠️ Se apaga al DESMONTARSE, no sólo al cerrar: una pantalla que se va dejando la barra
  // escondida se la esconde también a la siguiente, que no tiene forma de saber por qué.
  const setNavHidden = useNavHideStore((s) => s.setHidden);
  useEffect(() => {
    setNavHidden(visible);
    return () => setNavHidden(false);
  }, [visible, setNavHidden]);

  useEffect(() => {
    // ⚠️ `mounted` SE LEE PERO NO ESTÁ EN LAS DEPENDENCIAS, y aquí estaba el salto que se veía.
    //
    //
    // `mounted` lo pone OTRO efecto, así que abrir provocaba dos pasadas por aquí: la primera
    // lanzaba las animaciones y la segunda —un render después— las RELANZABA desde donde ya
    // estaban. La barra salía disparada hacia arriba y volvía a acomodarse. Un solo disparo por
    // cambio de `visible` es lo correcto: es `visible` quien manda, `mounted` sólo sirve para saber
    // cuándo dejar de dibujar.
    if (!visible && !mounted) return;
    if (reduceMotion) {
      // «Reducir movimiento» no es «animar más despacio»: es NO animar. Aparece y desaparece.
      sheet.value = visible ? 1 : 0;
      lift.value = visible ? 1 : 0;
      squeeze.value = visible ? 1 : 0;
      cascade.value = visible ? 1 : 0;
      if (!visible) {
        setMounted(false);
        onClosed();
      }
      return;
    }
    if (visible) {
      // (El estado cerrado ya quedó plantado en el cuerpo del render — ver `wasVisible`. Aquí sólo
      // se lanzan las animaciones.)
      // ABRIR: la timeline hacia ADELANTE.
      sheet.value = withDelay(OPEN_AT.sheet, withTiming(1, { duration: DUR.sheet }));
      lift.value = withDelay(
        OPEN_AT.lift,
        withTiming(1, { duration: DUR.lift, easing: ENTER }),
      );
      squeeze.value = withDelay(
        OPEN_AT.squeeze,
        withTiming(1, { duration: DUR.squeeze, easing: SETTLE }),
      );
      cascade.value = withDelay(
        OPEN_AT.cascade,
        // LINEAL a propósito: la curva de cada escalón la pone su propia ventana en
        // `cascade-item`. Metiendo aquí una segunda curva, los escalones del medio se
        // amontonarían y los de los extremos se separarían.
        withTiming(1, { duration: DUR.cascadeIn, easing: Easing.linear }),
      );
      return;
    }
    // AL CERRAR EL ORDEN SE INVIERTE: primero se va el cuerpo, luego baja la píldora, y el telón se
    // levanta el último. Cerrando todo a la vez la pantalla parpadea; escalonado, se deshace por
    // donde se hizo.
    // CERRAR: la MISMA timeline hacia ATRÁS. Cada tramo arranca cuando el anterior terminó.
    cascade.value = withDelay(
      CLOSE_AT.cascade,
      withTiming(0, { duration: DUR.cascadeOut, easing: Easing.linear }),
    );
    squeeze.value = withDelay(
      CLOSE_AT.squeeze,
      withTiming(0, { duration: DUR.squeeze, easing: SETTLE }),
    );
    // Se desvanece a lo largo de TODO el descenso, no en 120ms al final: por eso usa `DUR.lift` y
    // no `DUR.sheet`. Entrar y salir no tienen por qué durar lo mismo cuando lo que se pide es que
    // el telón ACOMPAÑE a la barra en vez de anunciarse por su cuenta.
    sheet.value = withDelay(
      CLOSE_AT.sheet,
      withTiming(0, { duration: DUR.lift, easing: LEAVE }),
    );
    // DESMONTAR es lo último: lo dispara el callback del muelle, así que la hoja vive exactamente
    // lo que dura el viaje de vuelta y ni un frame más. `onClosed` avisa a la home para que devuelva
    // su píldora justo cuando la copia ya está encima — el relevo, al revés.
    // EL VIAJE DE VUELTA: misma distancia, mismo tiempo, camino idéntico. Lo único que cambia es
    // la curva — ver `LEAVE`.
    lift.value = withDelay(
      CLOSE_AT.lift,
      withTiming(0, { duration: DUR.lift, easing: LEAVE }, (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
          runOnJS(onClosed)();
        }
      }),
    );
  }, [visible, reduceMotion, sheet, lift, squeeze, cascade, onClosed]);

  // Al cerrarse, el campo se vacía. Reabrir con lo de la vez pasada ya escrito parece un error:
  // abrir el buscador es empezar una búsqueda, no continuar la anterior — para eso está el historial.
  useEffect(() => {
    if (!visible) setQuery("");
  }, [visible]);

  /** Dónde se posa la píldora: pegada al área segura, con el mismo aire que tiene abajo. */
  const restY = insets.top + 8;
  /**
   * El recorrido.
   *
   * ⚠️ EL SUELO NO ES COSMÉTICO: si la medida llega mal —0, o la píldora por encima de `restY`— el
   * recorrido sale CERO y la barra NACE ARRIBA, sin viaje. Eso es el destello blanco en el destino
   * que aparecía «a veces». `home-search-bar` ya descarta las medidas increíbles y guarda la última
   * buena; esto es la segunda red, para que ni siquiera un caso no previsto convierta el viaje en
   * una aparición.
   */
  const travel = Math.max(MIN_TRAVEL, fromY - restY);
  // SE PUBLICA EN EL CUERPO DEL RENDER, no en un efecto — por lo mismo que el reseteo de los cuatro
  // relojes: un efecto corre DESPUÉS de pintar, y para entonces la vista ya nació en el sitio malo.
  // Aquí queda escrito antes del primer commit, que es la única ventana que sirve. Ver `travelValue`.
  travelValue.value = travel;

  // EL ANCHO TAMBIÉN VIAJA, y esto NO es un adorno: es el defecto que hacía saltar el cierre.
  //
  // Abierta, la píldora cede sitio al botón de cerrar, así que es MÁS ESTRECHA que la de reposo. Con
  // el ancho fijo, la copia aterrizaba corta y al desmontarse la original aparecía de golpe a ancho
  // completo: un salto justo en el último frame, que es donde más se nota. Interpolando el ancho con
  // el mismo reloj del viaje, la copia llega EXACTAMENTE del tamaño de la original y el relevo
  // desaparece.
  //
  // Efecto secundario y bienvenido: el botón no necesita animación de entrada propia. Vive DETRÁS
  // del canto derecho mientras la píldora es ancha, y entra deslizándose solo a medida que ella le
  // hace sitio. Es la misma verdad física que un cajón que se abre.
  const restWidth = width - GUTTER_X * 2;
  const openWidth = restWidth - CLOSE_BUTTON - CLOSE_GAP;

  /**
   * ⭐ EL DESPLAZAMIENTO VA MULTIPLICADO POR `lift`, NO POR `(1 - lift)`, Y ESO ES LA CORRECCIÓN.
   *
   * La barra se MAQUETA ya en la píldora (`top: restY + travel`, abajo) y sube RESTANDO. Antes se
   * maquetaba arriba y bajaba sumando, que es lo mismo… salvo en el fotograma del montaje.
   *
   * ⚠️ POR QUÉ IMPORTA: escribir un shared value desde el hilo de JS no escribe, ENCOLA —
   * `scheduleOnUI(() => { mutable.value = newValue })`, en `mutables.js` de reanimated—. El hilo de
   * UI lo aplica DESPUÉS. Así que `travelValue.value = travel`, aunque esté en el cuerpo del render,
   * NO está puesto cuando la vista se monta en ese mismo commit: se lee la SEMILLA del
   * `useSharedValue`, o sea `MIN_TRAVEL`. Con la fórmula vieja eso daba `(1-0) * 56 = 56`: la barra
   * nacía 56px bajo el techo, pegada al notch. Medido en la captura del usuario: 56pt clavados.
   *
   * Con ésta, en el montaje `lift.value` vale 0 y el producto es CERO venga el recorrido puesto o
   * no. **Un valor rancio multiplicado por cero es cero.** La barra descansa donde la maquetación
   * la pone —la píldora— y el recorrido sólo se necesita cuando el reloj ya se mueve, que es
   * cuando el hilo de UI hace tiempo que aplicó la escritura.
   *
   * Y por eso fallaba SÓLO LA PRIMERA VEZ: tras la primera apertura el valor ya está aplicado en el
   * hilo de UI, así que las siguientes leían el recorrido bueno aunque la escritura siguiera
   * llegando tarde.
   */
  const barStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -lift.value * travelValue.value }],
  }));
  // EL ANCHO SIGUE A `squeeze`, NO A `lift`. Antes compartían reloj y la barra se estrechaba
  // MIENTRAS subía: dos cosas a la vez que se leen como una sola cosa mal hecha. Separados, la
  // secuencia es sube → se asienta → se estrecha, y cada gesto se entiende.
  //
  // Y aquí SÍ valen números JS —`restWidth`/`openWidth`— pese a la regla de `travelValue`, porque
  // cumplen su condición: la app está bloqueada en vertical (`orientation: "portrait"` en
  // `app.json`), así que `width` se fija en el primer render y no cambia en toda la vida del
  // proceso. Si algún día se permitiera rotar, estos dos tendrían que pasar por un shared value.
  const pillStyle = useAnimatedStyle(() => ({
    width: restWidth + (openWidth - restWidth) * squeeze.value,
  }));
  const sheetStyle = useAnimatedStyle(() => ({ opacity: sheet.value }));
  // EL CUERPO SÓLO SE DESPLAZA — NO se le anima la opacidad, y no es un descuido.
  //
  // ⚠️ ALPHA COMPOSITING FUERA DE PANTALLA. iOS aplica la opacidad de GRUPO: si una vista con varios
  // hijos tiene `opacity < 1`, tiene que dibujar TODO ese subárbol en un búfer aparte y componerlo
  // después, en CADA fotograma. Aquí el subárbol es la lista entera a pantalla completa —cabecera,
  // doce filas con su disco, su texto y su «x»—, o sea el peor caso posible. La documentación de
  // React Native lo dice explícito: evitar el compositing alfa fuera de pantalla, sube la carga de
  // GPU.
  //
  // `translateY` NO tiene ese coste: es una transformación que la GPU aplica a la capa ya dibujada,
  // sin búfer intermedio. Y dice lo mismo —«esto acaba de llegar»— porque debajo el telón ya está
  // opaco, así que no hace falta fundir sobre nada.
  // El contenedor de la lista NO se anima: cada fila entra por su cuenta desde `cascade`. Animar
  // el contenedor ADEMÁS sería movimiento doble, y encima obligaría a componer todo el subárbol
  // fuera de pantalla en cada fotograma.
  const bodyStyle = useAnimatedStyle(() => ({ opacity: cascade.value > 0 ? 1 : 0 }));
  // El botón sólo se FUNDE; su movimiento se lo da el ancho de la píldora.
  //
  // ⚠️ NO SE ESCALA, y no es pereza: la skill del botón de vidrio lo dice explícito — escalar un
  // ANCESTRO de un `GlassView` nativo distorsiona y satura el vidrio. El envoltorio de este botón
  // es exactamente eso, así que aquí sólo puede ir opacidad.
  // La X sale CON la compresión: es el hueco que la barra acaba de liberar el que la trae. Escala
  // corta (0.7→1) porque el vidrio nativo se distorsiona si se escala de más su envoltorio.
  const closeStyle = useAnimatedStyle(() => ({
    opacity: squeeze.value,
    transform: [{ scale: 0.7 + squeeze.value * 0.3 }],
  }));

  // ⚠️ TODOS LOS HOOKS VAN ANTES DEL `return null` DE ABAJO. Puestos después se ejecutarían sólo
  // cuando la hoja está abierta, y React aborta con «Rendered more hooks than during the previous
  // render» en cuanto se cierra. Pasó al añadir estos dos.
  //
  // `useCallback` para que las filas memoizadas no se invaliden en cada tecla: un callback nuevo por
  // render tira por tierra la memo de `SearchRow`.
  const submit = useCallback(
    (value: string) => {
      Keyboard.dismiss();
      onSubmit(value);
    },
    [onSubmit],
  );

  // MEMOIZADO: construye 18 objetos y se recalculaba EN CADA RENDER —o sea, en cada tecla— aunque
  // el esqueleto ni siquiera esté en pantalla. Sólo depende del ancho: cambia al rotar y nunca más.
  const skeleton = useMemo(
    () => searchRowsSkeletonShapes({ width, gutter: 0, rows: SKELETON_ROWS }),
    [width],
  );

  // SE PINTA EN EL MISMO COMMIT EN QUE SE ABRE, no un frame después.
  //
  // ⚠️ ESTE ERA EL PARPADEO. La guarda decía `if (!mounted)`, y `mounted` se pone en un efecto —o
  // sea, DESPUÉS de pintar—. Como la home esconde su píldora en el mismo frame del toque, quedaban
  // uno o dos frames con un HUECO donde estaba la píldora, y la copia aparecía luego de golpe.
  // Mirando `visible` además de `mounted`, la copia ya está dibujada —quieta, encima de la
  // original— en el frame del toque, y el relevo vuelve a ser invisible.
  if (!visible && !mounted) return null;

  const close = () => {
    Keyboard.dismiss();
    // LA PANTALLA DE DETRÁS ARRANCA YA, en el mismo gesto — no a mitad del descenso.
    //
    // Se probó avisando por la POSICIÓN de la barra (a dos tercios del viaje, luego a un tercio) y
    // las dos veces se seguía leyendo tarde. La razón es que las dos animaciones DURAN: la cascada
    // de la home tarda ~570ms, así que arrancándola a mitad del descenso todavía estaba montándose
    // cuando la barra ya se había posado. Lanzadas a la vez, terminan a la vez.
    //
    // Parte de la entrada de la home ocurre bajo el telón, y está bien: por eso el telón ahora
    // empieza a irse antes (ver `CLOSE_AT.sheet`), así que lo que se tapa es sólo el arranque.
    onReturning();
    onClose();
  };

  const items = suggestions.data ?? [];
  // Sólo es «cargando» cuando NO hay nada que enseñar. Con `placeholderData` las sugerencias de la
  // tecla anterior siguen en pantalla mientras llega la siguiente, y taparlas con un esqueleto sería
  // cambiar contenido bueno por un hueco.
  const loading = typing && suggestions.isLoading && items.length === 0;

  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
      {/* LA HOJA. Opaca, no un velo: lo de detrás ya no es tocable ni relevante, y dejarlo entrever
          invita a intentar tocarlo. */}
      <Animated.View
        style={[
          { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: sheetBg },
          sheetStyle,
        ]}
      />

      {/* LA PÍLDORA QUE VIAJA. Va por encima de la hoja y por debajo de nada. */}
      <Animated.View
        style={[
          {
            position: "absolute",
            // SE MAQUETA YA EN LA PÍLDORA, y sube restando. `travel` es un número JS normal
            // recalculado en cada render y aplicado por la maquetación de RN, así que en el
            // montaje SIEMPRE es el bueno — no pasa por el hilo de UI ni por una clausura
            // congelada. Es la mitad quieta de la corrección; la otra está en `barStyle`.
            top: restY + travel,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: GUTTER_X,
          },
          barStyle,
        ]}
      >
        {/* Ancho EXPLÍCITO y animado, no `flex: 1`: con flex el ancho lo decide la fila y no se
            puede interpolar, que es justo lo que hacía saltar el cierre. Ver `pillStyle`. */}
        {/* ⚠️ EL ANCHO SE ANIMA EN EL ENVOLTORIO, NO EN EL CRISTAL, y no es un capricho de estructura.
            Para que una placa de vidrio crezca hay que animar ancho/alto como VALORES DE LAYOUT
            REALES; una `transform: scale` la rasteriza y la deja saturada y granulosa. Animando el
            contenedor, el `GlassField` de dentro se re-dispone cada fotograma, que es exactamente
            lo que el material necesita. */}
        <Animated.View style={pillStyle}>
          <GlassField
            radius={SEARCH_H / 2}
            contentStyle={{
              height: SEARCH_H,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 18,
              gap: 10,
            }}
          >
          <SearchIcon width={26} height={26} color={iconColor} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => submit(query)}
            placeholder={placeholder}
            placeholderTextColor={muted}
            cursorColor={cursor}
            selectionColor={cursor}
            returnKeyType="search"
            autoCorrect={false}
            // Aquí se pide el teclado: cuando la vista nativa ya existe y tiene tamaño. Ver
            // `focusOnce` — es la única condición bajo la que iOS acepta el foco de forma fiable.
            onLayout={focusOnce}
            accessibilityLabel={placeholder}
            className="flex-1"
            // `alignSelf: "stretch"` para que el campo ocupe el alto entero de la píldora: con el
            // centrado de la fila era tan alto como su texto, y el dedo no lo encontraba cerca de
            // los cantos. Mismo arreglo que en la píldora de reposo y en la rejilla.
            style={{ alignSelf: "stretch", fontFamily: KANTUMRUY_MEDIUM, fontSize: 16, color: text }}
          />
          </GlassField>
        </Animated.View>

        {/* CERRAR es el MISMO botón de vidrio del carrito y del volver, en rojo: en esta pantalla
            es la única salida, y darle la forma que ya tienen los controles del header hace que se
            reconozca sin leerlo. El rojo dice que deshace, no que continúa.

            ⚠️ NO se escala el `GlassButton` desde un ancestro —eso distorsiona y satura el vidrio
            nativo—: la escala va en ESTE envoltorio, que es su padre directo y no un ancestro del
            `GlassView`… lo mismo. Por eso el envoltorio anima OPACIDAD y la escala se queda en un
            rango corto (0.6→1), donde el vidrio aguanta sin artefactos visibles. */}
        <Animated.View style={[closeStyle, { marginLeft: CLOSE_GAP }]}>
          <GlassButton
            icon={X}
            tone="danger"
            label={t("save.supermarket.search.cancel")}
            onPress={close}
            size={CLOSE_BUTTON}
          />
        </Animated.View>
      </Animated.View>

      {/* LA LISTA. Empieza donde termina la píldora ya posada.

          ⚠️ SE DESMONTA AL CERRAR (`visible &&`), y hace falta que sea así. Dos cambios previos se
          combinaron mal: el telón pasó a irse AL FINAL —para que la home reaparezca justo cuando la
          píldora aterriza— y a la vez el cuerpo dejó de animar OPACIDAD, para no pagar compositing
          alfa fuera de pantalla. Resultado: el fondo desaparecía y las filas se quedaban OPACAS
          flotando encima de la home. Un fantasma.

          Devolverle la opacidad reintroduciría el compositing. Desmontarlo no cuesta nada y además
          es más honesto: al pulsar cerrar, esa lista ya no es relevante. Debajo el telón sigue
          opaco los primeros 80ms, así que no se ve un salto — se ve la hoja vaciarse mientras la
          píldora baja. */}
      {/* ⚠️ NO se desmonta al pulsar cerrar: eso CORTABA la cascada de salida en seco. La lista
          vive hasta que la hoja entera se desmonta (`mounted`), y mientras tanto son las propias
          filas las que se van —de abajo arriba, ver abajo—. */}
      <Animated.View
        style={[
          {
            position: "absolute",
            left: 0,
            right: 0,
            top: restY + SEARCH_H + CONTENT_GAP,
            height: windowH - (restY + SEARCH_H + CONTENT_GAP),
          },
          bodyStyle,
        ]}
      >
        <ScrollView
          // El teclado está puesto y la lista es larga: sin esto, el primer toque sólo lo baja y
          // hay que tocar dos veces para abrir una fila.
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: GUTTER_X, paddingBottom: 24 }}
        >
          {loading ? (
            /* El HUECO de las filas que vienen, con su luz recorriéndolo. Ocupa el sitio exacto
               (`search-skeleton-layout`), así que al llegar las de verdad no hay salto. */
            <ShimmerSkeleton
              shapes={skeleton.shapes}
              width={width - GUTTER_X * 2}
              height={skeleton.height}
            />
          ) : typing ? (
            items.length === 0 ? (
              <Text
                style={{
                  marginTop: 24,
                  textAlign: "center",
                  fontFamily: KANTUMRUY_MEDIUM,
                  fontSize: 14,
                  color: muted,
                }}
              >
                {t("save.supermarket.noResults")}
              </Text>
            ) : (
              items.map((product, i) => (
                <CascadeItem key={product.id} progress={cascade} index={i}>
                  <SearchRow
                    kind="suggestion"
                    title={product.name}
                    // La MARCA, no la categoría: es lo que trae el endpoint ligero del typeahead, y
                    // en un súper es además lo que de verdad desambigua —«Leche de Coco» hay cinco;
                    // «Leche de Coco · LA FAMOSA» hay una—. La categoría exigiría un campo nuevo en
                    // un DTO que comparten la web y el typeahead del chat.
                    subtitle={product.brand}
                    onPress={() => submit(product.name)}
                    removeLabel={t("save.supermarket.search.remove")}
                  />
                </CascadeItem>
              ))
            )
          ) : !restored ? (
            <ShimmerSkeleton
              shapes={skeleton.shapes}
              width={width - GUTTER_X * 2}
              height={skeleton.height}
            />
          ) : recents.length === 0 ? (
            <Text
              style={{
                marginTop: 24,
                textAlign: "center",
                fontFamily: KANTUMRUY_MEDIUM,
                fontSize: 14,
                color: muted,
              }}
            >
              {t("save.supermarket.search.noRecents")}
            </Text>
          ) : (
            <>
              {/* El título es el ESCALÓN 0: la cascada empieza por él y las filas lo siguen. */}
              <CascadeItem progress={cascade} index={0}>
                <Text
                  style={{
                    marginTop: 2,
                    marginBottom: 4,
                    fontFamily: KANTUMRUY_SEMIBOLD,
                    fontSize: 17,
                    color: text,
                  }}
                >
                  {t("save.supermarket.search.recent")}
                </Text>
              </CascadeItem>
              {recents.map((entry, i) => (
                <CascadeItem key={entry} progress={cascade} index={i + 1}>
                  <SearchRow
                    kind="history"
                    title={entry}
                    onPress={() => submit(entry)}
                    onRemove={() => void removeRecent(entry)}
                    removeLabel={t("save.supermarket.search.remove")}
                  />
                </CascadeItem>
              ))}
            </>
          )}
          {/* Aire por el alto de una fila: con el teclado puesto, la última quedaba justo en el
              canto y no se podía tocar sin bajar el teclado antes. */}
          <View style={{ height: ROW_HEIGHT }} />
        </ScrollView>
      </Animated.View>
    </View>
  );
}
