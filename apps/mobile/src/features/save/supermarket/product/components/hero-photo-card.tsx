import { useCallback, useRef } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import SquircleView from "react-native-fast-squircle";

import { CascadeItem } from "@/components/ui/cascade-item";

import { STEPS as Step } from "../motion/entrance";
import {
  galleryControlsOpacity,
  galleryLift,
  galleryOpacity,
} from "../motion/gallery-collapse";
import { hasCarousel, stepPage } from "../gallery";
import { CARD_SHADOW } from "../product-palette";
import { GalleryArrows } from "./gallery-arrows";
import { GalleryDots } from "./gallery-dots";
import { ProductGallery } from "./product-gallery";

interface Props {
  /** Las fotos del producto, ya resueltas y ordenadas — ver `galleryOf`. */
  images: string[];
  /** Ancho de la tarjeta. Lo decide la pantalla, que es quien sabe cuánto mide. */
  width: number;
  /** Alto. NO es cuadrada: el mock la da 302×322, un pelo más alta que ancha. */
  height: number;
  /** Dónde se posa su canto superior en reposo, en coordenadas de PANTALLA. */
  top: number;
  /** El desplazamiento del scroll, para que la tarjeta viaje con el contenido. */
  scrollY: SharedValue<number>;
  /** Cuánto scroll dura el plegado entero. Se deriva de la pantalla — ver `collapseDistance`. */
  distance: number;
  /**
   * Cuánto sube el contenido por el ENCOGIMIENTO del header, aparte del scroll.
   *
   * La tarjeta vive fuera del `ScrollView`, así que ese desplazamiento no le llega solo — hay que
   * dárselo. Sin él, su hueco reservado sube más rápido que ella y el nombre del producto acaba
   * leyéndose por debajo de la foto.
   */
  headerShrink: number;
  cascade: SharedValue<number>;
}

/**
 * La tarjeta blanca de la foto, montada sobre el verde del header.
 *
 * ⭐ **Vive FUERA del scroll, y es la ÚNICA pieza que cruza el verde del header.** Todo lo demás
 * pasa por debajo de la elipse. Dentro del `ScrollView` esto era imposible —el header es hermano
 * suyo y ningún z-index de un hijo le gana—, y subir el contenedor entero habría subido también el
 * título y el precio, que deben quedarse debajo.
 *
 * ⭐⭐ **No se recorta contra nada.** Sale por el borde FÍSICO de la pantalla, conservando sus
 * esquinas redondas. Se probó recortarla contra dos cantos distintos y las dos veces se vio lo
 * mismo: la tarjeta AMPUTADA, con el canto superior recto. Lo que la hace desaparecer es el
 * desvanecido tardío — ver `PHOTO_FADE`, primero el movimiento y después la desaparición.
 *
 * ⭐⭐ **Al salirse del flujo pierde el arrastre de la lista, y son DOS las causas que hay que
 * devolverle**: el dedo (`scrollY`) y lo que el header encoge (`headerShrink`), porque el
 * `ScrollView` es hermano del header y su techo sube cuando el verde se compacta. Con una sola, su
 * hueco reservado subiría más rápido que ella y el nombre del producto se leería por debajo de la
 * foto. Ver `galleryLift`.
 *
 * El hueco que deja en el flujo lo reserva `ProductSummary` con un espaciador del mismo alto; su
 * canto inferior y el techo de ese contenido son LA MISMA LÍNEA, y el plegado entero se calcula
 * para que las dos aterricen juntas sobre el canto del verde compacto.
 */
