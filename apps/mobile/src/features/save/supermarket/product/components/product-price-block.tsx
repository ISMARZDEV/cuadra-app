import { Text, View } from "react-native";

import { formatMoney } from "@/lib/money";
import { KANTUMRUY_MEDIUM, KANTUMRUY_REGULAR, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { previousUnitPriceMinor } from "../hero";
import {
  DEEP_GREEN,
  LIME_INK,
  TEAL,
  WAS_BADGE_BG,
  WAS_BADGE_INK,
  WAS_INK,
  WAS_UNIT_INK,
} from "../product-palette";
import { PRICE, PRICE_CENTS } from "../product-type";
import { priceParts } from "../product-view";

interface Props {
  priceMinor: number;
  currency: string;
  /** Precio por unidad base actual, en unidades menores. `null` si el producto no declara cantidad. */
  unitPriceMinor?: number | null;
  /** «kg», «Oz»… Lo que va detrás de la «X». */
  unitLabel?: string | null;
  /** Lo que costaba antes en esta misma tienda. `null` = nunca movió el precio. */
  previousMinor?: number | null;
}

/**
 * El bloque de precio del diseño: lo que cuesta AHORA a la izquierda, lo que costaba ANTES a la
 * derecha, separados por una línea.
 *
 * ⭐ La composición es el argumento. En un comparador, un precio solo no dice nada; lo que informa
 * es la DISTANCIA entre dos números. Ponerlos uno al lado del otro con un separador los presenta
 * como lo que son —la misma magnitud en dos momentos— en vez de como dos datos sueltos.
 *
 * ⭐ Y los dos llevan su precio POR UNIDAD debajo, que es la comparación que de verdad ahorra: dos
 * envases de tamaños distintos sólo se pueden comparar por ahí. El de antes se DERIVA de la
 * proporción (ver `previousUnitPriceMinor`), no se pide al API.
 *
 * ⭐ **La balanza va CENTRADA en la pantalla, y cada lado centrado sobre sí mismo** (igual que
 * `ProductIdentity`). Con la fila pegada a la izquierda, el separador caía en cualquier sitio según
 * lo largo que fuera el número de hoy, y una balanza cuyo fiel se mueve deja de leerse como una
 * balanza. Centrada, la línea queda donde el ojo la espera y los dos precios pesan lo mismo.
 */
export function ProductPriceBlock({
  priceMinor,
  currency,
  unitPriceMinor,
  unitLabel,
  previousMinor,
}: Props) {
  const now = priceParts(priceMinor, currency);
  const was = previousMinor != null ? priceParts(previousMinor, currency) : null;

  // ⚠️ Los unitarios van EN LÍNEA, así que se formatean ENTEROS con `formatMoney`.
  //
  // `priceParts` parte por el punto Y SE LO COME (`whole` = «$195», `cents` = «07»), porque está
  // pensada para el precio grande, donde los céntimos van VOLADOS y el punto lo dibuja el bloque.
  // Concatenar sus dos mitades daba «$19507 X kg» — un precio por kilo cien veces mayor, en la
  // pantalla cuyo único trabajo es que los números sean ciertos.
  const unitNow = unitPriceMinor != null ? formatMoney(unitPriceMinor, currency) : null;
  const previousUnit = previousUnitPriceMinor(priceMinor, unitPriceMinor, previousMinor);
  const unitWas = previousUnit != null ? formatMoney(previousUnit, currency) : null;

  return (
    <View className="flex-row items-center justify-center" style={{ gap: 20 }}>
      <View className="items-center" style={{ flexShrink: 1 }}>
        <View className="flex-row items-start">
          <Text
            style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: PRICE, color: DEEP_GREEN }}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {now.whole}
            {now.cents ? "." : ""}
          </Text>
          {now.cents ? (
            <Text
              style={{
                fontFamily: KANTUMRUY_SEMIBOLD,
                fontSize: PRICE_CENTS,
                color: DEEP_GREEN,
                marginTop: 3,
              }}
            >
              {now.cents}
            </Text>
          ) : null}
        </View>

        {unitNow && unitLabel ? <UnitPrice amount={unitNow} unit={unitLabel} /> : null}
      </View>

      {/* La línea sólo aparece cuando hay DOS cosas que separar. Sin precio anterior sería un
          adorno que promete una comparación que no ocurrió. */}
      {was ? (
        <>
          <View style={{ width: 1, height: 60, backgroundColor: "#E3E8E4" }} />

          <View className="items-center" style={{ gap: 4, flexShrink: 1 }}>
            <View className="flex-row items-start">
              <Text
                style={{
                  fontFamily: KANTUMRUY_SEMIBOLD,
                  fontSize: 22,
                  color: WAS_INK,
                  textDecorationLine: "line-through",
                  textDecorationColor: WAS_BADGE_BG,
                }}
                numberOfLines={1}
              >
                {was.whole}
                {was.cents ? "." : ""}
              </Text>
              {was.cents ? (
                <Text
                  style={{
                    fontFamily: KANTUMRUY_SEMIBOLD,
                    fontSize: 13,
                    color: WAS_INK,
                    marginTop: 2,
                    textDecorationLine: "line-through",
                    textDecorationColor: WAS_BADGE_BG,
                  }}
                >
                  {was.cents}
                </Text>
              ) : null}
            </View>

            {unitWas && unitLabel ? (
              <Text
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13, color: WAS_UNIT_INK }}
                numberOfLines={1}
              >
                {`${unitWas} X ${unitLabel}`}
              </Text>
            ) : null}

            {/* El sello dice QUÉ es ese número. Un precio tachado sin etiqueta se lee como un error
                de la app tan a menudo como se lee como una rebaja. */}
            <View
              style={{
                backgroundColor: WAS_BADGE_BG,
                borderRadius: 3,
                paddingHorizontal: 8,
                paddingVertical: 1,
              }}
            >
              <Text
                style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 12, color: WAS_BADGE_INK }}
              >
                ANTES
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * El precio por unidad. La «X» va en OTRO color y en regular a propósito: separa dos números que
 * si no se leerían como uno solo («221.00 kg» parece un peso).
 */
function UnitPrice({ amount, unit }: { amount: string; unit: string }) {
  return (
    <Text style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 18, color: TEAL }} numberOfLines={1}>
      {amount}
      <Text style={{ fontFamily: KANTUMRUY_REGULAR, color: LIME_INK }}>{" X "}</Text>
      {unit}
    </Text>
  );
}
