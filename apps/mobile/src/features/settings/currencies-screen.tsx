import { useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackground } from "@/components/ui/app-background";
import { Icon } from "@/components/ui/icon";
import { t } from "@/i18n";
import { useCurrencyPreferences, useSetExtraCurrencies } from "@/lib/hooks/use-currency-preferences";
import { palette } from "@/theme";

import { SelectableRow } from "./components/selectable-row";
import { CURRENCY_OPTIONS, MAX_EXTRA_CURRENCIES } from "./currency-options";

// Currency selector (reached from Config → "Monedas"). The primary currency (derived server-side
// from identity.home_market) is a fixed, non-toggleable row; the rest are checkboxes capped at
// MAX_EXTRA_CURRENCIES — mirrors the personality/language screens' tap-to-save pattern (no
// separate Save button), just multi-select instead of single-select.
export function CurrenciesScreen() {
  const router = useRouter();
  const { data: prefs } = useCurrencyPreferences();
  const { mutate: setExtra } = useSetExtraCurrencies();

  const extra = prefs?.extra ?? [];
  const atCap = extra.length >= MAX_EXTRA_CURRENCIES;

  const toggle = (code: string) => {
    if (extra.includes(code)) {
      setExtra(extra.filter((c) => c !== code));
    } else if (!atCap) {
      setExtra([...extra, code]);
    }
  };

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Self-paints the shared gradient — see language-screen.tsx for why (expo/expo#33040). */}
      <AppBackground />
      <View className="flex-row items-center gap-1 px-3 pt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("currencies.a11y.back")}
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full"
        >
          <Icon as={ChevronLeft} size={26} color={palette.primary} />
        </Pressable>
        <Text className="text-2xl font-bold text-text">{t("currencies.title")}</Text>
      </View>
      <Text className="px-5 pb-4 pt-1 text-sm text-muted">{t("currencies.subtitle")}</Text>

      <View className="px-5">
        {prefs ? (
          <SelectableRow
            leading={
              <Text className="text-3xl">
                {CURRENCY_OPTIONS.find((o) => o.code === prefs.primary)?.flag}
              </Text>
            }
            label={t(
              CURRENCY_OPTIONS.find((o) => o.code === prefs.primary)?.labelKey ??
                "currency.usd.label",
            )}
            desc={t("currencies.primary.badge")}
            selected
            disabled
            onPress={() => {}}
          />
        ) : null}

        {CURRENCY_OPTIONS.filter((o) => o.code !== prefs?.primary).map((option) => {
          const selected = extra.includes(option.code);
          return (
            <SelectableRow
              key={option.code}
              role="checkbox"
              leading={<Text className="text-3xl">{option.flag}</Text>}
              label={t(option.labelKey)}
              selected={selected}
              disabled={!selected && atCap}
              onPress={() => toggle(option.code)}
            />
          );
        })}
      </View>
    </SafeAreaView>
  );
}
