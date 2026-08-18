import { useEffect, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Pressable, type ScrollView, Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import Animated, {
  Easing,
  withDelay,
  withSequence,
  withSpring,
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { AndroidHoldPopover } from "@/components/ui/android-hold-popover";
import { useReduceMotion } from "../../components/use-reduce-motion";
import { useWheelAutoplay } from "./use-wheel-autoplay";
import { cardPalette } from "@/components/ui/basket-product-card";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import {
  CategoryIndicator,
  INDICATOR_BASELINE,
  INDICATOR_WIDTH,
} from "./category-indicator";

import {
  CIRCLE_SIZE,
  angleForSlot,
  arcFor,
  headerBlockHeight,
  initialRotation,
  maxRotation,
  VISIBLE_SLOTS,
} from "../arc-geometry";
import { POP_BACK_AT } from "../search-choreography";
import { categoryImage, fallbackInitial } from "../category-images";

// LA RULETA DE CATEGORÍAS: una rueda que gira sobre la elipse del header.
//
// No es un carrusel que desliza en horizontal. Cada categoría viaja POR EL ARCO —sube por un
// costado, barre el fondo de la panza y vuelve a subir por el otro—, que es lo que hace que el
// header y las categorías se lean como UNA pieza. La mecánica del giro vive en `angleForSlot`.
//
// ⚠️ EL GESTO LO MUEVE UN `ScrollView` HORIZONTAL NATIVO, y esa decisión costó dos intentos:
//
// Antes esto era un `PanResponder`, y arrastrar era poco fiable —había que insistir varias veces,
// sobre todo empezando encima de un círculo— porque el gesto se negociaba en el sistema de
// responders de JS: los `Pressable` de las categorías reclaman el toque al posarse el dedo, y el
// `ScrollView` vertical de la pantalla competía por el mismo movimiento. Hubo que apagarle el
// scroll a la pantalla a mano, que es justo la señal de que el diseño estaba mal.
//
// Los rails de producto de esta MISMA pantalla («Mejores ofertas», «Productos») nunca tuvieron ese
// problema: son `ScrollView` horizontales, y iOS resuelve horizontal-contra-vertical entre
// reconocedores NATIVOS, sin pasar por JS. Uno anidado en otro simplemente funciona.
//
// Así que la rueda es eso: un `ScrollView` horizontal invisible cuyo desplazamiento SE TRADUCE a
// giro. Las categorías van dentro de su contenido y se recolocan contra el desplazamiento, de
// forma que reciben sus toques como cualquier hijo de una lista. Se gana gratis: enganche
// inmediato y fiable, inercia y frenado nativos, imantado a la ranura, y convivencia con el scroll
// vertical sin una sola línea de negociación.
//
// LOS CÍRCULOS NO LLEVAN NOMBRE DEBAJO. El nombre aparece en un popover al mantener oprimido, que
// es el gesto que esta app ya usa para lo mismo en las píldoras del chat.

/** Cuánto hay que arrastrar para avanzar una ranura. Cerca de lo que separa dos círculos en
 *  horizontal (~73pt), para que el dedo y la rueda vayan a la par. */
const STEP = 78;

/**
 * EL REBOTE DE ENTRADA de cada categoría.
 *
 * MUELLE y no curva, y con `damping` bajo a propósito: lo que se quiere aquí SÍ es un rebote — el
 * círculo llega, se pasa un pelo y se asienta. Es el mismo lenguaje que la entrada de los rails
 * (`rise-in`), para que la pantalla se monte con UNA voz y no con dos.
 */
const POP = { damping: 11, stiffness: 190, mass: 0.8 } as const;
/** Entre un círculo y el siguiente. */
const POP_STAGGER = 55;
/**
 * Tope del escalonado.
 *
 * REBOTAN TODAS las categorías, pero el retardo deja de crecer pasado este puesto: sin tope, con
 * catorce categorías la última esperaría casi un segundo — una cola larguísima y encima invisible.
 */
const POP_MAX_STEP = 6;

/**
 * ⚠️ EL ESCALONADO SE CUENTA DESDE LA RANURA VISIBLE, NO DESDE EL ÍNDICE DEL ARRAY.
 *
 * Era un defecto de verdad cuando la rueda ABRÍA POR EL MEDIO: con catorce categorías las cuatro
 * visibles eran los índices ~5 a ~8, así que escalonando por el índice crudo y con tope en 7, dos de
 * ellas caían en el MISMO retardo y entraban a la vez — justo las que el usuario mira. La escalera
 * existía… fuera de la pantalla.
 *
 * Hoy la rueda abre por la PRIMERA (ver `initialRotation`), así que `start` vale 0 y esto coincide
 * con el índice crudo. Se conserva igualmente: la ranura de partida es una decisión de producto que
 * ya cambió una vez, y contando desde la primera VISIBLE la escalera se ve donde tiene que verse
 * sea cual sea esa decisión.
 */
function popSlot(index: number, start: number): number {
  "worklet";
  return Math.max(0, Math.min(Math.abs(index - start), POP_MAX_STEP));
}

/**
 * Una pizca de desorden, para que la escalera no suene a metrónomo.
 *
 * DETERMINISTA a partir del índice, nunca `Math.random()`: con un aleatorio de verdad cada render
 * daría un retardo distinto y la misma categoría entraría en un momento diferente cada vez. Esto
 * desordena, que es lo que se pidió, sin dejar de ser reproducible.
 */
const popJitter = (index: number) => (index * 37) % 26;

/**
 * LA SALIDA de cada categoría: CRECE UN PELO Y SE VA.
 *
 * Ese pequeño estirón antes de encogerse es lo que se lee como «rebote» — en animación se llama
 * ANTICIPACIÓN, y es lo mismo que hace un cuerpo al agacharse antes de saltar. Encogerse a secas se
 * ve como que el círculo se apaga; con la anticipación se ve como que se retira.
 *
 * ⚠️ NO se usa un muelle para irse: `withSpring(0)` con poco amortiguamiento se pasa de 0 hacia
 * NEGATIVO, y una escala negativa VOLTEA la imagen. Aquí se quiere un rebote controlado, así que se
 * escribe a mano con dos tramos.
 */
const POP_OUT_UP = 1.12;
const POP_OUT_UP_MS = 90;
const POP_OUT_MS = 170;
/** Entre una categoría y la siguiente al salir. Más corto que al entrar: irse no se saborea. */
const POP_OUT_STAGGER = 35;
/** Espera a que el verde del header esté pintado: los círculos aparecen SOBRE algo, no a la vez
 *  que su fondo. */
const POP_DELAY = 120;

/** Desde qué ángulo empieza a desvanecerse una categoría, y dónde termina de irse. Sin el
 *  desvanecido, la que entra aparecería de golpe en el canto de la pantalla. */
const FADE_FROM = 46;
const FADE_TO = 69;

/** A qué altura sobre el fondo de la panza cae la LÍNEA de las rayas. Medido en la referencia. */
const INDICATOR_LIFT = 15;

const DEEP_GREEN = "#034842";

export interface ArcCategory {
  slug: string;
  name: string;
}

interface CategoryArcProps {
  categories: readonly ArcCategory[];
  /** Ancho de la pantalla. Manda sobre TODA la geometría — ver `arc-geometry`. */
  width: number;
  /** Cambiarlo REPITE la aparición: volver del buscador se siente como llegar a la pantalla. */
  replay?: number;
  /** Volviendo del buscador: los círculos caen sobre una elipse que todavía BAJA. Ver `POP_BACK_AT`. */
  returning?: boolean;
  /** True mientras se busca: las categorías se retiran ANTES que la elipse. */
  away?: boolean;
  onSelect: (slug: string) => void;
}

export function CategoryArc({ categories, width, replay, away, returning, onSelect }: CategoryArcProps) {
  const arc = arcFor(width);
  // LA BANDA OCUPA EL HEADER ENTERO, de arriba abajo. Antes empezaba en el canto del círculo en
  // reposo para no tragarse los toques de los botones, y eso RECORTABA la rueda: al girar, las
  // categorías de los costados suben por el arco y se salían por el techo de la banda, cortadas en
  // seco contra un borde recto.
  // Ahora los controles del header (volver, buscador, carrito, campana) se dibujan DESPUÉS de la
  // rueda, así que quedan por encima y se llevan sus toques igual. La banda puede ocuparlo todo, y
  // las categorías suben enteras.
  const bandHeight = headerBlockHeight(width);
  const limit = maxRotation(categories.length);
  const start = initialRotation(categories.length);

  // Giro en RANURAS, derivado del desplazamiento del `ScrollView`. Es la única fuente: no hay un
  // contador propio que pueda desincronizarse de lo que el dedo hizo.
  // Referencia a la lista, para colocarla en su sitio en cuanto el contenido tenga tamaño.
  const listRef = useRef<ScrollView>(null);
  const placed = useRef(false);

  const rotation = useSharedValue(start);
  const scrollX = useSharedValue(start * STEP);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollX.value = e.contentOffset.x;
    rotation.value = e.contentOffset.x / STEP;
  });

  const reduceMotion = useReduceMotion();

  // Y GIRA SOLA un par de pasos, para enseñar que se desliza. Se apaga al primer toque — ver el hook.
  /**
   * EL BARRIDO MUEVE LA LISTA CON SU `scrollTo` NATIVO. Toscamente, y a propósito.
   *
   * ⚠️ AQUÍ HUBO UN INTENTO QUE SALIÓ MAL Y CONVIENE QUE QUEDE ESCRITO. Para poder gobernar la
   * VELOCIDAD del deslizamiento —que en el camino nativo la decide iOS— se animó a mano: un
   * `withTiming` sobre un valor compartido y una `useAnimatedReaction` empujando la lista con el
   * worklet `scrollTo`, fotograma a fotograma.
   *
   * Funcionaba… y SECUESTRABA LA RUEDA. Esta lista tiene `snapToInterval` y `decelerationRate`
   * rápido, o sea un motor de imantado que quiere decidir dónde parar; un desplazamiento
   * programático continuo pelea contra él en cada fotograma, y mientras dura el barrido —trece
   * segundos— el dedo no consigue hacerse con la lista. El usuario lo describió como no poder
   * «salir de ese bucle», que es exactamente lo que era.
   *
   * ⭐ LA LECCIÓN: un control que no suelta el gesto está roto, por bonito que se mueva. La
   * velocidad se resigna; el gesto no se negocia. Y resultó que no hacía falta: lo que da el ritmo
   * no es lo despacio que viaje sino la PAUSA al llegar (ver `WHEEL_PAUSE_MS`).
   */
  const stopTimers = useWheelAutoplay({
    glideTo: (x) => listRef.current?.scrollTo({ x, animated: true }),
    step: STEP,
    from: start,
    limit,
    enabled: categories.length > VISIBLE_SLOTS,
    reduceMotion,
  });

  /**
   * EL DEDO MANDA — y «el dedo» es cualquier señal de intención, no sólo arrastrar.
   *
   * Se llama desde el arrastre, desde el toque en la banda Y desde elegir una categoría. Ese último
   * faltaba: tocar un círculo es la intención más clara que hay, y aun así el barrido seguía
   * girando debajo del dedo.
   */
  const stopAutoplay = () => {
    stopTimers();
  };

  // EL TIC DE LA RULETA — el mismo lenguaje que el selector de fecha de iOS: un golpecito seco cada
  // vez que la rueda pasa por una categoría.
  //
  // Sale de una REACCIÓN al giro y no del manejador del dedo, y esa es la diferencia entre que se
  // sienta como una rueda o como un botón: al soltar, la inercia nativa sigue girando sola, y es
  // ahí donde el tic cuenta las categorías que van pasando.
  const tick = () => {
    void Haptics.selectionAsync();
  };
  useAnimatedReaction(
    () => Math.round(rotation.value),
    (current, previous) => {
      // `previous` es null en la primera pasada: sin esta guarda, la rueda daría un golpecito sola
      // nada más aparecer la pantalla.
      if (previous !== null && current !== previous) runOnJS(tick)();
    },
  );

  // El nombre, que ya no vive debajo del círculo: aparece al mantener oprimido.
  //
  // Se usa el popover en JS en las DOS plataformas, no el nativo de iOS: `expo-ios-popover` cuelga
  // su propio reconocedor de long-press de la vista que envuelve, y acá esa vista vive dentro de
  // una lista que desplaza. Dos dueños del mismo gesto es exactamente lo que `pill-hold-popover`
  // documenta que NO hay que hacer.
  const [held, setHeld] = useState<{ label: string; x: number; y: number } | null>(null);

  // Sin categorías no hay rueda. Y hace falta salir ANTES de montar la lista: `contentOffset` sólo
  // se aplica al montarla, así que si se montara vacía se quedaría clavada en la primera categoría
  // cuando por fin llegasen los datos.
  if (categories.length === 0) return null;

  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: bandHeight }}>
      {/* EL INDICADOR VA ANTES QUE LA RUEDA, y ese orden ES la decisión: el hermano que se dibuja
          después queda por delante, así que la categoría que cruza el centro le pasa POR ENCIMA en
          vez de esconderse detrás. Solaparlo es lo correcto — la que cruza es lo que el usuario está
          moviendo, y va al frente. Con todas las categorías a la vista no aparece: prometería un
          giro que no lleva a ninguna parte. */}
      {limit > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: arc.cx - INDICATOR_WIDTH / 2,
            // Se coloca por la LÍNEA de las rayas, no por el borde del lienzo: el lienzo lleva
            // aire alrededor para que el trazo grueso no se recorte, y medir contra su borde
            // dejaría el indicador descolgado.
            top: arc.centerY - INDICATOR_LIFT - INDICATOR_BASELINE,
          }}
        >
          <CategoryIndicator rotation={rotation} limit={limit} />
        </View>
      ) : null}

      <Animated.ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // EL DEDO MANDA: en cuanto toca, el giro automático se apaga y no vuelve.
        onScrollBeginDrag={stopAutoplay}
        onTouchStart={stopAutoplay}
        // Imantado a la ranura + frenado corto: es la receta de un selector, no la de una lista
        // libre. Al soltar, la rueda se para SIEMPRE con una categoría en su sitio.
        snapToInterval={STEP}
        decelerationRate="fast"
        // Abre por la PRIMERA categoría — ver `initialRotation`.
        //
        // Se coloca cuando el CONTENIDO YA TIENE TAMAÑO, no con `contentOffset`: esa prop se aplica
        // al montar, cuando el contenido todavía mide 0, así que el desplazamiento se recorta a 0 y
        // las categorías se quedaban fuera de pantalla por la derecha —la rueda salía vacía—.
        // No parpadea: los valores compartidos ya arrancan en la ranura del medio, así que el
        // primer fotograma se pinta donde toca.
        ref={listRef}
        onContentSizeChange={(contentWidth) => {
          if (placed.current || contentWidth <= width) return;
          placed.current = true;
          listRef.current?.scrollTo({ x: start * STEP, animated: false });
        }}
        style={{ flex: 1 }}
        // El contenido es puro RECORRIDO: una tira vacía tan larga como ranuras haya que girar. Las
        // categorías no se colocan en el flujo de la lista —se posan en el arco— así que van
        // absolutas encima y se recolocan contra el desplazamiento.
        contentContainerStyle={{ width: width + limit * STEP, height: bandHeight }}
      >
        {categories.map((cat, index) => (
          <WheelItem
            key={cat.slug}
            category={cat}
            index={index}
            arc={arc}
            rotation={rotation}
            scrollX={scrollX}
            replay={replay}
            away={away}
            returning={returning}
            start={start}
            // Elegir una categoría también apaga el barrido: es la intención más clara que hay, y
            // sin esto la rueda seguía girando bajo el dedo mientras se navegaba.
            onSelect={(slug) => {
              stopAutoplay();
              onSelect(slug);
            }}
            onHold={setHeld}
          />
        ))}
      </Animated.ScrollView>

      <AndroidHoldPopover
        visible={held !== null}
        anchor={{ x: held?.x ?? 0, y: held?.y ?? 0, width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
        label={held?.label ?? ""}
      />
    </View>
  );
}

