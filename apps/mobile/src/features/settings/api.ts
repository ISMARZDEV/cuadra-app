import {
  getCurrencyPreferences,
  getPreferences,
  type Personality,
  putCurrencyPreferences,
  putPreferences,
} from "@cuadra/api-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// Query/mutation hooks over the generated SDK (cuadra-mobile §3). The copilot personality is a
// server-persisted, cross-device preference: read it once, update it optimistically on save.
const PERSONALITY_KEY = ["aispace", "personality"] as const;

export function usePersonality() {
  return useQuery({
    queryKey: PERSONALITY_KEY,
    queryFn: () => getPreferences().then((r) => r.data!.personality),
  });
}

export function useSetPersonality() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (personality: Personality) =>
      putPreferences({ body: { personality } }).then((r) => r.data!.personality),
    onSuccess: (saved) => qc.setQueryData(PERSONALITY_KEY, saved),
  });
}

// Currency preferences (§currency-preferences): `primary` is derived server-side from
// identity.home_market (read-only here); `extra` is the up-to-3 the user picks in Config.
const CURRENCY_PREFERENCES_KEY = ["aispace", "currencyPreferences"] as const;

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
