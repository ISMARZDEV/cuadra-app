import * as Haptics from "expo-haptics";
import { FlatList, Pressable, Text, View } from "react-native";
import { useColorScheme } from "nativewind";

import { sounds } from "@/lib/sounds";
import { KANTUMRUY_MEDIUM, KANTUMRUY_SEMIBOLD } from "@/theme/fonts";

import BasketProductCard, { CARD_WIDTH } from "./basket-product-card";
import type { DockInteractionViewProps, DockOption } from "../interfaces";

// One HITL step rendered inside the glass dock (register-expense flow, Img 8-11): a centered prompt
// with a row of options. Generic — the backend emits {prompt, options} and this paints it, so
// confirm / category / suggestion steps all reuse it. Three option kinds: `pill` (text button),
// `chip` (round icon-only avatar, the category suggestions of Img 10), and `product` (carousel card
// for grocery disambiguation). The whole option is reported back (the hook echoes the choice as a
// user bubble before resuming).

// primary = lime affirmative; secondary = translucent green. Theme-inverted so neither washes out.
function pillColors(primary: boolean, isDark: boolean) {
  const bg = primary ? (isDark ? "#C2FB7E" : "#034842") : isDark ? "#16352A" : "#D9F5C2";
  const fg = primary ? (isDark ? "#04392B" : "#C2FB7E") : isDark ? "#C2FB7E" : "#034842";
  return { bg, fg };
}

function OptionPill({ option, onPress }: { option: DockOption; onPress: () => void }) {
  const { colorScheme } = useColorScheme();
  const { bg, fg } = pillColors(option.variant === "primary", colorScheme === "dark");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label ?? option.value}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 20,
        paddingVertical: 12,
      }}
    >
      {option.icon ? <Text style={{ fontSize: 16, fontFamily: KANTUMRUY_MEDIUM }}>{option.icon}</Text> : null}
      <Text style={{ color: fg, fontSize: 15, fontFamily: KANTUMRUY_SEMIBOLD }}>{option.label}</Text>
    </Pressable>
  );
}

// Round icon-only avatar — a white disc with the category emoji + a soft ring & shadow (Img 10).
function IconChip({ option, onPress }: { option: DockOption; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.value}
      onPress={onPress}
      style={{
        width: 50,
        height: 50,
        borderRadius: 25,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#FFFFFF",
        borderWidth: 2.5,
        borderColor: option.color ?? "rgba(255,255,255,0.85)", // per-category ring (Img 10)
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.22,
        shadowRadius: 5,
        elevation: 4,
      }}
    >
      <Text style={{ fontSize: 24, fontFamily: KANTUMRUY_MEDIUM }}>{option.icon}</Text>
    </Pressable>
  );
}

// Render a prompt, highlighting **…** spans in lime (the money amount, Img 8): "…de **$500 USD**?".
function PromptText({ prompt, accent }: { prompt: string; accent: string }) {
  const parts = prompt.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text className="mb-3 text-center font-sans text-lg leading-6 text-text">
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <Text key={i} className="font-sans-semibold" style={{ color: accent }}>
            {part.slice(2, -2)}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

// El ancho lo manda la tarjeta (CARD_WIDTH). Copiarlo acá hacía que `getItemLayout` mintiera en
// cuanto la tarjeta cambiaba de tamaño.
const CARD_GAP = 5;
const CAROUSEL_INSET = 16; // == the px-4 of the prompt

function ProductOptionsCarousel({
  options,
  onSelect,
  onViewProduct,
}: {
  options: DockOption[];
  onSelect: (option: DockOption) => void;
  onViewProduct?: (option: DockOption) => void;
}) {
  return (
    <FlatList
      horizontal
      showsHorizontalScrollIndicator={false}
      // The scroll VIEWPORT must span the dock edge to edge — the inset lives in the content, not
      // in the container. With padding on the wrapper the list clipped 16px short of the chat
      // card, so a card vanished mid-scroll instead of at the card's own rounded limit.
      style={{ alignSelf: "stretch" }}
      data={options}
      keyExtractor={(option) => option.value}
      renderItem={({ item }) =>
        item.product ? (
          <BasketProductCard
            item={item.product}
            currency={item.product.currency}
            mode="picker"
            onSelect={() => onSelect(item)}
            onView={() => onViewProduct?.(item)}
          />
        ) : null
      }
      ItemSeparatorComponent={() => <View style={{ width: 5 }} />}
      // Same 16px as the prompt above, so the first card lines up with the text.
      contentContainerStyle={{ paddingHorizontal: CAROUSEL_INSET }}
      nestedScrollEnabled
      removeClippedSubviews
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      getItemLayout={(_data, index) => ({
        length: CARD_WIDTH,
        offset: CAROUSEL_INSET + (CARD_WIDTH + CARD_GAP) * index,
        index,
      })}
    />
  );
}

export function DockInteractionView({ interaction, onSelect, onViewProduct }: DockInteractionViewProps) {
  const { colorScheme } = useColorScheme();
  // Readable lime: brand lime on dark, a deeper green on the off-white card.
  const accent = colorScheme === "dark" ? "#C2FB7E" : "#16A34A";
  // Same cue as sending a message (chat-input-bar.tsx) — picking a dock option (confirm/cancel,
  // category, currency…) is just as much a "commit" action. Centralized here (not per-component)
  // so both pill and chip options get it without duplicating the call.
  const handleSelect = (option: DockOption) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sounds.send();
    onSelect(option);
  };

  const productOptions = interaction.options.filter((o) => o.kind === "product");
  const hasProducts = productOptions.length > 0;

  return (
    <View className="py-2">
      <View className="px-4">
        <PromptText prompt={interaction.prompt} accent={accent} />
      </View>
      {hasProducts ? (
        <ProductOptionsCarousel
          options={productOptions}
          onSelect={handleSelect}
          onViewProduct={onViewProduct}
        />
      ) : (
        <View className="flex-row flex-wrap items-center justify-center gap-3 px-4">
          {interaction.options.map((option) =>
            option.kind === "chip" ? (
              <IconChip key={option.value} option={option} onPress={() => handleSelect(option)} />
            ) : (
              <OptionPill key={option.value} option={option} onPress={() => handleSelect(option)} />
            ),
          )}
        </View>
      )}
    </View>
  );
}
