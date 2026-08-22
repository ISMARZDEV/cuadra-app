import { ChevronRight, Star, TrendingUp } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { MICRO, ROW_PRICE, ROW_TITLE } from "../product-type";
import { freshnessOf, rowTintClass, type StoreStanding } from "../product-view";

interface Props {
  standing: StoreStanding;
  onPress?: () => void;
  /** En la hoja las filas son elegibles y la seleccionada se marca; en el panel no. */
  selected?: boolean;
}

const LOGO = 34;

/**
 * Una tienda en la comparativa: logotipo, posición, precio, precio anterior y cuándo se vio.
 *
 * Es el gemelo móvil de la fila del panel del admin, con los MISMOS datos y la misma jerarquía.
 * Todo lo que decide (quién es la más barata, cuánto se ahorra) viene ya resuelto en `standing`,
 * derivado de un solo cálculo — nunca se recalcula aquí, que es cómo dos partes de una pantalla
 * acaban diciendo números distintos.
 */
export function StoreRow({ standing, onPress, selected = false }: Props) {
  const { row, extraMinor, standing: place } = standing;
  const currency = row.currency;
  const fresh = freshnessOf(row.last_seen_at);
  // `previous_price_minor` es `null` cuando la tienda nunca movió el precio: ESO es lo que apaga
  // el tachado. Un 0 encendería un tachado de «$0.00».
  const previous = row.previous_price_minor;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      aria-label={onPress ? t("save.product.stores.openStore").replace("{store}", row.provider_name) : undefined}
      accessibilityLabel={onPress ? t("save.product.stores.openStore").replace("{store}", row.provider_name) : undefined}
      onPress={onPress}
      // La más barata se distingue con un fondo tenue, no sólo con el sello: el sello se lee
      // después del precio y la fila tiene que cantar antes de leerla entera.
      //
      // ⚠️ El tinte va por CLASE y no por `style`, para que tenga pareja en oscuro. Clavado en el
      // estilo, en tema oscuro el texto se volvía blanco sobre un verde clarísimo y la tienda y su
      // precio se volvían ilegibles — ver `rowTintClass`.
      className={`flex-row items-center rounded-2xl px-3 ${rowTintClass(place === "cheapest" || selected)}`}
      style={{
        gap: 12,
        paddingVertical: 12,
        borderWidth: selected ? 1 : 0,
        borderColor: "#BBEB71",
      }}
    >
      {/* Sin logotipo va la INICIAL, no un cuadro gris vacío: el hueco se lee como una imagen que
          no cargó —un error— cuando en realidad esa tienda simplemente no tiene logo cargado. */}
      <View
        className="items-center justify-center"
        style={{
          width: LOGO,
          height: LOGO,
          borderRadius: 10,
          backgroundColor: "#EEF3EE",
          overflow: "hidden",
        }}
      >
        {row.provider_logo_url ? (
          <Image
            source={{ uri: row.provider_logo_url }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        ) : (
          <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 15, color: "#0B6A53" }}>
            {row.provider_name.trim().charAt(0).toUpperCase()}
          </Text>
        )}
      </View>

      <View className="flex-1" style={{ gap: 3 }}>
        <Text
          className="text-text dark:text-text-dark"
          style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: ROW_TITLE }}
          numberOfLines={1}
        >
          {row.provider_name}
        </Text>
        <StandingBadge place={place} />
        {fresh ? (
          <Text
            className="text-muted dark:text-muted-dark"
            style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: MICRO }}
          >
            {fresh.unit === "minute" && fresh.value === 0
              ? t("save.product.seen.justNow")
              : t(`save.product.seen.${fresh.unit}` as Parameters<typeof t>[0]).replace(
                  "{n}",
                  String(fresh.value),
                )}
          </Text>
        ) : null}
      </View>

      <View className="items-end" style={{ gap: 2 }}>
        <Text
          className="text-text dark:text-text-dark"
          style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: ROW_PRICE }}
        >
          {formatMoney(row.price_minor, currency)}
        </Text>
        {previous != null ? (
          <Text
            className="text-muted dark:text-muted-dark"
            style={{
              fontFamily: KANTUMRUY_MEDIUM,
              fontSize: 11,
              textDecorationLine: "line-through",
            }}
          >
            {formatMoney(previous, currency)}
          </Text>
        ) : null}
        {/* El sobreprecio SÓLO donde significa algo. En la más barata la diferencia es cero por
            definición, y escribir «Mismo precio» junto al sello «Mejor precio» son dos etiquetas
            diciendo lo mismo en la misma fila — y la segunda encima suena a que empata con alguien.
            Donde SÍ hay empate real (dos tiendas al mismo precio mínimo) el sello ya lo cuenta. */}
        {extraMinor > 0 ? (
          <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: MICRO, color: "#C2410C" }}>
            +{formatMoney(extraMinor, currency)}
          </Text>
        ) : null}
      </View>

      {onPress ? <Icon as={ChevronRight} size={18} color="#9CA3AF" /> : null}
    </Pressable>
  );
}

function StandingBadge({ place }: { place: StoreStanding["standing"] }) {
  if (place === "middle") return null;

  const style = {
    cheapest: { bg: "#DDF3C6", fg: "#2F6B1E", icon: Star, key: "save.product.stores.best" },
    priciest: { bg: "#FDEBD3", fg: "#9A5B12", icon: TrendingUp, key: "save.product.stores.highest" },
    only: { bg: "#EDF1F5", fg: "#4B5563", icon: Star, key: "save.product.stores.only" },
  }[place];

  return (
    <View
      className="flex-row items-center self-start rounded-full px-2"
      style={{ gap: 4, paddingVertical: 3, backgroundColor: style.bg }}
    >
      <Icon as={style.icon} size={11} color={style.fg} />
      <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 10, color: style.fg }}>
        {t(style.key as Parameters<typeof t>[0])}
      </Text>
    </View>
  );
}
