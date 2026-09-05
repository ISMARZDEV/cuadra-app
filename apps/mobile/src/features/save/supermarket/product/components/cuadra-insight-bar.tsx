import { Text, View } from "react-native";
import { BadgePercent } from "lucide-react-native";
import Svg, { Circle, Path } from "react-native-svg";

import ArrowRight from "@/assets/save/arrow-carrusel-right.svg";
import CuadraWordmark from "@/assets/save/cuadra-wordmark.svg";
import SavingsPiggy from "@/assets/save/savings-piggy.svg";
import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_BOLD, KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import type { HistoryPoint } from "../chart/history-geometry";
import { savingsOf, trendOf } from "../hero";
import { BRAND_LIME, DEEP_GREEN, LIME_INK } from "../product-palette";
import { priceParts } from "../product-view";

/**
 * ⭐ **La franja entera cuelga de UN número.** El usuario la vio pequeña y pidió «auméntale el
 * tamaño a todo esto» — en plural, porque aquí no hay una pieza que mande: hay una marca, una
 * chispa, un sello, un cerdito y dos cifras que sólo funcionan si crecen JUNTOS. Con las medidas
 * sueltas por el archivo, subir «todo» es tocar veinte números y descubrir en el dispositivo que
 * tres se quedaron atrás.
 *
 * ⚠️⚠️ **El recurso escaso es el ANCHO, y está MEDIDO.** La franja es una sola fila de ancho FIT
 * dentro de una columna de 353 pt (393 de pantalla menos el `px-5`). A escala `1.22` con las
 * medidas anteriores el caso peor —un producto CON tendencia, que estrena el sello del porcentaje—
 * se iba a ~381 pt: se veía «$167.» cortado y los céntimos pintados FUERA del blanco. Con los datos
 * de desarrollo no se nota, porque casi todo sale «PRECIO ESTABLE» y sin sello; se cazó forzando la
 * tendencia a mano en el simulador.
 *
 * ⭐ La salida NO fue bajar la escala, sino repartir el ancho como lo reparte el mock: **los
 * EXTREMOS mandan y el medio cede**. La marca y el ahorro se quedan grandes —son la firma y el
 * dato—, y la chispa, el sello y el chevrón bajan a su proporción del diseño. El presupuesto queda
 * en ~348 pt con el sello puesto, y el `flexShrink` del ahorro es la red por si un día llega una
 * cifra de cinco dígitos.
 */
const S = 1.22;
/** Escala una medida base de la franja. Todas pasan por aquí; ninguna se escribe ya en crudo. */
const s = (n: number) => n * S;

