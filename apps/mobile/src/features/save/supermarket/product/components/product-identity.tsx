import { Text, View } from "react-native";

import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { LIME_SOFT, META_INK, SIZE_INK } from "../product-palette";
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
 *
 * ⭐ **Todo va CENTRADO sobre el eje de la pantalla, no alineado a la izquierda.** La cabecera no es
 * una lista de campos: es una FICHA, y la foto que la corona ya está centrada. Con el texto pegado
 * al margen izquierdo, la tarjeta blanca quedaba descolgada sobre un bloque que tiraba hacia el
 * otro lado; centrado, foto, nombre y precio caen sobre la misma vertical y se leen como una sola
 * pieza. Un nombre de dos líneas es además lo normal aquí, y centrado se lee como un titular en vez
 * de como un párrafo cortado.
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
    <View className="items-center" style={{ gap: 5 }}>
      {/* ⭐ El título SÍ sigue al tema, a diferencia del resto de esta cabecera. No es una
          excepción caprichosa: lo que `product-palette.ts` fija en hex son las piezas que son
          BLANCAS en los dos temas —la placa de la foto, la franja de Cuadra—, y el título no está
          sobre ninguna de ellas: está sobre el fondo de la pantalla, que sí cambia
          (`SaveBackground`: gris claro o `#151515`). Con el verde profundo clavado se
          quedaba casi ilegible contra el degradado oscuro. */}
      <Text
        className="text-text dark:text-text-dark"
        style={{
          fontFamily: KANTUMRUY_SEMIBOLD,
          fontSize: TITLE,
          lineHeight: TITLE * 1.09,
          textAlign: "center",
        }}
      >
        {name}
      </Text>

      <View className="flex-row items-center justify-center" style={{ gap: 6 }}>
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
