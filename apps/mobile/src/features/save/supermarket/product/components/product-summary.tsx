import { Bookmark, Star, Zap } from "lucide-react-native";
import { useState } from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import type { SharedValue } from "react-native-reanimated";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import { MOCK_FAST_DELIVERY, MOCK_RATING } from "../product-placeholders";
import { PRICE, PRICE_CENTS, TITLE } from "../product-type";
import { freshnessOf, priceParts } from "../product-view";
import { CascadeItem } from "@/components/ui/cascade-item";

import { STEPS as Step } from "../motion/entrance";
import { StoreAvatars, type AvatarStore } from "./store-avatars";

interface Props {
  name: string;
  displaySize?: string | null;
  brand?: string | null;
  imageUrl?: string | null;
  priceMinor: number;
  currency: string;
  priceType?: string | null;
  seenAt?: string | null;
  stores: readonly AvatarStore[];
  description?: string | null;
  following: boolean;
  onToggleFollow: () => void;
  /**
   * El reloj COMPARTIDO de la cascada, que ya no es de esta cabecera: la pantalla pone dos bloques
   * más («Otras tiendas» y el histórico) y tienen que ir en la MISMA escalera. Ver `ProductEntrance`.
   */
  cascade: SharedValue<number>;
}

const DESCRIPTION_LINES = 3;

/**
 * La cabecera del detalle: foto, identidad, precio y las señales de confianza.
 *
 * ⭐ El precio grande es el MÍNIMO ENTRE TIENDAS, no el de una tienda concreta. Es la respuesta a
 * «cuánto me cuesta esto» en un comparador, y por eso va acompañado SIEMPRE de en cuántas tiendas
 * se miró: un precio sin ese contexto se lee como «el precio», y no lo es.
 */
