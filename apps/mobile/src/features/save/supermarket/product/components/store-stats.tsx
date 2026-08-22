import { Star, TrendingUp } from "lucide-react-native";
import { Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import type { StoreStanding } from "../product-view";

/**
 * Los cuatro tiles de la comparativa: más bajo, más alto, diferencia y cuántas tiendas.
 *
 * ⭐ Salen del MISMO array que las filas — el primero y el último de `storeStandings`, que ya viene
 * ordenado. No se recalcula nada. En el mockup del admin sí se recalculaba y se notó: el tile decía
 * RD$76.00, la fila más cara RD$75.00 y la diferencia RD$1.00, tres números que no cerraban entre
 * sí. Derivarlos de un solo sitio hace que esa contradicción no pueda volver a existir.
 *
 * Con UNA sola tienda no se dibuja: «más bajo», «más alto» y «diferencia» sobre un único precio son
 * tres formas de decir lo mismo, y la diferencia sería siempre cero.
 */
export function StoreStats({ standings }: { standings: readonly StoreStanding[] }) {
  if (standings.length < 2) return null;

  const cheapest = standings[0];
  const priciest = standings[standings.length - 1];
  const currency = cheapest.row.currency;
  const spread = priciest.price_minor - cheapest.price_minor;

  return (
    <View className="flex-row" style={{ gap: 8 }}>
      <Tile
        value={formatMoney(cheapest.price_minor, currency)}
        label={t("save.product.stores.lowestTile")}
        tone="good"
        icon={Star}
      />
      <Tile
        value={formatMoney(priciest.price_minor, currency)}
        label={t("save.product.stores.highestTile")}
        tone="warn"
        icon={TrendingUp}
      />
      <Tile value={formatMoney(spread, currency)} label={t("save.product.stores.spreadTile")} />
      <Tile value={String(standings.length)} label={t("save.product.stores.countTile")} />
    </View>
  );
}

const TONES = {
  good: { bg: "#F1F9EC", border: "#BBEB71", fg: "#2F6B1E" },
  warn: { bg: "#FEF6E7", border: "#F5C976", fg: "#9A5B12" },
  plain: { bg: "transparent", border: "#E3E8E4", fg: undefined },
} as const;

function Tile({
  value,
  label,
  tone = "plain",
  icon,
}: {
  value: string;
  label: string;
  tone?: keyof typeof TONES;
  icon?: Parameters<typeof Icon>[0]["as"];
}) {
  const c = TONES[tone];
  return (
    <View
      className="flex-1 items-center rounded-2xl px-2"
      style={{
        paddingVertical: 10,
        gap: 3,
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
      }}
    >
      <View className="flex-row items-center" style={{ gap: 4 }}>
        {icon ? <Icon as={icon} size={12} color={c.fg ?? "#6B7280"} /> : null}
        <Text
          className={c.fg ? "" : "text-text dark:text-text-dark"}
          style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 13, color: c.fg }}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {value}
        </Text>
      </View>
      <Text
        className="text-muted dark:text-muted-dark text-center"
        style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 9 }}
        numberOfLines={2}
      >
        {label}
      </Text>
    </View>
  );
}