function WheelItem({
  category,
  index,
  arc,
  rotation,
  replay,
  away,
  returning,
  start,
  scrollX,
  onSelect,
  onHold,
}: {
  category: ArcCategory;
  index: number;
  arc: ReturnType<typeof arcFor>;
  rotation: SharedValue<number>;
  /** Cambiarlo repite el rebote de entrada. Ver `home-screen`. */
  replay?: number;
  /** Volviendo del buscador: los círculos caen sobre una elipse que todavía BAJA. Ver `POP_BACK_AT`. */
  returning?: boolean;
  /** True mientras se busca: las categorías se retiran antes que el resto del header. */
  away?: boolean;
  /** Ranura por la que abre la rueda. De aquí sale el escalón — ver `popSlot`. */
  start: number;
  scrollX: SharedValue<number>;
  onSelect: (slug: string) => void;
  onHold: (held: { label: string; x: number; y: number } | null) => void;
}) {
  const ref = useRef<View>(null);
  const image = categoryImage(category.slug);
  // LA MISMA superficie que el esqueleto de las tarjetas —blanca en claro—, no un pastel por
  // categoría. Los pasteles se probaron y competían: catorce tonos distintos girando sobre el verde
  // se leían como confeti, y encima el disco de espera cambiaba de color al llegar su ilustración.
  // Con una superficie única, el disco es un HUECO y la ilustración es lo único que aporta color.
  const { colorScheme } = useColorScheme();
  const surface = cardPalette(colorScheme === "dark" ? "dark" : "light").shell;
  // 0 mientras el PNG se decodifica, 1 cuando ya se puede enseñar.
  // EL REBOTE DE ENTRADA — lo hacen TODAS las categorías, no sólo las visibles: girando la rueda
  // justo después, las de los lados también han llegado rebotando y la pantalla se lee entera con
  // el mismo lenguaje. Lo que SÍ tiene tope es el retardo — ver `POP_MAX_STEP`.
  //
  // `useReduceMotion` se consulta AQUÍ y no se recibe por prop: es una preferencia del sistema, no
  // un dato del padre, y pasarla obligaría a cablearla por toda la ruleta.
  const reduceMotion = useReduceMotion();
  const animates = !reduceMotion;
  const pop = useSharedValue(animates ? 0 : 1);
  useEffect(() => {
    if (!animates) {
      pop.value = 1;
      return;
    }
    if (away) {
      // SE VAN PRIMERO, antes de que la elipse empiece a subir: el header se vacía y LUEGO se
      // retira. Al revés, las categorías se irían montadas en algo que ya se está yendo y no se
      // vería ninguna de las dos cosas.
      pop.value = withDelay(
        popSlot(index, start) * POP_OUT_STAGGER + popJitter(index),
        withSequence(
          withTiming(POP_OUT_UP, { duration: POP_OUT_UP_MS }),
          withTiming(0, { duration: POP_OUT_MS, easing: Easing.in(Easing.cubic) }),
        ),
      );
      return;
    }
    // Se reinicia a 0 antes de animar, o repetir no movería nada.
    pop.value = 0;
    // EL RETARDO CAMBIA SEGÚN DE DÓNDE SE VENGA, y no es un capricho.
    //
    // En la carga normal de la pantalla el verde YA ESTÁ pintado y quieto: basta `POP_DELAY` para
    // que los círculos no aparezcan a la vez que su propio fondo. Volviendo del buscador no hay
    // fondo puesto —la elipse está BAJANDO—, así que se espera a que vaya por la mitad del viaje y
    // los círculos caen sobre ella en pleno vuelo. Así el verde y las categorías llegan como UNA
    // cosa. Esperando a que la elipse se posara, se leía como una tercera animación que empieza
    // cuando la anterior acabó — y eso es exactamente lo que se sentía interminable.
    pop.value = withDelay(
      (returning ? POP_BACK_AT : POP_DELAY) + popSlot(index, start) * POP_STAGGER + popJitter(index),
      withSpring(1, POP),
    );
    // `replay` en las dependencias: volver del buscador repite el rebote. Ver `home-screen`.
  }, [animates, index, start, pop, replay, away, returning]);

  const ready = useSharedValue(0);
  const revealStyle = useAnimatedStyle(() => ({ opacity: ready.value }));

  // La posición sale del ÁNGULO en cada fotograma, en el hilo de UI. Por eso `angleForSlot` es un
  // worklet: calcularlo en JS haría que la rueda fuese a tirones.
  const style = useAnimatedStyle(() => {
    const angle = angleForSlot(index - rotation.value);
    const rad = (angle * Math.PI) / 180;
    const x = arc.cx + arc.r * Math.sin(rad);
    const y = arc.cy + arc.r * Math.cos(rad);
    const over = (Math.abs(angle) - FADE_FROM) / (FADE_TO - FADE_FROM);
    return {
      transform: [
        // Se SUMA el desplazamiento porque la categoría vive DENTRO del contenido que se desplaza:
        // el contenido la arrastra hacia la izquierda, y esto la devuelve a donde manda el arco.
        // Sin el término, las categorías se irían con la tira y saldrían de la pantalla.
        { translateX: x - CIRCLE_SIZE / 2 + scrollX.value },
        { translateY: y - CIRCLE_SIZE / 2 },
        // EL REBOTE de entrada. El muelle sobrepasa 1 y vuelve, así que el círculo «aterriza» —
        // ver `POP`. Termina EXACTAMENTE en 1: nada se queda pequeño.
        { scale: pop.value },
      ],
      // Sólo la opacidad del ARCO, la que apaga a los que salen por los costados. La entrada no
      // añade transparencia: el rebote ya dice que llegó, y un fundido encima los dejaba pálidos.
      opacity: 1 - Math.min(1, Math.max(0, over)),
    };
  });

  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0 }, style]}>
      <Pressable
        ref={ref}
        accessibilityRole="button"
        accessibilityLabel={category.name}
        onPress={() => onSelect(category.slug)}
        // Mantener oprimido enseña el nombre. Se mide EN EL MOMENTO y no al montar: el círculo se
        // mueve con la rueda, así que una posición guardada antes estaría vieja.
        onLongPress={() =>
          ref.current?.measureInWindow((x, y) => onHold({ label: category.name, x, y }))
        }
        onPressOut={() => onHold(null)}
        style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
      >
        {image ? (
          // LA ILUSTRACIÓN SE FUNDE SOBRE SU PASTEL, no aparece de golpe.
          //
          // Son 17 PNG de ~150 KB y el sistema los decodifica cuando puede, así que al entrar
          // aparecían de una en una, a tirones, sobre un hueco vacío. Ahora debajo hay SIEMPRE un
          // disco del pastel de esa categoría —el sitio nunca está vacío— y la ilustración se
          // revela encima en cuanto está lista. Lo que era un goteo pasa a ser un relevo.
          <View style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}>
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: CIRCLE_SIZE,
                height: CIRCLE_SIZE,
                borderRadius: CIRCLE_SIZE / 2,
                borderCurve: "continuous",
                backgroundColor: surface,
              }}
            />
            <Animated.Image
              source={image}
              onLoad={() => {
                ready.value = withTiming(1, { duration: 260 });
              }}
              style={[{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }, revealStyle]}
              resizeMode="contain"
            />
          </View>
        ) : (
          // Respaldo para las categorías cuya ilustración todavía no exportaron: la inicial sobre
          // la misma superficie que las demás, así que no canta como una pieza distinta.
          <View
            style={{
              width: CIRCLE_SIZE,
              height: CIRCLE_SIZE,
              borderRadius: CIRCLE_SIZE / 2,
              borderCurve: "continuous",
              backgroundColor: surface,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 24, color: DEEP_GREEN }}>
              {fallbackInitial(category.name)}
            </Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