export function ProductSummary({
  name,
  displaySize,
  brand,
  imageUrl,
  priceMinor,
  currency,
  priceType,
  seenAt,
  stores,
  description,
  following,
  onToggleFollow,
  cascade,
}: Props) {
  const { height: screenHeight } = useWindowDimensions();
  // ⭐ Se DERIVA de la pantalla, no es un número fijo: en la referencia la foto ocupa un 38% del
  // alto, y un valor clavado sería generoso en un Pro Max y ahogaría la foto en un SE. Las cotas
  // sólo evitan los dos extremos absurdos.
  const imageHeight = Math.min(380, Math.max(250, Math.round(screenHeight * 0.38)));
  const [expanded, setExpanded] = useState(false);

  const { whole, cents } = priceParts(priceMinor, currency);
  const fresh = freshnessOf(seenAt);

  return (
    <View>
      {/* El tirador de la referencia. No es decoración: dice que esta hoja blanca es una SUPERFICIE
          que se puede desplazar, y sin él la pantalla se lee como un fondo fijo con la foto pegada. */}
      <View
        style={{
          alignSelf: "center",
          width: 46,
          height: 5,
          borderRadius: 3,
          backgroundColor: "#D8DEDA",
          marginTop: 6,
          marginBottom: 2,
        }}
      />

      {/* La foto sobre blanco: el catálogo llega con fondos recortados y cualquier tinte de marca
          detrás los delata con un halo. `contain` porque los tamaños de origen no son uniformes.
          El alto sale de la PANTALLA, no de un número fijo: en la referencia ocupa cerca de un
          tercio, y 240pt clavados son generosos en un Pro Max y ahogan la foto en un SE. */}
      <CascadeItem progress={cascade} index={Step.Photo}>
        <View className="items-center justify-center" style={{ height: imageHeight }}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={{ width: "76%", height: "92%" }}
              resizeMode="contain"
            />
          ) : null}
        </View>
      </CascadeItem>

      <View className="px-5 pt-3" style={{ gap: 4 }}>
        <CascadeItem progress={cascade} index={Step.Name}>
        <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
          <View className="flex-1">
            <Text
              className="text-text dark:text-text-dark"
              style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: TITLE, lineHeight: TITLE * 1.25 }}
            >
              {name}
            </Text>
            {brand ? (
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13, marginTop: 2 }}
              >
                {brand}
              </Text>
            ) : null}
            {displaySize ? (
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 12, marginTop: 2 }}
              >
                {displaySize}
              </Text>
            ) : null}
          </View>

          {/* El corazón del mock es aquí SEGUIR EL PRECIO, que es lo que este producto sabe hacer:
              no hay «favoritos», hay alertas de bajada. El icono es un marcador, no un corazón, para
              no prometer una lista de deseos que no existe. */}
          <Pressable
            accessibilityRole="button"
            aria-label={following ? t("save.product.follow.on") : t("save.product.follow.off")}
            accessibilityLabel={following ? t("save.product.follow.on") : t("save.product.follow.off")}
            onPress={onToggleFollow}
            hitSlop={8}
            className="items-center justify-center rounded-full border border-border dark:border-border-dark"
            style={{ width: 40, height: 40 }}
          >
            <Icon
              as={Bookmark}
              size={20}
              color={following ? "#16A34A" : "#9CA3AF"}
              fill={following ? "#16A34A" : "transparent"}
            />
          </Pressable>
        </View>
        </CascadeItem>

        {/* Precio: entero grande y céntimos volados, como el card. Los céntimos salen del formateo
            de la MONEDA, nunca de un %100 — el yen no tiene decimales que volar. */}
        {/* Precio a la izquierda y entrega a la DERECHA, en extremos opuestos como la referencia.
            Juntos se leían como una sola frase —«204,95 disponible con entrega rápida»— cuando son
            dos datos que no tienen nada que ver el uno con el otro. */}
        <CascadeItem progress={cascade} index={Step.Price}>
        <View className="mt-2 flex-row items-center justify-between">
          <View className="flex-row items-start">
            <Text
              className="text-text dark:text-text-dark"
              style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: PRICE, lineHeight: PRICE * 1.1 }}
            >
              {whole}
            </Text>
            {cents ? (
              <Text
                className="text-text dark:text-text-dark"
                style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: PRICE_CENTS, marginTop: 4 }}
              >
                {cents}
              </Text>
            ) : null}
          </View>

          {MOCK_FAST_DELIVERY ? (
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <Icon as={Zap} size={13} color="#8B5CF6" fill="#8B5CF6" />
              <Text
                className="text-muted dark:text-muted-dark"
                style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 12 }}
              >
                {t("save.product.fastDelivery")}
              </Text>
            </View>
          ) : null}
        </View>
        </CascadeItem>

        {/* Tipo de precio + frescura. Es la única fila de esta pantalla que dice algo que ningún
            catálogo puede copiar, y por eso va pegada al precio y no escondida abajo. */}
        {priceType || fresh ? (
          <CascadeItem progress={cascade} index={Step.Signals}>
          <Text
            className="text-muted dark:text-muted-dark"
            style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 12 }}
          >
            {[priceType ? priceTypeLabel(priceType) : null, fresh ? freshLabel(fresh) : null]
              .filter(Boolean)
              .join(" · ")}
          </Text>
          </CascadeItem>
        ) : null}

        <CascadeItem progress={cascade} index={Step.Stores}>
        <View className="mt-2 flex-row items-center justify-between">
          <StoreAvatars
            stores={stores}
            label={
              stores.length === 1
                ? t("save.product.inOneStore")
                : t("save.product.inStores").replace("{n}", String(stores.length))
            }
          />
          <View className="flex-row items-center" style={{ gap: 5 }}>
            <Icon as={Star} size={15} color="#0B6A53" fill="#0B6A53" />
            <Text
              className="text-text dark:text-text-dark"
              style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 13 }}
            >
              {MOCK_RATING} {t("save.product.rating")}
            </Text>
          </View>
        </View>
        </CascadeItem>

        {description ? (
          <CascadeItem progress={cascade} index={Step.Description}>
          <View className="mt-4 border-t border-border pt-4 dark:border-border-dark">
            <Text
              className="text-muted dark:text-muted-dark"
              style={{ fontFamily: KANTUMRUY_MEDIUM, fontSize: 13, lineHeight: 19 }}
              numberOfLines={expanded ? undefined : DESCRIPTION_LINES}
            >
              {description}
            </Text>
            <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={6} className="mt-1">
              <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 13, color: "#0B6A53" }}>
                {expanded ? t("save.product.readLess") : t("save.product.readMore")}
              </Text>
            </Pressable>
          </View>
          </CascadeItem>
        ) : null}
      </View>
    </View>
  );
}

/** `online|shelf|delivery|receipt` nunca se mezclan, así que el usuario tiene derecho a saber cuál mira. */
function priceTypeLabel(type: string): string {
  const key = `save.product.priceType.${type}`;
  const known = ["online", "shelf", "delivery", "receipt"];
  return known.includes(type) ? t(key as Parameters<typeof t>[0]) : type;
}

function freshLabel(fresh: { unit: "minute" | "hour" | "day"; value: number }): string {
  if (fresh.unit === "minute" && fresh.value === 0) return t("save.product.seen.justNow");
  return t(`save.product.seen.${fresh.unit}` as Parameters<typeof t>[0]).replace(
    "{n}",
    String(fresh.value),
  );
}
