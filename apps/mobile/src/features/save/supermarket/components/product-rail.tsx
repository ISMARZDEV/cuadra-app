import { ArrowRight } from "lucide-react-native";
import type { ReactElement } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";
import type { ProductCardDto } from "@cuadra/api-client";

import BasketProductCard, {
  CARD_DISCOUNT_OVERHANG,
  CARD_WIDTH,
} from "@/components/ui/basket-product-card";
import { Icon } from "@/components/ui/icon";
import { PillButton } from "@/components/ui/pill-button";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { RiseIn } from "../../components/rise-in";
import { toCardItemView } from "../to-card-item";

// Un rail de la home de Supermarket: encabezado (título + bajada + botón de «ver todos») y un
// carrusel horizontal de tarjetas de producto.
//
// La mecánica del carrusel es la MISMA del chat (`basket-card.tsx`): separación de 5 y
// `getItemLayout` calculado con el `CARD_WIDTH` que exporta la tarjeta. Ese ancho se importa, no se
// copia — con el número a mano, tocarlo en la tarjeta descalibra el scroll de todos los carruseles
// en silencio.
//
// GEOMETRÍA: el rail se dibuja A ANCHO COMPLETO y aplica la sangría ÉL MISMO — el encabezado con
// `padding` y la lista con `contentContainerStyle`. Por eso la pantalla NO debe padear su
// contenedor: si lo hace, el carrusel hereda ese margen, termina antes del borde y la última
// tarjeta se ve cortada contra un vacío en vez de sangrar fuera de pantalla. Con la sangría acá
// adentro, el título y la primera tarjeta siguen alineados y el scroll llega al canto.
const GAP = 5;

/**
 * Cuántas tarjetas entran ESCALONADAS. Sólo las primeras: a partir de ahí la tarjeta ya está fuera
 * de pantalla, así que escalonarla no la vería nadie —y peor, aparecería con un retardo largo al
 * desplazar el carrusel, como si llegara tarde—. Las demás se dibujan puestas.
 */
const STAGGERED_CARDS = 4;

interface ProductRailProps {
  title: string;
  subtitle: string;
  products: ProductCardDto[];
  /** Sangría lateral del encabezado y de la primera/última tarjeta. La pone el rail, no el padre. */
  gutter: number;
  onSeeAll?: () => void;
  /** Tocar la tarjeta. Entrega el DTO entero porque el destino se arma con el SLUG
   *  (permalink público), no con el id. */
  onSelect?: (product: ProductCardDto) => void;
  onFollow?: (productId: string) => void;
  /**
   * Desde qué escalón arranca la entrada de este rail.
   *
   * Existe para que dos rails no suenen como dos olas separadas: desplazando el segundo unos
   * escalones, su título entra mientras las tarjetas del primero todavía están subiendo y la
   * cascada BAJA por la pantalla como una sola. Ausente = sin animación de entrada (el rail se
   * dibuja puesto), que es lo que quiere quien lo use fuera de una carga inicial.
   */
  entranceOrder?: number;
  /** Cambiarlo repite la entrada del rail entero. Ver `RiseIn`. */
  replay?: number;
  /**
   * Cómo se ofrece «ver todo».
   *
   * `pill` (por defecto) es la píldora con flecha de la home. `link` es el texto de acción del
   * detalle de producto, donde el rail va detrás de otras secciones que YA usan un enlace de texto
   * («Ver tiendas»): una píldora ahí sería un tercer lenguaje de acción en la misma columna.
   *
   * Es una PROP y no un rail nuevo: el carrusel, la cascada de entrada y la geometría son los
   * mismos, y duplicarlos daría dos componentes que se separan al primer retoque.
   */
  seeAllStyle?: "pill" | "link";
  /** Texto del enlace cuando `seeAllStyle` es `link`. */
  seeAllLabel?: string;
}

