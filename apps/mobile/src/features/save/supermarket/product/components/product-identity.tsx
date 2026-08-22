import { Text, View } from "react-native";

import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { DEEP_GREEN, LIME_SOFT, META_INK, SIZE_INK } from "../product-palette";
import { TITLE } from "../product-type";

interface Props {
  name: string;
  brand?: string | null;
  currency: string;
  displaySize?: string | null;
}

/**
 * Quién es este producto: el nombre y, debajo, marca · moneda · tamaño en UNA sola línea.
 *
 * ⭐ Los tres en una línea y no apilados, que es como estaban. Apilados se leían como tres datos
 * independientes que hay que ir juntando; en una línea con separadores son lo que de verdad son:
 * la ficha de identidad del producto, de un vistazo. Y ocupan un tercio del alto.
 *
 * ⭐ La MONEDA va en el medio y en verde. En un comparador multi-país no es decoración: es lo que
 * dice en qué se están dando todos los números de la pantalla.
 */
export function ProductIdentity({ name, brand, currency, displaySize }: Props) {
  const parts: Array<{ text: string; style: object }> = [];
  if (brand) {
    parts.push({
      text: brand,
      style: { fontFamily: KANTUMRUY_MEDIUM, fontSize: 14, color: META_INK },
    });
  }
  parts.push({
    text: currency,
    style: { fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 17, color: LIME_SOFT },
  });
  if (displaySize) {
    parts.push({
      text: displaySize,
      style: { fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 14, color: SIZE_INK },
    });
  }

  return (
    <View style={{ gap: 5 }}>
      <Text
        style={{
          fontFamily: KANTUMRUY_SEMIBOLD,
          fontSize: TITLE,
          lineHeight: TITLE * 1.09,
          color: DEEP_GREEN,
        }}
      >
        {name}
      </Text>

      <View className="flex-row items-center" style={{ gap: 6 }}>
        {parts.map((part, i) => (
          <View key={part.text} className="flex-row items-center" style={{ gap: 6 }}>
            {/* El punto separador sólo entre piezas, nunca delante de la primera: un punto suelto
                al principio se lee como una viñeta de lista. */}
            {i > 0 ? <Dot /> : null}
            <Text style={part.style} numberOfLines={1}>
              {part.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Dot() {
  return (
    <View style={{ width: 3.5, height: 3.5, borderRadius: 2, backgroundColor: SIZE_INK }} />
  );
}
