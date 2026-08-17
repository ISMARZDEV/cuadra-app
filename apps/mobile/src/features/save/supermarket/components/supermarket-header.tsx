import { ArrowLeft, ShoppingBasket } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

// La lupa con destello y la campana con su punto son los SVG de diseño, no iconos de la librería
// aproximados: los dos llevan detalles que lucide no tiene —el destello de cuatro puntas del
// buscador, el punto rojo con su velo blanco al 20% en la campana— y que se perdían al sustituirlos.
import SearchIcon from "@/assets/carrusel-save/search-icon.svg";
import NotificationsRing from "@/assets/carrusel-save/notifications-ring.svg";
import { GlassButton } from "@/components/ui/glass-button";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { headerBlockHeight, headerPath } from "../arc-geometry";
import { CategoryArc, type ArcCategory } from "./category-arc";
import { ArcSkeleton } from "./supermarket-skeletons";

// El header de la home de Supermarket: el verde con el canto arqueado, su fila de controles, la
// ubicación, la campana y el carrusel de categorías montado en la curva.
//
// ⚠️ ESTE HEADER NO CAMBIA CON EL TEMA, y no es un olvido: es verde oscuro en claro Y en oscuro,
// porque la forma verde ES la identidad de Supermarket. Como el fondo sobre el que se apoyan no
// cambia, tampoco cambian los colores de lo que va encima — el lima de los botones, el blanco de la
// píldora, el pálido del texto. Es la misma regla que ya seguían las pestañas de «Categorías».
// Lo ÚNICO que sí es sensible al tema son los nombres de las categorías, porque caen fuera del
// verde (ver `category-arc`).
//
// Todos los colores están MEDIDOS sobre la referencia del diseño, no elegidos a ojo.
const GREEN = "#003032";
const DEEP_GREEN = "#034842";
/** «Current location» — resulta ser exactamente el lima de marca. */
const LIME_TEXT = "#C2FB7E";
/** El nombre del sitio: lima MUY pálido, no blanco. */
const PALE = "#E1FFBF";

/** Diámetro de los botones. 48, el MISMO que el header de «Categorías» — el botón es
 *  compartido, así que su tamaño también. Medido en la referencia: 47.1. */
const BUTTON = 48;
/** Alto de la píldora del buscador. Medido: 42pt. */
const SEARCH_H = 42;
/** Sangría lateral de la fila de controles. Medido: ~9pt — el diseño los lleva pegados al canto. */
const ROW_PAD = 10;
const ROW_GAP = 8;

interface SupermarketHeaderProps {
  /** Ancho de la pantalla: manda sobre toda la geometría del arco. */
  width: number;
  /** Área segura superior. El verde pasa POR DEBAJO de ella; los controles, no. */
  safeTop: number;
  /** Dónde está comprando el usuario. Llega de fuera porque es un dato, no una decoración. */
  location: string;
  locationLabel: string;
  categories: readonly ArcCategory[];
  basketCount: number;
  searchPlaceholder: string;
  alertsLabel: string;
  backLabel: string;
  basketLabel: string;
  onBack: () => void;
  onSearch: () => void;
  onBasket: () => void;
  onAlerts: () => void;
  onSelectCategory: (slug: string) => void;
}

/** Lo que ocupa el header. Lo necesita la pantalla para arrancar el contenido justo debajo. */
export { headerBlockHeight };


