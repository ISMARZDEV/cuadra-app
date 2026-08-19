import { ArrowLeft, ShoppingBasket } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";

// La campana con su punto es el SVG de diseño, no un icono de la librería aproximado: lleva
// detalles que lucide no tiene —el punto rojo con su velo blanco al 20%— y que se perdían al
// sustituirlo. El logotipo, igual: es el lockup de marca, no texto que se le parezca.
import SaveSupermarketLogo from "@/assets/carrusel-save/cuadra-save-supermarket.svg";
import NotificationsRing from "@/assets/carrusel-save/notifications-ring.svg";
import { GlassButton } from "@/components/ui/glass-button";

import { headerBlockHeight, headerPath } from "../arc-geometry";
import { CategoryArc, type ArcCategory } from "./category-arc";
import { ArcSkeleton } from "./supermarket-skeletons";

// El header de la home de Supermarket: el verde con el canto arqueado, su fila de controles con el
// logotipo por título, la ubicación, la campana y el carrusel de categorías montado en la curva.
//
// El BUSCADOR ya no vive aquí: bajó al blanco, entre el arco y el primer rail (`home-search-bar`).
// Aquí arriba era una píldora estrecha entre dos botones y sólo daba para fingir un campo; abajo
// tiene el ancho de la pantalla y es un campo de verdad, donde se escribe.
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
/** Diámetro de los botones. 48, el MISMO que el header de «Categorías» — el botón es
 *  compartido, así que su tamaño también. Medido en la referencia: 47.1. */
const BUTTON = 48;
/** Sangría lateral de la fila de controles. Medido: ~9pt — el diseño los lleva pegados al canto. */
const ROW_PAD = 10;
const ROW_GAP = 8;

/**
 * Alto del logotipo, y de ahí sale su ancho.
 *
 * Se fija por el ALTO y no por el ancho porque el lockup es 98×46 —muy apaisado— y estirarlo hasta
 * llenar el hueco entre los botones (~261pt en un 393) lo mandaría a ~122pt de alto: se comería la
 * la campana y parte del arco.
 *
 * ⚠️ CRECIÓ DE 56 A 80 PORQUE SE FUE LA UBICACIÓN, no porque hubiera sitio de sobra. Este eje sigue
 * lleno: la campana está en su SUELO —a un par de puntos del indicador de la ruleta— y no se puede
 * bajar sin mover el arco. Lo que el rótulo de ubicación ocupaba (49pt entre su hueco y su bloque)
 * es exactamente de donde sale este crecimiento. Si algún día vuelve la ubicación, esto vuelve a 56.
 *
 * El ancho no limita: a 80 mide ~170pt y en el teléfono más estrecho el hueco entre los botones da
 * 243. El techo real está en la campana.
 */
const LOGO_H = 80;
/** Proporción del lockup, tomada de su propio `viewBox` (98×46). */
const LOGO_RATIO = 98 / 46;

/**
 * Dónde empieza la fila, por debajo del área segura. HOY LA MANDAN LOS BOTONES.
 *
 * ⚠️ 4 Y NO 6, Y AQUÍ HAY UNA ASIMETRÍA QUE MERECE ENTENDERSE. Estuvo en 6 por el LOGOTIPO: a 4 el
 * lockup quedaba pegado al canto de la isla dinámica. Pero la isla está en el CENTRO, y los botones
 * viven en los COSTADOS — donde no hay isla que esquivar. Esa restricción nunca fue suya.
 *
 * Al separarlos (ver `LOGO_DROP`), cada uno puede respetar lo que de verdad le limita: los botones
 * suben hasta el área segura, y el logotipo conserva su aire contra la isla.
 */
const ROW_TOP = 4;
/**
 * Cuánto BAJA el logotipo respecto de los botones.
 *
 * Iban centrados en la misma fila, y por eso no podían separarse: subir los botones bajaba el
 * logotipo y al revés. Se pidieron las dos cosas A LA VEZ —logotipo más abajo, botones más arriba—,
 * que es justo lo que un centrado compartido no puede dar.
 *
 * Los botones se apoyan ahora en el techo de la fila y el logotipo cuelga de este número. Es EL
 * NÚMERO DEL AJUSTE FINO: subirlo baja el lockup, y lo único que tiene debajo es la campana.
 */
