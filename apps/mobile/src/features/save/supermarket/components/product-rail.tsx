import { ArrowRight } from "lucide-react-native";
import { FlatList, Text, View } from "react-native";
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

interface ProductRailProps {
  title: string;
  subtitle: string;
  products: ProductCardDto[];
  /** Sangría lateral del encabezado y de la primera/última tarjeta. La pone el rail, no el padre. */
  gutter: number;
  onSeeAll?: () => void;
  onSelect?: (productId: string) => void;
  onFollow?: (productId: string) => void;
}

export function ProductRail({
  title,
  subtitle,
  products,
  gutter,
  onSeeAll,
  onSelect,
  onFollow,
}: ProductRailProps) {
  const { colorScheme } = useColorScheme();
  // El icono tiene que ir del color de la LETRA del `PillButton`, que en la variante `brand` se
  // invierte con el tema (lima sobre oscuro, verde profundo sobre lima). El componente no expone
  // ese color, así que se repite la misma regla — si algún día cambia allá, cambia acá.
  const pillFg = colorScheme === "dark" ? "#C2FB7E" : "#034842";

  // Un rail sin productos no se dibuja: un encabezado con una franja vacía debajo se lee como que
  // algo se rompió. Que no haya ofertas hoy es un estado legítimo, no un error que anunciar.
  if (products.length === 0) return null;

  return (
    <View>
      <View
        className="mb-3 flex-row items-center justify-between"
        style={{ paddingHorizontal: gutter }}
      >
        <View className="flex-1 pr-3">
          <Text className="text-[22px] text-[#034842]" style={{ fontFamily: KANTUMRUY_SEMIBOLD }}>
            {title}
          </Text>
          <Text className="text-[15px] text-[#7CB342]" style={{ fontFamily: KANTUMRUY_MEDIUM }}>
            {subtitle}
          </Text>
        </View>
        {/* «Ver todos» es el `PillButton` compartido —el mismo del input del chat—, no un botón
            redondo propio. La variante `brand` es la lima de ese input.

            ⚠️ Todavía NO tiene destino: la pantalla de listado no existe. Sin `onSeeAll` el
            `PillButton` no se hunde ni vibra (él mismo gatea la reacción al toque a que haya
            handler), así que no promete una acción que no llega. */}
        <PillButton
          accessibilityLabel={t("save.supermarket.seeAll")}
          icon={<Icon as={ArrowRight} size={20} color={pillFg} strokeWidth={2.5} />}
          onPress={onSeeAll}
          paddingHorizontal={12}
        />
      </View>

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={products}
        keyExtractor={(p) => p.id}
        renderItem={({ item: dto, index }) => {
          const view = toCardItemView(dto, index);
          return (
            <BasketProductCard
              item={view.item}
              currency={view.currency}
              badge={view.badge}
              discountBps={view.discountBps}
              previousPrice={view.previousPrice}
              onSelect={onSelect ? () => onSelect(dto.id) : undefined}
              onBookmark={onFollow ? () => onFollow(dto.id) : undefined}
            />
          );
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
        getItemLayout={(_data, index) => ({
          length: CARD_WIDTH,
          offset: gutter + (CARD_WIDTH + GAP) * index,
          index,
        })}
      />
    </View>
  );
}