export function SupermarketHeader({
  width,
  safeTop,
  location,
  locationLabel,
  categories,
  basketCount,
  searchPlaceholder,
  alertsLabel,
  backLabel,
  basketLabel,
  onBack,
  onSearch,
  onBasket,
  onAlerts,
  onSelectCategory,
}: SupermarketHeaderProps) {
  const height = headerBlockHeight(width);

  return (
    <View style={{ height }} pointerEvents="box-none">
      {/* La forma verde. El arco del canto es un arco de circunferencia DE VERDAD (comando `A` de
          SVG), no una Bézier que se le parezca — ver `arc-geometry`. */}
      <Svg
        width={width}
        height={height}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <Path d={headerPath(width)} fill={GREEN} />
      </Svg>

      {/* LA RUEDA VA LO PRIMERO, justo encima del verde y DEBAJO de todos los controles.
          Ese orden es lo que le deja ocupar el header entero sin romper nada: los botones, el
          buscador y la campana se dibujan después, así que siguen por delante y se llevan sus
          toques. A cambio, las categorías pueden subir por el arco enteras — antes la banda
          empezaba en el canto del círculo en reposo y las recortaba en seco al girar. */}
      {/* Mientras no hay categorías, el HUECO de los cuatro círculos sobre la curva —puestos con la
          misma geometría que las de verdad, así que al llegar no saltan. Se DESMONTA al llegar los
          datos: el reloj del shimmer late mientras esté montado. */}
      {categories.length === 0 ? (
        <ArcSkeleton width={width} height={height} />
      ) : (
        <CategoryArc categories={categories} width={width} onSelect={onSelectCategory} />
      )}

      {/* Fila de controles: volver · buscador · carrito. Va por DEBAJO del área segura, no del
          canto de la pantalla, o el reloj del sistema se le montaría encima. */}
      <View
        style={{
          position: "absolute",
          top: safeTop + 4,
          left: 0,
          right: 0,
          height: BUTTON,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: ROW_PAD,
          gap: ROW_GAP,
        }}
      >
        <GlassButton icon={ArrowLeft} label={backLabel} onPress={onBack} size={BUTTON} />

        {/* El buscador de la home NO es un campo: es un BOTÓN que se ve como uno. Escribir acá
            llevaría a la rejilla igual, así que teclear en una pantalla para saltar a otra a mitad
            de palabra sería peor que tocar y aterrizar ya enfocado donde se busca de verdad. */}
        <Pressable
          accessibilityRole="search"
          accessibilityLabel={searchPlaceholder}
          onPress={onSearch}
          style={{
            flex: 1,
            height: SEARCH_H,
            borderRadius: SEARCH_H / 2,
            borderCurve: "continuous",
            backgroundColor: "#FFFFFF",
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            gap: 8,
          }}
        >
          {/* Lupa con destello: el buscador entiende lenguaje natural, y el destello es lo que lo
              anuncia sin gastar una palabra del placeholder. */}
          <SearchIcon width={26} height={26} />
          <Text
            numberOfLines={1}
            style={{ flex: 1, fontFamily: KANTUMRUY_MEDIUM, fontSize: 15, color: "#9AA8A6" }}
          >
            {searchPlaceholder}
          </Text>
        </Pressable>

        <GlassButton
          icon={ShoppingBasket}
          label={basketLabel}
          onPress={onBasket}
          size={BUTTON}
          badge={basketCount}
        />
      </View>

      {/* Ubicación. Sin toques: es un rótulo, y dejarlo transparente al dedo permite que el
          carrusel de abajo reciba el gesto aunque su banda le pase por detrás. */}
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: safeTop + 4 + BUTTON + 10, left: 0, right: 0 }}
      >
        <Text
          style={{
            textAlign: "center",
            fontFamily: KANTUMRUY_MEDIUM,
            fontSize: 14,
            color: LIME_TEXT,
          }}
        >
          {locationLabel}
        </Text>
        <Text
          numberOfLines={1}
          style={{
            textAlign: "center",
            marginTop: 1,
            fontFamily: KANTUMRUY_SEMIBOLD,
            fontSize: 18,
            color: PALE,
          }}
        >
          {location}
        </Text>
      </View>


      <Pressable
        accessibilityRole="button"
        accessibilityLabel={alertsLabel}
        onPress={onAlerts}
        style={{
          position: "absolute",
          top: safeTop + 4 + BUTTON + 10 + 46,
          alignSelf: "center",
          padding: 6,
        }}
      >
        {/* El punto rojo viene DENTRO del SVG: es parte del dibujo, no una insignia que se monte
            encima. */}
        <NotificationsRing width={35} height={35} />
      </Pressable>
    </View>
  );
}
