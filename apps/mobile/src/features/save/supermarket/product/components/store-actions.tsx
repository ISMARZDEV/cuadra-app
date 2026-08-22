import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Copy, Search, ShoppingCart } from "lucide-react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { Icon } from "@/components/ui/icon";
import { copyToClipboard } from "@/lib/clipboard";
import { t } from "@/i18n";
import { KANTUMRUY_SEMIBOLD } from "@/theme/fonts";
import { SquircleCard } from "@/components/ui/squircle-card";

import { BRAND_LIME, CHIP_EDGE, SHOP_BUTTON_EDGE, SHOP_BUTTON_GRADIENT, TEAL } from "../product-palette";

interface Props {
  /** La web de la tienda más barata. Sin ella no se dibuja nada: ver abajo. */
  url?: string | null;
  onOpen: () => void;
}

/**
 * Las dos acciones sobre la tienda: ir a comprar, y llevarse el enlace.
 *
 * ⭐ **Sin `url` no se dibuja NADA, ni deshabilitado.** Save compara, no vende: el destino de una
 * tienda es SU web, y un botón «Comprar en la tienda» que no lleva a ninguna parte promete una
 * capacidad que no tenemos. Un botón gris pidiendo que lo toques para descubrir que no hace nada
 * es peor que un hueco.
 *
 * ⭐ El enlace se ENSEÑA, no sólo se abre. En un comparador, ver a dónde te manda antes de tocar
 * es parte de por qué te fías: el usuario reconoce el dominio de su súper.
 */
export function StoreActions({ url, onOpen }: Props) {
  const [copied, setCopied] = useState(false);
  if (!url) return null;

  const copy = () => {
    // `expo-clipboard` NO está instalado y meterlo exige `expo prebuild` + recompilar el
    // dev-client. El repo ya aisló esa deuda en un solo archivo — ver `lib/clipboard.ts`.
    copyToClipboard(url);
    setCopied(true);
    // Vuelve solo. Un acuse que se queda para siempre deja de decir «acabo de copiar» y pasa a ser
    // parte del dibujo.
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <View className="flex-row items-center" style={{ gap: 8 }}>
      {/* ⭐ La FORMA la pone el squircle y el TOQUE el `Pressable` de dentro: un `Pressable` no
          puede ser la vista nativa del squircle. El `overflow` vive aquí porque es lo que recorta
          el degradado contra la esquina suavizada — dejándolo en el `Pressable` se recortaría
          contra una esquina circular y el canto delataría las dos formas. */}
      <SquircleCard
        style={{
          borderRadius: 8,
          overflow: "hidden",
          // El filo inferior es lo que le da el relieve del mock. Un borde entero lo convertiría
          // en un recuadro; sólo abajo se lee como volumen.
          borderBottomWidth: 2,
          borderBottomColor: SHOP_BUTTON_EDGE,
        }}
      >
      <Pressable
        accessibilityRole="button"
        aria-label={t("save.product.stores.buyAtStore")}
        accessibilityLabel={t("save.product.stores.buyAtStore")}
        onPress={onOpen}
        className="flex-row items-center justify-center"
        style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 8 }}
      >
        {/* Degradado con react-native-svg, no `expo-linear-gradient`: es lo que usa el resto de la
            app (`pill-button`) y evita meter una segunda forma de pintar lo mismo. */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="shopBtn" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={SHOP_BUTTON_GRADIENT[0]} />
              <Stop offset="0.5" stopColor={SHOP_BUTTON_GRADIENT[1]} />
              <Stop offset="1" stopColor={SHOP_BUTTON_GRADIENT[2]} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#shopBtn)" />
        </Svg>

        <Text style={{ fontFamily: KANTUMRUY_SEMIBOLD, fontSize: 12, color: "#FFFFFF" }}>
          {t("save.product.stores.buyAtStore")}
        </Text>
        <Icon as={ShoppingCart} size={15} color="#FFFFFF" strokeWidth={2} />
      </Pressable>
      </SquircleCard>

      <SquircleCard
        className="flex-1 bg-white"
        style={{
          height: 30,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: CHIP_EDGE,
          overflow: "hidden",
        }}
      >
      <Pressable
        accessibilityRole="button"
        aria-label={copied ? t("save.product.stores.linkCopied") : t("save.product.stores.copyLink")}
        accessibilityLabel={
          copied ? t("save.product.stores.linkCopied") : t("save.product.stores.copyLink")
        }
        onPress={copy}
        className="flex-row items-center"
        style={{ flex: 1, gap: 6, paddingHorizontal: 6 }}
      >
        <View
          className="items-center justify-center"
          style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: BRAND_LIME }}
        >
          <Icon as={Search} size={11} color="#034842" strokeWidth={2.5} />
        </View>

        <Text
          style={{
            fontFamily: KANTUMRUY_SEMIBOLD,
            fontSize: 10,
            color: TEAL,
            textDecorationLine: "underline",
            flex: 1,
          }}
          numberOfLines={1}
        >
          {url}
        </Text>

        <Icon as={Copy} size={12} color={copied ? "#16A34A" : "#9CA3AF"} strokeWidth={2} />
      </Pressable>
      </SquircleCard>
    </View>
  );
}
