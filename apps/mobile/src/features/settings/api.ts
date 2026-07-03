import { getPreferences, type Personality, putPreferences } from "@cuadra/api-client";
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
