import { create } from "zustand";

// Shared "Siri orb active" state. Set by the tab bar (tapping the "iM" logo); read by the chat
// screen so the input pill lifts up to make room while the orb is showing, then returns.
type OrbState = {
  active: boolean;
  toggle: () => void;
  setActive: (value: boolean) => void;
};

export const useOrbStore = create<OrbState>((set) => ({
  active: true, // TODO: default to false once the orb visual is finalized (appears only on tap)
  toggle: () => set((s) => ({ active: !s.active })),
  setActive: (value) => set({ active: value }),
}));
