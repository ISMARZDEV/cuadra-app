import { FlatList, View } from "react-native";
import { type Href, useRouter } from "expo-router";

import type { ProviderProductsData } from "../interfaces";
import BasketProductCard, { CARD_WIDTH } from "./basket-product-card";
import { ProviderLogo } from "./provider-logo";

// Provider product list: a twin of BasketCard for search results.
// The agent explains context in plain text above; this card just renders each provider's
// products in the same carousel used inside a budget basket.
export function ProviderProductsCard({ data }: { data: ProviderProductsData }) {
  // La navegación vive acá y no dentro del card: el card sabe dibujarse, no a dónde lleva un toque.
  // Mismo patrón que agent-message.tsx.
  const router = useRouter();
  const goToSave = () => router.push("/save" as Href);

  return (
    <View className="w-full gap-5 px-3 py-2">
      {data.providers.map((provider) => (
        <View key={provider.provider_id}>
          <View className="mb-2">
            <ProviderLogo name={provider.provider_name} />
          </View>

          <View className="rounded-xl bg-[#F4F4F4] py-3">
            <FlatList
              horizontal
              showsHorizontalScrollIndicator={false}
              data={provider.items}
              keyExtractor={(item) => item.canonical_product_id}
              renderItem={({ item }) => (
                <BasketProductCard
                  item={item}
                  currency={data.currency}
                  onSelect={goToSave}
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
        </View>
      ))}
    </View>
  );
}