const SPARK_W = s(38);
const SPARK_H = s(16);
/** El verde lavado de dentro de la chispa. En el mock la caja NO es blanca: es un campo. */
const SPARK_FILL = "#F3FBEC";
const SPARK_EDGE = "#B7EA7A";

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
      className="flex-row items-center justify-center bg-white"
      style={{
        // ⭐ **Ancho FIT, no de borde a borde.** Estirada a todo el ancho, la franja se leía como
        // una fila más de la maquetación —el mismo rectángulo que la tabla de tiendas de abajo— y
        // el aire vacío a la derecha del ahorro la hacía parecer inacabada. Ajustada a su contenido
        // y centrada sobre el eje de la pantalla, vuelve a ser lo que es: un SELLO, del ancho de lo
        // que tiene que decir. `alignSelf` es lo que la saca del `stretch` que hereda de la columna.
        alignSelf: "center",
        // El techo: por muy fit que sea, no puede desbordar la columna.
        maxWidth: "100%",
        gap: s(7),
        paddingHorizontal: s(8),
        paddingVertical: s(6),
        borderRadius: s(10),
        borderCurve: "continuous",
        // Sólo los cantos laterales, como el mock: un borde entero encajona la franja y la separa
        // de la pantalla, cuando lo que se quiere es que se lea como una banda que la cruza.
        borderLeftWidth: s(2),
        borderRightWidth: s(2),
        borderLeftColor: BRAND_LIME,
        borderRightColor: BRAND_LIME,
        shadowColor: "#000000",
        shadowOpacity: 0.08,
        shadowRadius: s(5.5),
        shadowOffset: { width: 0, height: s(3.6) },
      }}
    >
      {/* El ancho se DERIVA del alto por la proporción del propio SVG (87.7441 × 27.2759): la marca
          no se deforma al escalar y no hay un segundo número que mantener a mano. */}
      <CuadraWordmark height={s(22)} width={s(22) * (87.7441 / 27.2759)} />

      {trend ? <TrendChip trend={trend} history={history} /> : null}

      {trend && trend.direction !== "flat" ? <PercentSeal trend={trend} /> : null}

      {savings ? (
        <>
          {/* ⭐ La MISMA flecha del carrusel de fotos (`arrow-carrusel-right.svg`), no un chevrón de
              la librería de iconos. El trazo del diseño es un arco largo y fino, y el de Lucide es
              dos rectas en ángulo: puestos uno al lado del otro se nota que son de dos manos
              distintas. El ancho se DERIVA de su proporción nativa (13 × 53) para no deformarla. */}
          {/* El alto manda y el ancho lo sigue: a `s(18)` la flecha mide unos 5 pt de ancho, así que
              crecer aquí casi no toca el presupuesto de ancho de la fila. */}
          <ArrowRight height={s(18)} width={s(18) * (13 / 53)} />

          <View className="flex-row items-center" style={{ gap: s(4), flexShrink: 1 }}>
            <SavingsPiggy height={s(26)} width={s(26)} />
            <View>
              <View className="flex-row items-start">
                <Text
                  style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: s(20), color: LIME_INK }}
                  numberOfLines={1}
                >
                  {saved!.whole}
                  {saved!.cents ? "." : ""}
                </Text>
                <Text
                  style={{
                    fontFamily: KANTUMRUY_SEMIBOLD,
                    fontSize: s(11),
                    color: LIME_INK,
                    marginTop: s(2),
                  }}
                >
                  {saved!.cents}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: KANTUMRUY_MEDIUM,
                  fontSize: s(8),
                  color: DEEP_GREEN,
                  textTransform: "uppercase",
                }}
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
 * La chispa del histórico y, DENTRO de ella, el porcentaje en pequeño.
 *
 * ⭐ El trazo se dibuja del historial REAL, no es un adorno. Un garabato genérico junto a un
 * porcentaje de verdad es la clase de detalle que, cuando el usuario lo descubre, le hace dudar
 * también del número — y el número es lo único que vendemos.
 *
 * Y va en ESCALONES por lo mismo que el chart grande: los puntos son change-only, cada uno rige
 * hasta el siguiente, y una diagonal dibujaría precios que nunca existieron.
 *
 * ⭐ **La etiqueta del porcentaje va DENTRO de la caja, encima del trazo.** Es el mock, y además es
 * lo único que la hace gratis: colgada al lado costaba ancho en la única fila donde el ancho está
 * contado. Aquí no empuja a nadie — la columna mide siempre `SPARK_W`, haya tendencia o no.
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
    <View className="items-center" style={{ gap: s(3) }}>
      <View
        className="items-center justify-center"
        style={{
          width: SPARK_W,
          height: SPARK_H,
          borderRadius: s(6),
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: SPARK_EDGE,
          backgroundColor: SPARK_FILL,
          overflow: "hidden",
        }}
      >
        <Sparkline history={history} />

        {trend.direction !== "flat" ? (
          <View
            style={{
              position: "absolute",
              right: s(1.5),
              bottom: s(1.5),
              backgroundColor: "#FFFFFFE6",
              borderRadius: s(4),
              borderCurve: "continuous",
              paddingHorizontal: s(2.5),
            }}
          >
            <Text style={{ fontFamily: KANTUMRUY_BOLD, fontSize: s(7), color: DEEP_GREEN }}>
              {trend.direction === "down" ? "-" : "+"}
              {trend.percent}%
            </Text>
          </View>
        ) : null}
      </View>

      <Text
        style={{
          fontFamily: KANTUMRUY_SEMIBOLD,
          fontSize: s(6),
          color: DEEP_GREEN,
          textTransform: "uppercase",
          textAlign: "center",
          maxWidth: SPARK_W + s(6),
        }}
      >
        {label}
      </Text>
    </View>
  );
}

