import { View } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";

import { ProductPhoto } from "@/components/ui/product-photo";

import { hasCarousel, pageAt } from "../gallery";

interface Props {
  images: string[];
  /**
   * El ref del scroll horizontal, para que las FLECHAS puedan mover la galería.
   *
   * Va como prop normal y no por `forwardRef`: un `AnimatedRef` no encaja en el `Ref<T>` que
   * `forwardRef` declara, y forzarlo con un cast escondería el desajuste en vez de resolverlo.
   */
  scrollRef: AnimatedRef<Animated.ScrollView>;
  width: number;
  height: number;
  /** El desplazamiento horizontal, PUBLICADO: los puntos y las flechas cuelgan de él. */
  offsetX: SharedValue<number>;
  /**
   * Dónde se ha quedado el carrusel al terminar un deslizamiento.
   *
   * ⚠️ Sin esto, deslizar a mano y DESPUÉS tocar una flecha te devuelve a la página vieja: el punto
   * activo se deriva del desplazamiento y va bien, pero las flechas necesitan saber desde dónde
   * están contando. Es el único sitio donde el índice cruza al hilo de JS, y sólo al asentarse —no
   * en cada fotograma.
   */
  onSettle: (page: number) => void;
}

/**
 * Las fotos del producto, deslizables, con su indicador de página.
 *
 * ⭐ **El paginado lo hace la PLATAFORMA** (`pagingEnabled`), no un gesto propio. Es el mismo
 * argumento que el imán del plegado: iOS calcula el destino proyectado del deslizamiento dentro del
 * gesto, y cualquier cosa que escribamos nosotros pelea contra su motor de deceleración en vez de
 * colaborar con él.
 *
 * ⭐ Sólo las FOTOS. El indicador de página vive fuera (`GalleryDots`), en el hueco entre la tarjeta
 * y el nombre del producto: ahí ocupa sitio en el flujo, y por eso no puede dibujarse desde aquí
 * —desde dentro de la tarjeta sólo podría flotar sobre la imagen—.
 */
export function ProductGallery({
  images,
  scrollRef,
  width,
  height,
  offsetX,
  onSettle,
}: Props) {
  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      offsetX.value = e.contentOffset.x;
    },
    onMomentumEnd: (e) => {
      runOnJS(onSettle)(pageAt(e.contentOffset.x, width, images.length));
    },
  });

  // Un producto sin foto: el marcador de posición, sin carrusel ni puntos que prometan nada.
  if (images.length === 0) {
    return (
      <View style={{ width, height }}>
        <ProductPhoto uri={null} fallbackSize={56} />
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        // Con una sola foto el deslizamiento se apaga: dejarlo activo permite arrastrar y que
        // rebote, que se lee como que había algo más y no llegó.
        scrollEnabled={hasCarousel(images.length)}
      >
        {images.map((uri) => (
          <View key={uri} style={{ width, height }}>
            <ProductPhoto uri={uri} fallbackSize={56} />
          </View>
        ))}
      </Animated.ScrollView>

    </View>
  );
}

