import { useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import { Image, Pressable, type ScrollView, Text, View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { AndroidHoldPopover } from "@/components/ui/android-hold-popover";
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
} from "../arc-geometry";
import { categoryImage, fallbackInitial, fallbackTint } from "../category-images";

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
  onSelect: (slug: string) => void;
}

export function CategoryArc({ categories, width, onSelect }: CategoryArcProps) {
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
        // Imantado a la ranura + frenado corto: es la receta de un selector, no la de una lista
        // libre. Al soltar, la rueda se para SIEMPRE con una categoría en su sitio.
        snapToInterval={STEP}
        decelerationRate="fast"
        // Abre por la ranura de EN MEDIO — ver `initialRotation`.
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
            onSelect={onSelect}
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
  scrollX,
  onSelect,
  onHold,
}: {
  category: ArcCategory;
  index: number;
  arc: ReturnType<typeof arcFor>;
  rotation: SharedValue<number>;
  scrollX: SharedValue<number>;
  onSelect: (slug: string) => void;
  onHold: (held: { label: string; x: number; y: number } | null) => void;
}) {
  const ref = useRef<View>(null);
  const image = categoryImage(category.slug);

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
      ],
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
          <Image
            source={image}
            style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
            resizeMode="contain"
          />
        ) : (
          // Respaldo para las categorías cuya ilustración todavía no exportaron. Mismo tamaño y
          // misma familia de pasteles que las demás — ver `fallbackTint`.
          <View
            style={{
              width: CIRCLE_SIZE,
              height: CIRCLE_SIZE,
              borderRadius: CIRCLE_SIZE / 2,
              borderCurve: "continuous",
              backgroundColor: fallbackTint(category.slug),
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
