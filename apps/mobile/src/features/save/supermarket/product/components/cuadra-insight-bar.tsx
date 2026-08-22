import { Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";

import CuadraWordmark from "@/assets/save/cuadra-wordmark.svg";
import SavingsPiggy from "@/assets/save/savings-piggy.svg";
import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_BOLD, KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import type { HistoryPoint } from "../chart/history-geometry";
import { savingsOf, trendOf } from "../hero";
import { BRAND_LIME, DEEP_GREEN, LIME_INK } from "../product-palette";
import { priceParts } from "../product-view";

const SPARK_W = 52;
const SPARK_H = 21;

interface Props {
  priceMinor: number;
  previousMinor?: number | null;
  currency: string;
  history?: readonly HistoryPoint[] | null;
}

/**
 * La franja de Cuadra: qué está haciendo el precio y cuánto te llevas por comprarlo hoy.
 *
 * ⭐ Es la única fila de la pantalla que dice algo que NINGÚN catálogo puede copiar. Un súper
 * publica su precio; sólo alguien que lleva meses mirando puede decir hacia dónde va y cuánto te
 * ahorras contra lo que valía. Por eso lleva la marca encima: es la firma de lo que aportamos.
 *
 * ⭐ **No se dibuja si no hay nada que contar.** Sin tendencia y sin ahorro, la franja sería un
 * marco de marca alrededor del vacío — que es exactamente lo que un catálogo SÍ puede copiar.
 */
export function CuadraInsightBar({ priceMinor, previousMinor, currency, history }: Props) {
  const trend = trendOf(history);
  const savings = savingsOf(priceMinor, previousMinor);
  if (!trend && !savings) return null;

  const saved = savings ? priceParts(savings.amountMinor, currency) : null;

  return (
    <View
      className="flex-row items-center bg-white"
      style={{
        gap: 10,
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 10,
        borderCurve: "continuous",
        // Sólo los cantos laterales, como el mock: un borde entero encajona la franja y la separa
        // de la pantalla, cuando lo que se quiere es que se lea como una banda que la cruza.
        borderLeftWidth: 2,
        borderRightWidth: 2,
        borderLeftColor: BRAND_LIME,
        borderRightColor: BRAND_LIME,
        shadowColor: "#000000",
        shadowOpacity: 0.08,
        shadowRadius: 5.5,
        shadowOffset: { width: 0, height: 3.6 },
      }}
    >
      <CuadraWordmark height={22} width={22 * (87.7441 / 27.2759)} />

      {trend ? <TrendChip trend={trend} history={history} /> : null}

      {savings ? (
        <>
          <Icon as={ChevronRight} size={16} color="#C9D2CC" strokeWidth={2} />

          <View className="flex-row items-center" style={{ gap: 4, flexShrink: 1 }}>
            <SavingsPiggy height={28} width={28} />
            <View>
              <View className="flex-row items-start">
                <Text
                  style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 20, color: LIME_INK }}
                  numberOfLines={1}
                >
                  {saved!.whole}
                  {saved!.cents ? "." : ""}
                </Text>
                <Text
                  style={{
                    fontFamily: KANTUMRUY_SEMIBOLD,
                    fontSize: 11,
                    color: LIME_INK,
                    marginTop: 2,
                  }}
                >
                  {saved!.cents}
                </Text>
              </View>
              <Text
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 8, color: DEEP_GREEN }}
                numberOfLines={1}
              >
                {t("save.product.insight.savings")}{" "}
                <Text style={{ fontFamily: KANTUMRUY_BOLD, color: LIME_INK }}>{currency}</Text>
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * La chispa del histórico + el porcentaje.
 *
 * ⭐ El trazo se dibuja del historial REAL, no es un adorno. Un garabato genérico junto a un
 * porcentaje de verdad es la clase de detalle que, cuando el usuario lo descubre, le hace dudar
 * también del número — y el número es lo único que vendemos.
 *
 * Y va en ESCALONES por lo mismo que el chart grande: los puntos son change-only, cada uno rige
 * hasta el siguiente, y una diagonal dibujaría precios que nunca existieron.
 */
function TrendChip({
  trend,
  history,
}: {
  trend: NonNullable<ReturnType<typeof trendOf>>;
  history?: readonly HistoryPoint[] | null;
}) {
  const label =
    trend.direction === "down"
      ? t("save.product.insight.trendDown")
      : trend.direction === "up"
        ? t("save.product.insight.trendUp")
        : t("save.product.insight.trendFlat");

  return (
    <View style={{ gap: 3 }}>
      <View className="flex-row items-center" style={{ gap: 6 }}>
        <View
          className="items-center justify-center bg-white"
          style={{
            width: SPARK_W,
            height: SPARK_H,
            borderRadius: 6,
            borderCurve: "continuous",
            borderWidth: 1,
            borderColor: "#B7EA7A",
            overflow: "hidden",
          }}
        >
          <Sparkline history={history} />
        </View>

        {trend.direction !== "flat" ? (
          <View
            className="items-center justify-center"
            style={{
              backgroundColor: BRAND_LIME,
              borderRadius: 20,
              paddingHorizontal: 7,
              paddingVertical: 2,
            }}
          >
            <Text style={{ fontFamily: KANTUMRUY_BOLD, fontSize: 9, color: DEEP_GREEN }}>
              {trend.direction === "down" ? "-" : "+"}
              {trend.percent}%
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={{
          fontFamily: KANTUMRUY_SEMIBOLD,
          fontSize: 6,
          color: DEEP_GREEN,
          textTransform: "uppercase",
          maxWidth: SPARK_W + 6,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function Sparkline({ history }: { history?: readonly HistoryPoint[] | null }) {
  if (!history || history.length < 2) return null;

  const ordered = [...history].sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  const prices = ordered.map((p) => p.priceMinor);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // Con precio plano el rango es 0 y todo dividiría entre cero: se dibuja a media altura, que es
  // exactamente lo que un precio que no se movió significa.
  const span = max - min || 1;

  const w = SPARK_W - 6;
  const h = SPARK_H - 8;
  const stepX = w / (ordered.length - 1);
  const yOf = (price: number) => 4 + h - ((price - min) / span) * h;

  let d = `M 3 ${yOf(prices[0]).toFixed(2)}`;
  for (let i = 1; i < ordered.length; i += 1) {
    const x = 3 + stepX * i;
    // `H` y luego `V`: mantener el nivel hasta el instante del cambio y sólo entonces saltar.
    d += ` H ${x.toFixed(2)} V ${yOf(prices[i]).toFixed(2)}`;
  }

  return (
    <Svg width={SPARK_W} height={SPARK_H}>
      <Path d={d} stroke={LIME_INK} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
    </Svg>
  );
}