const LOGO_DROP = 12;
/** Alto de la fila: lo que ocupa el logotipo ya caído. Es el más alto de los dos que la habitan. */
const ROW_H = LOGO_DROP + LOGO_H;
/**
 * Dónde vive la campana.
 *
 * ⚠️ 111 ERA SU SUELO, no su sitio: a esa altura quedaba a un par de puntos del indicador de la
 * ruleta —sobre la captura, la campana llegaba a 490 y las ranuras empiezan en 495—, o sea que NO
 * PUEDE BAJAR de ahí sin mover el arco. Subir sí puede, y es lo que se pidió: a 102 se despega del
 * indicador y respira mejor entre el logotipo y la curva.
 *
 * Se escribe como ANCLA ABSOLUTA y no como suma de huecos, y ésa es la razón de que el logotipo
 * haya podido crecer y bajar sin arrastrarla: lo de arriba se recoloca, esto no se entera.
 */
const BELL_TOP = 102;
/** Lo que hay entre la fila y la campana. Se DESPEJA del ancla, no se elige. */
const BELL_GAP = BELL_TOP - ROW_TOP - ROW_H;

interface SupermarketHeaderProps {
  /** Ancho de la pantalla: manda sobre toda la geometría del arco. */
  width: number;
  /** Área segura superior. El verde pasa POR DEBAJO de ella; los controles, no. */
  safeTop: number;
  categories: readonly ArcCategory[];
  /** Cambiarlo repite la aparición de la ruleta. Ver `CategoryArc`. */
  replay?: number;
  /** Volviendo del buscador: la ruleta cae sobre una elipse que todavía baja. Ver `CategoryArc`. */
  returning?: boolean;
  /** True mientras se busca: las categorías se retiran antes que la elipse. */
  away?: boolean;
  basketCount: number;
  /** Cómo se llama esta pantalla para un lector de pantalla: el logotipo es un dibujo, no texto. */
  titleLabel: string;
  alertsLabel: string;
  backLabel: string;
  basketLabel: string;
  onBack: () => void;
  onBasket: () => void;
  onAlerts: () => void;
  onSelectCategory: (slug: string) => void;
}

/** Lo que ocupa el header. Lo necesita la pantalla para arrancar el contenido justo debajo. */
export { headerBlockHeight };


export function SupermarketHeader({
  width,
  safeTop,
  categories,
  replay,
  away,
  returning,
  basketCount,
  titleLabel,
  alertsLabel,
  backLabel,
  basketLabel,
  onBack,
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
        <CategoryArc
          categories={categories}
          width={width}
          replay={replay}
          away={away}
          returning={returning}
          onSelect={onSelectCategory}
        />
      )}

      {/* Fila de controles: volver · buscador · carrito. Va por DEBAJO del área segura, no del
          canto de la pantalla, o el reloj del sistema se le montaría encima. */}
      <View
        style={{
          position: "absolute",
          top: safeTop + ROW_TOP,
          left: 0,
          right: 0,
          height: ROW_H,
          flexDirection: "row",
          // ⚠️ `flex-start` Y NO `center`: los botones se apoyan en el TECHO de la fila y el
          // logotipo baja por su cuenta con `LOGO_DROP`. Centrados, los dos colgaban del mismo eje
          // y no se podían mover en sentidos opuestos, que es lo que se pidió.
          alignItems: "flex-start",
          paddingHorizontal: ROW_PAD,
          gap: ROW_GAP,
        }}
      >
        <GlassButton icon={ArrowLeft} label={backLabel} onPress={onBack} size={BUTTON} />

        {/* EL LOGOTIPO ES EL TÍTULO de la pantalla, en el sitio que antes ocupaba el buscador. El
            buscador se fue abajo, al blanco entre el arco y el primer rail: allá tiene ancho de
            sobra para ser un campo de verdad, y aquí arriba el nombre dice dónde estás.

            `flex: 1` en el envoltorio y no en el logotipo: así el hueco entre los botones es suyo
            entero y el lockup se centra dentro, en vez de estirarse y deformarse. */}
        <View
          accessibilityRole="header"
          accessibilityLabel={titleLabel}
          style={{ flex: 1, alignItems: "center", marginTop: LOGO_DROP }}
        >
          <SaveSupermarketLogo height={LOGO_H} width={LOGO_H * LOGO_RATIO} />
        </View>

        <GlassButton
          icon={ShoppingBasket}
          label={basketLabel}
          onPress={onBasket}
          size={BUTTON}
          badge={basketCount}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={alertsLabel}
        onPress={onAlerts}
        style={{
          position: "absolute",
          top: safeTop + ROW_TOP + ROW_H + BELL_GAP,
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