/**
 * El sello del porcentaje: la insignia encima y la píldora debajo.
 *
 * ⭐ Repite el número que ya está dentro de la chispa, y no es redundancia: ahí dentro es una
 * MARCA DE AGUA sobre el trazo —se lee cuando ya estás mirando la curva—, y aquí fuera es el
 * titular. Uno explica el otro; quitar el de dentro deja la curva sin escala, y quitar el de fuera
 * esconde la única cifra que se ve de un vistazo.
 *
 * ⭐ Sólo existe con tendencia REAL. Un «0 %» con su insignia sería un sello de nada.
 */
function PercentSeal({ trend }: { trend: NonNullable<ReturnType<typeof trendOf>> }) {
  const sign = trend.direction === "down" ? "-" : "+";

  return (
    <View className="items-center" style={{ gap: s(2) }}>
      <Icon as={BadgePercent} size={s(13)} color={DEEP_GREEN} strokeWidth={2.2} />
      <View
        className="items-center justify-center"
        style={{
          backgroundColor: BRAND_LIME,
          borderRadius: 20,
          paddingHorizontal: s(5),
          paddingVertical: s(1.5),
        }}
      >
        <Text style={{ fontFamily: KANTUMRUY_BOLD, fontSize: s(8.5), color: DEEP_GREEN }}>
          {sign}
          {trend.percent}%
        </Text>
      </View>
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

  // El aire de dentro escala con la caja: dejarlo en píxeles fijos haría que el trazo se pegara al
  // canto al crecer la chispa, que es justo el defecto que delata un escalado a medias.
  const w = SPARK_W - s(6);
  const h = SPARK_H - s(8);
  const stepX = w / (ordered.length - 1);
  const yOf = (price: number) => s(4) + h - ((price - min) / span) * h;

  let d = `M ${s(3).toFixed(2)} ${yOf(prices[0]).toFixed(2)}`;
  for (let i = 1; i < ordered.length; i += 1) {
    const x = s(3) + stepX * i;
    // `H` y luego `V`: mantener el nivel hasta el instante del cambio y sólo entonces saltar.
    d += ` H ${x.toFixed(2)} V ${yOf(prices[i]).toFixed(2)}`;
  }

  const lastX = s(3) + stepX * (ordered.length - 1);
  const lastY = yOf(prices[prices.length - 1]);

  return (
    <Svg width={SPARK_W} height={SPARK_H}>
      {/* ⭐ El eco gris es el MISMO trazo un pelo más abajo, no una segunda serie inventada. Da el
          relieve del mock sin dibujar un precio que nunca existió — que es la línea que esta
          pantalla no cruza ni en un adorno de 40 pt. */}
      <Path
        d={d}
        stroke="#DDE6DE"
        strokeWidth={s(1.4)}
        fill="none"
        strokeLinejoin="round"
        transform={`translate(0, ${s(2).toFixed(2)})`}
      />
      <Path d={d} stroke={LIME_INK} strokeWidth={s(1.4)} fill="none" strokeLinejoin="round" />
      {/* El punto del final dice DÓNDE está hoy en esa curva. Sin él, el trazo se acaba en el canto
          y no se sabe si sigue fuera de la caja. */}
      <Circle
        cx={lastX}
        cy={lastY}
        r={s(2)}
        fill={BRAND_LIME}
        stroke="#FFFFFF"
        strokeWidth={s(0.9)}
      />
    </Svg>
  );
}
