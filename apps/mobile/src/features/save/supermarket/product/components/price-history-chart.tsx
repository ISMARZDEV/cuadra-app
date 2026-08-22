import type { PriceHistoryDto } from "@cuadra/api-client";
import { useMemo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Svg, { Line, Path } from "react-native-svg";

import { t } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { chartDomain, project, stepPath, type HistoryPoint } from "../chart/history-geometry";

/** Una línea por tienda. Se recorre en orden, así que la misma tienda mantiene su color en la
 *  pantalla mientras no cambie el número de tiendas. */
const LINE_COLORS = ["#0B6A53", "#C2410C", "#8B5CF6", "#0891B2", "#B45309"];

const HEIGHT = 128;
// Aire lateral para que el trazo no toque los cantos: una línea pegada al borde se lee como
// cortada, no como terminada.
const PAD_X = 4;
/** Aire arriba y abajo: sin él, el trazo del máximo se dibuja pegado al borde y se corta a la mitad. */
const PAD_Y = 10;

interface Props {
  history: PriceHistoryDto | undefined;
  gutter: number;
}

/**
 * El histórico de precios, en ESCALONES.
 *
 * Cada punto rige hasta el siguiente (la ingesta sólo escribe cuando el precio CAMBIA), así que
 * unirlos con rectas dibujaría precios intermedios que no existieron. Ver `chart/history-geometry`.
 *
 * El backend garantiza que no se mezclan monedas — `PriceHistoryDto.from_series` LANZA si detecta
 * dos —, así que aquí se puede formatear con una sola y sin comprobarlo otra vez.
 */
export function PriceHistoryChart({ history, gutter }: Props) {
  const { width: screenWidth } = useWindowDimensions();
  const width = screenWidth - gutter * 2 - PAD_X * 2;

  const chart = useMemo(() => {
    const series = (history?.series ?? []).map((s) =>
      s.points
        .map<HistoryPoint>((p) => ({
          capturedAtMs: Date.parse(p.captured_at),
          priceMinor: p.price_minor,
        }))
        // Una captura ilegible no se dibuja donde caiga: `NaN` en la x arrastra el trazo entero.
        .filter((p) => Number.isFinite(p.capturedAtMs))
        .sort((a, b) => a.capturedAtMs - b.capturedAtMs),
    );
    const domain = chartDomain(series, Date.now());
    if (!domain || width <= 0) return null;
    const inner = HEIGHT - PAD_Y * 2;
    return {
      domain,
      paths: series
        .filter((points) => points.length > 0)
        .map((points) =>
          stepPath(
            points.map((p) => {
              const xy = project(p, domain, width, inner);
              return { x: xy.x, y: xy.y + PAD_Y };
            }),
            width,
          ),
        ),
    };
  }, [history, width]);

  return (
    <View className="pt-6" style={{ paddingHorizontal: gutter, gap: 10 }}>
      <Text
        className="text-text dark:text-text-dark"
        style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 16 }}
      >
        {t("save.product.history.title")}
      </Text>

      {chart === null ? (
        <Text
          className="text-muted dark:text-muted-dark"
          style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13 }}
        >
          {t("save.product.history.empty")}
        </Text>
      ) : (
        <>
          {/* ⚠️ Máximo ARRIBA y mínimo ABAJO, pegados a sus guías. Puestos en una fila —uno a la
              izquierda y otro a la derecha— se leían como «empezó en $275.31 y acabó en $169.00»,
              que es una frase distinta y falsa: son los extremos del EJE, no del recorrido. */}
          <View style={{ paddingHorizontal: PAD_X }}>
            <View className="flex-row items-start justify-between">
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 10 }}
              >
                {formatMoney(chart.domain.maxMinor, history?.currency ?? "DOP")}
              </Text>
            </View>
            <Svg width={width} height={HEIGHT}>
              {/* Dos guías tenues, arriba y abajo. Una rejilla completa compite con el trazo, que
                  es lo único que hay que leer aquí. */}
              <Line x1={0} y1={PAD_Y} x2={width} y2={PAD_Y} stroke="#E3E8E4" strokeWidth={1} />
              <Line
                x1={0}
                y1={HEIGHT - PAD_Y}
                x2={width}
                y2={HEIGHT - PAD_Y}
                stroke="#E3E8E4"
                strokeWidth={1}
              />
              {chart.paths.map((d, i) => (
                <Path
                  key={i}
                  d={d}
                  stroke={LINE_COLORS[i % LINE_COLORS.length]}
                  strokeWidth={2}
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            </Svg>
            <View className="flex-row items-start justify-between">
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 10 }}
              >
                {formatMoney(chart.domain.minMinor, history?.currency ?? "DOP")}
              </Text>
            </View>

            {/* Los extremos del eje de tiempo. Sin ellos el trazo no dice si cubre una semana o un
                año, y una meseta larga se lee igual que una corta. */}
            <View className="flex-row items-center justify-between" style={{ marginTop: 6 }}>
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 10 }}
              >
                {shortDate(chart.domain.startMs)}
              </Text>
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 10 }}
              >
                {shortDate(chart.domain.endMs)}
              </Text>
            </View>
          </View>

          {/* Decir en voz alta que son escalones evita que alguien lea la meseta como «no miramos». */}
          <Text
            className="text-muted dark:text-muted-dark"
            style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 11 }}
          >
            {t("save.product.history.stepNote")}
          </Text>
        </>
      )}
    </View>
  );
}

/** Fecha corta para los extremos del eje. Se formatea en el idioma de la app, no en el del reloj. */
function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
