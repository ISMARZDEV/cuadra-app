import { ChevronRight } from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { Image, Text, View } from "react-native";

import { Icon } from "@/components/ui/icon";
import { formatMoney } from "@/lib/money";
import { AKSHAR_SEMIBOLD } from "@/theme/fonts";

import { type BrandKey, MerchantBrandLogo } from "./merchant-brand";

// The visual pill of a transaction row (the press/long-press behavior lives in TxRowItem) — a dark
// pill with a cream border, name (green) + date, a WHITE amount, the merchant's BRAND logo (real
// logo_url → local brand SVG → emoji stand-in), and a white chevron. Pure View: TxRowItem wraps it
// in the pressable + long-press-to-reveal-category/actions overlay.
export function TxRow({
  brandKey,
  brandLogoUrl,
  brandEmoji,
  merchantName,
  dateLabel,
  amountMinor,
  currency,
}: {
  brandKey?: BrandKey;
  brandLogoUrl?: string;
  brandEmoji?: string;
  merchantName: string;
  dateLabel: string;
  amountMinor: number;
  currency: string;
}) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        height: 58,
        backgroundColor: isDark ? "#002628" : "white",
        borderRadius: 16,
        borderCurve: "continuous",
        borderWidth: 2.5,
        borderColor: "#FBD3A8",
        paddingLeft: 14,
        paddingRight: 8,
      }}
    >
      {/* flex:1 + minWidth:0 lets a long name shrink and truncate ("…") instead of pushing the
          amount/logo out; the right group is flexShrink:0 so it always shows in full. */}
      <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
        <Text
          style={{ color: isDark ? "#7DE996" : "#034842", fontSize: 14, fontWeight: "700" }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {merchantName}
        </Text>
        <Text style={{ color: isDark ? "#C7D4CE" : "#929292", fontSize: 11, fontWeight: "500" }}>
          {dateLabel}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <Text
          style={{ color: isDark ? "white" : "#034842", fontFamily: AKSHAR_SEMIBOLD, fontSize: 16 }}
          numberOfLines={1}
        >
          -{formatMoney(Math.abs(amountMinor), currency)}
        </Text>
        {/* Brand logo — priority: real merchant logo_url (remote image) → local brand SVG
            (theme-aware, public/brands/) → brand emoji stand-in. */}
        {(brandLogoUrl || brandKey || brandEmoji) && (
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              backgroundColor: brandKey ? "transparent" : "white",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {brandLogoUrl ? (
              <Image source={{ uri: brandLogoUrl }} style={{ width: 26, height: 26 }} resizeMode="cover" />
            ) : brandKey ? (
              <MerchantBrandLogo brandKey={brandKey} isDark={isDark} size={26} />
            ) : (
              <Text style={{ fontSize: 15 }}>{brandEmoji}</Text>
            )}
          </View>
        )}
        <Icon as={ChevronRight} size={20} color={isDark ? "white" : "#034842"} strokeWidth={2.5} />
      </View>
    </View>
  );
}