export function HeroPhotoCard({
  images,
  width,
  height,
  top,
  scrollY,
  distance,
  headerShrink,
  cascade,
}: Props) {
  // ⭐ Sólo VIAJA y se apaga. No encoge: en la secuencia de referencia la tarjeta conserva su
  // tamaño en los seis fotogramas, y con razón — un `scale` compite con el desplazamiento y lo que
  // se lee entonces es un zoom, no una superficie que sale por arriba. Lo que hace visible el
  // plegado es el recorte contra el canto de la pantalla, no un truco de escala.
  const travel = useAnimatedStyle(() => ({
    opacity: galleryOpacity(scrollY.value, distance),
    transform: [{ translateY: galleryLift(scrollY.value, distance, headerShrink) }],
  }));

  // ⭐ UN solo reloj para flechas y puntos, calculado aquí y no en cada uno: con dos `useDerivedValue`
  // idénticos coincidirían hoy y se separarían en cuanto alguien afinara uno.
  const controlsFade = useDerivedValue(() => galleryControlsOpacity(scrollY.value, distance));

  // El desplazamiento horizontal de la galería, PUBLICADO: de él cuelgan el punto activo y el
  // estado de las dos flechas. Un solo número, leído desde el hilo de UI.
  const offsetX = useSharedValue(0);
  const galleryRef = useAnimatedRef<Animated.ScrollView>();
  // El índice en JS, sólo para que las FLECHAS sepan a dónde ir. El punto activo NO lo usa: ése se
  // deriva del desplazamiento, que es lo que impide que discrepen.
  const page = useRef(0);

  const step = useCallback(
    (delta: number) => {
      const next = stepPage(page.current, delta, images.length);
      page.current = next;
      galleryRef.current?.scrollTo({ x: next * width, animated: true });
    },
    [galleryRef, images.length, width],
  );

  return (
    <Animated.View
      // `box-none`: el contenedor no intercepta nada, pero sus hijos —las flechas y el
      // deslizamiento de la galería— sí reciben el dedo.
      pointerEvents="box-none"
      style={[
        { position: "absolute", top, left: 0, right: 0, alignItems: "center", zIndex: 3 },
        travel,
      ]}
    >
      <CascadeItem progress={cascade} index={Step.Photo}>
        {/* La TARJETA, no la foto: esquina muy redonda y una sombra corta, sin canto. Es lo que la
            levanta del verde lo justo para leerse por delante sin parecer que flota suelta. */}
        <SquircleView
          // ⭐⭐ SUAVIZADO AL MÁXIMO (1), no el de Apple.
          //
          // `borderCurve: "continuous"` —que es literalmente el `RoundedCornerStyle.continuous` de
          // iOS— da el 60% que Figma documenta como su preset de iOS, y a este radio la diferencia
          // contra una esquina circular son un par de puntos: se SIENTE, no se ve. Aquí el diseño
          // quiere que se vea, y `borderCurve` no tiene escala intermedia (sólo `circular` o
          // `continuous`), así que el suavizado tiene que venir de fuera.
          //
          // ⭐ `react-native-fast-squircle` y no `react-native-squircle-view` (que también está
          // instalada): ésta es un componente NATIVO DE FABRIC —trae `codegenConfig` con
          // `componentProvider`— y funciona en iOS y Android. La vieja usa `requireNativeComponent`
          // de la arquitectura antigua y su único uso vive en una rama que en iOS 26 nunca corre.
          //
          // ⚠️ Lleva código nativo: después de instalarla hay que `expo prebuild` + rebuild.
          cornerSmoothing={1}
          style={{
            width,
            height,
            borderRadius: 37,
            // SIN canto. La tarjeta ya se despega del fondo con su sombra, y un borde gris encima
            // le dibujaba un recuadro que la leía como un recorte pegado en vez de como una
            // superficie apoyada.
            backgroundColor: "#FFFFFF",
            // El recorte del carrusel lo respeta el componente nativo, que es media razón para
            // haberlo elegido: una máscara SVG por encima de un `ScrollView` sí costaría.
            overflow: "hidden",
            boxShadow: CARD_SHADOW,
          }}
        >
          <ProductGallery
            scrollRef={galleryRef}
            images={images}
            width={width}
            height={height}
            offsetX={offsetX}
            // Deslizar a mano también mueve el índice de las flechas; si no, tocar una después de
            // deslizar te devolvería a la página vieja.
            onSettle={(p) => {
              page.current = p;
            }}
          />
        </SquircleView>
        {/* Los puntos, en el HUECO entre la tarjeta y el nombre del producto. Dentro de la foto
            flotaban sobre la imagen; aquí ocupan sitio, y ese alto lo reserva el flujo a través de
            `dotsBand` — ver `collapseDistance`. */}
        {hasCarousel(images.length) ? (
          <GalleryDots
            count={images.length}
            offsetX={offsetX}
            pageWidth={width}
            fade={controlsFade}
          />
        ) : null}
      </CascadeItem>

      {/* Las flechas van FUERA de la tarjeta —a los costados de la pantalla— pero DENTRO de este
          contenedor, que es lo que les da gratis el desvanecido del plegado en su misma posición. */}
      {hasCarousel(images.length) ? (
        <GalleryArrows
          count={images.length}
          offsetX={offsetX}
          pageWidth={width}
          fade={controlsFade}
          onStep={step}
        />
      ) : null}
    </Animated.View>
  );
}
