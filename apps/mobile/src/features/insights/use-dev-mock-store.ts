import { create } from "zustand";

import { queryClient } from "@/lib/api/query-client";

import { clearMockInsights, seedMockInsights } from "./dev-mock";

interface DevMockState {
  enabled: boolean;
  toggle: () => void;
}

// Dev-only design-preview switch (rendered __DEV__-only — see components/dev-mock-toggle.tsx).
// Not persisted: resets to OFF on reload, which is the right default for a debug tool.
export const useDevMockStore = create<DevMockState>((set, get) => ({
  enabled: false,
  toggle: () => {
    const next = !get().enabled;
    if (next) seedMockInsights(queryClient);
    else clearMockInsights(queryClient);
    set({ enabled: next });
  },
}));