export function ProductRail({
  title,
  subtitle,
  products,
  gutter,
  onSeeAll,
  onSelect,
  onFollow,
  entranceOrder,
  replay,
  seeAllStyle = "pill",
  seeAllLabel,
}: ProductRailProps) {
  const { colorScheme } = useColorScheme();
  // El icono tiene que ir del color de la LETRA del `PillButton`, que en la variante `brand` se
  // invierte con el tema (lima sobre oscuro, verde profundo sobre lima). El componente no expone
  // ese color, así que se repite la misma regla — si algún día cambia allá, cambia acá.
  const pillFg = colorScheme === "dark" ? "#C2FB7E" : "#034842";

  // Un rail sin productos no se dibuja: un encabezado con una franja vacía debajo se lee como que
  // algo se rompió. Que no haya ofertas hoy es un estado legítimo, no un error que anunciar.
  if (products.length === 0) return null;

  // Envuelve en la entrada escalonada, o deja el elemento tal cual si este rail no la pidió. Así el
  // mismo componente sirve para la carga inicial y para cualquier otro sitio sin ramificar el JSX.
  const step = (offset: number, node: ReactElement): ReactElement =>
    entranceOrder === undefined ? (
      node
    ) : (
      <RiseIn index={entranceOrder + offset} replay={replay}>
        {node}
      </RiseIn>
    );

  return (
    <View>
      <View
        className="mb-3 flex-row items-center justify-between"
        style={{ paddingHorizontal: gutter }}
      >
        <View className="flex-1 pr-3">
          {/* Primero el TÍTULO, después la bajada: se leen en ese orden, así que entran en ese
              orden. Al revés, el ojo empieza por lo secundario. */}
          {step(0,
          <Text
            className="text-[#034842]"
            style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: seeAllStyle === "link" ? 20 : 18 }}
          >
            {title}
          </Text>
          )}
          {step(1,
          <Text className="text-[14px] text-[#7CB342]" style={{ fontFamily: KANTUMRUY_MEDIUM }}>
            {subtitle}
          </Text>
          )}
        </View>
        {/* «Ver todos» es el `PillButton` compartido —el mismo del input del chat—, no un botón
            redondo propio. La variante `brand` es la lima de ese input.

            ⚠️ Todavía NO tiene destino: la pantalla de listado no existe. Sin `onSeeAll` el
            `PillButton` no se hunde ni vibra (él mismo gatea la reacción al toque a que haya
            handler), así que no promete una acción que no llega. */}
        {/* Sólo se dibuja si LLEVA a algún sitio. Un botón inerte que no se hunde al tocarlo no
            engaña al dedo, pero sí ocupa el sitio de una acción y el ojo lo cuenta como tal —
            «Más de LA FAMOSA →» con la flecha muerta se lee como una promesa rota. */}
        {onSeeAll && seeAllStyle === "link" ? (
          <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="button">
            <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 15, color: "#C2410C" }}>
              {seeAllLabel ?? t("save.supermarket.seeAll")}
            </Text>
          </Pressable>
        ) : onSeeAll ? (
          <PillButton
            accessibilityLabel={t("save.supermarket.seeAll")}
            icon={<Icon as={ArrowRight} size={20} color={pillFg} strokeWidth={2.5} />}
            onPress={onSeeAll}
            paddingHorizontal={12}
          />
        ) : null}
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={products}
        keyExtractor={(p) => p.id}
        renderItem={({ item: dto, index }) => {
          const view = toCardItemView(dto, index);
          const card = (
            <BasketProductCard
              item={view.item}
              currency={view.currency}
              badge={view.badge}
              discountBps={view.discountBps}
              previousPrice={view.previousPrice}
              onSelect={onSelect ? () => onSelect(dto) : undefined}
              onBookmark={onFollow ? () => onFollow(dto.id) : undefined}
            />
          );
          // Las tarjetas siguen a la bajada, una detrás de otra desde la primera. Sólo las que se
          // ven: ver `STAGGERED_CARDS`.
          return index < STAGGERED_CARDS ? step(2 + index, card) : card;
        }}
        ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
        // El aire de arriba NO es estético: el sello de oferta monta sobre el canto del card, y sin
        // reservarlo el contenedor lo recorta y se ve partido por la mitad.
        contentContainerStyle={{
          paddingHorizontal: gutter,
          paddingTop: CARD_DISCOUNT_OVERHANG,
        }}
        removeClippedSubviews
        scrollEventThrottle={16}
        // El rail es HORIZONTAL, así que la ventana se mide en anchos de pantalla: con `windowSize`
        // 21 —el valor por defecto— se mantienen montadas decenas de tarjetas con su foto a cada
        // lado del viewport, y cada foto decodificada cuesta memoria de verdad. Con 5 quedan dos
        // pantallas a cada lado: nadie ve un hueco al deslizar y la memoria baja un orden.
        windowSize={5}
        // En un móvil entran ~2.5 tarjetas; 6 llena la primera pantalla con margen para el primer
        // empujón del dedo sin retrasar el fotograma inicial.
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        updateCellsBatchingPeriod={50}
        getItemLayout={(_data, index) => ({
          length: CARD_WIDTH,
          offset: gutter + (CARD_WIDTH + GAP) * index,
          index,
        })}
      />
    </View>
  );
}
