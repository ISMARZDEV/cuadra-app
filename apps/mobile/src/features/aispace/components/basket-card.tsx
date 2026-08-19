import { memo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FlatList, Pressable, Text, View } from "react-native";
import { type Href, useRouter } from "expo-router";

import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import type { BasketCardData, BasketProviderData } from "../interfaces";
import BasketProductCard, { CARD_WIDTH } from "@/components/ui/basket-product-card";
import { ProviderLogo } from "./provider-logo";

// Basket-by-budget: one summary + collapsible product-list button per provider.
// No parent card; each provider block sits directly in the chat below the agent text.
// MEMOIZADO: es una fila de la lista del chat. Sin esto, cualquier re-render de `chat-screen`
// re-renderiza TODAS las filas de la conversación — el coste crece con el largo del historial.
function BasketCardBase({ data }: { data: BasketCardData }) {
  const sortedProviders = [...data.providers].sort(
    (a, b) => Number(b.is_cheapest) - Number(a.is_cheapest),
  );

  return (
    <View className="w-full gap-3 px-3 py-2">
      {sortedProviders.map((provider) => (
        <ProviderSection
          key={provider.provider_id}
          provider={provider}
          currency={data.currency}
        />
      ))}
    </View>
  );
}

function ProviderSection({
  provider,
  currency,
}: {
  provider: BasketProviderData;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  // La navegación vive acá y no dentro del card: el card sabe dibujarse, no a dónde lleva un toque.
  const router = useRouter();

  return (
    <View>
      {/* Provider summary */}
      <View className="flex-row items-start justify-between">
        <View className="flex-1">
            <View className="flex-row items-center gap-2">
            <ProviderLogo name={provider.provider_name} />
            {provider.is_cheapest ? (
              <View className="rounded-full bg-primary/15 px-2 py-0.5">
                <Text
                  className="text-[10px] text-primary"
                  style={{ fontFamily: KANTUMRUY_SEMIBOLD }}
                >
                  {t("chat.basket.cheapest")}
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-0.5 text-[12px] text-[#84AB55]" style={{ fontFamily: KANTUMRUY_SEMIBOLD }}>
            {t("chat.basket.groups", { count: String(provider.groups_covered.length) })} ·{" "}
            {t("chat.basket.items", { count: String(provider.items_count) })}
          </Text>
          <Text className="text-[12px] text-[#434343] text-nowrap" style={{ fontFamily: KANTUMRUY_MEDIUM }}>
            {t("chat.basket.spent", { spent: provider.total, remaining: provider.remaining })}
          </Text>
        </View>
        <View className="items-end">
          <Text
            className="text-base text-text"
            style={{ fontFamily: KANTUMRUY_SEMIBOLD }}
          >
            {provider.total}
          </Text>
        </View>
      </View>

      {/* Collapsible trigger — Figma gradient + bottom border + continuous corners */}
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        className="mt-2 overflow-hidden rounded-xl"
        style={{ borderCurve: "continuous" }}
      >
        <LinearGradient
          colors={["#C2FB7E", "#D9FFAB", "#C2FB7E"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          locations={[0.2236, 0.4857, 0.706]}
          style={{ borderBottomWidth: 1.675, borderBottomColor: "#C2FB7E" }}
        >
          <View className="flex-row items-center justify-between px-3 py-3">
            <Text
              className="text-[12px] text-[#034842]"
              style={{ fontFamily: KANTUMRUY_SEMIBOLD }}
            >
              {t("chat.basket.seeList")}
            </Text>
            <Icon as={open ? ChevronUp : ChevronDown} size={18} color="#034842" strokeWidth={2} />
          </View>
        </LinearGradient>
      </Pressable>

      {/* Product carousel */}
      {open ? (
        <View className="mt-2 rounded-xl bg-[#F4F4F4] py-3">
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={provider.items}
            keyExtractor={(item) => item.canonical_product_id}
            renderItem={({ item }) => (
              <BasketProductCard
                item={item}
                currency={currency}
                onSelect={() => router.push("/save" as Href)}
              />
            )}
            ItemSeparatorComponent={() => <View style={{ width: 5 }} />}
            contentContainerStyle={{ paddingHorizontal: 8 }}
            nestedScrollEnabled
            removeClippedSubviews
            scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled"
            getItemLayout={(_data, index) => ({
              length: CARD_WIDTH,
              offset: 8 + (CARD_WIDTH + 5) * index,
              index,
            })}
          />
        </View>
      ) : null}
    </View>
  );
}
export const BasketCard = memo(BasketCardBase);
