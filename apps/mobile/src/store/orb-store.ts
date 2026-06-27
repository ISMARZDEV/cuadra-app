import { create } from "zustand";

// Shared "Siri orb" state. Gesture model (driven from the tab bar):
//   • swipe UP on the "iM" logo → `show()` reveals the orb (bounces in) and arms the idle timer.
//   • TAP on the orb            → `bump()` swells the wave + haptic; does NOT navigate.
//   • swipe DOWN on the orb     → `hide()`.
//   • 4s with no orb interaction → auto-`hide()`.
// The chat screen reads `active` to lift its input pill out of the way while the orb is showing.
const AUTO_HIDE_MS = 4000;

type OrbState = {
  active: boolean;
  pulse: number;
  show: () => void;
  hide: () => void;
  bump: () => void;
};

export const useOrbStore = create<OrbState>((set) => {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      set({ active: false });
    }, AUTO_HIDE_MS);
  };

  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  return {
    active: false, // hidden until the user swipes up on the "iM" logo
    pulse: 0,
    show: () => {
      set({ active: true });
      armIdle();
    },
    hide: () => {
      clearIdle();
      set({ active: false });
    },
    bump: () => {
      set((s) => ({ pulse: s.pulse + 1 }));
      armIdle(); // tapping the orb counts as interaction → reset the idle countdown
    },
  };
});
