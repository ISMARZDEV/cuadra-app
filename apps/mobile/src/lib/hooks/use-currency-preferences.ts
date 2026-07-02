import { getCurrencyPreferences, putCurrencyPreferences } from "@cuadra/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Currency preferences (§currency-preferences): `primary` is derived server-side from
// identity.home_market (read-only here); `extra` is the up-to-3 the user picks in Config.
// Promoted from features/settings/api.ts to src/lib/hooks/ — used by 2+ features now (Config's
// Currencies screen writes it, Insights reads it to pick which `by_currency[]` slice to show),
// and this app keeps features hermetic (no cross-feature imports — cuadra-mobile skill), so a
// hook needed by more than one feature belongs in the shared infra layer, not inside either one.
export const CURRENCY_PREFERENCES_KEY = ["aispace", "currencyPreferences"] as const;

export function useCurrencyPreferences() {
  return useQuery({
    queryKey: CURRENCY_PREFERENCES_KEY,
    queryFn: () => getCurrencyPreferences().then((r) => r.data!),
  });
}

export function useSetExtraCurrencies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (extra: string[]) =>
      putCurrencyPreferences({ body: { extra } }).then((r) => r.data!),
    onSuccess: (saved) => qc.setQueryData(CURRENCY_PREFERENCES_KEY, saved),
  });
}
