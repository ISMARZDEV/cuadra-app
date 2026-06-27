import { create } from "zustand";

// Shared "Siri orb" state. Gesture model (driven from the tab bar):
//   • swipe UP on the empty space where the orb appears → `show()` reveals it (bounces in) + the
//     phone buzzes ONCE. This is the ONLY haptic.
//   • press/hold the orb → `setPressing(true)` makes the orb wobble (scale + sway), `bump()` swells
//     the wave. No haptic. Keeps wobbling while held.
//   • swipe DOWN on the orb → `hide()`.
//   • 8s with no orb interaction → auto-`hide()` (the idle timer is paused while pressing).
// The chat screen reads `active` to lift its input pill out of the way while the orb is showing.
const AUTO_HIDE_MS = 8000;

type OrbState = {
  active: boolean;
  pulse: number;
  pressing: boolean;
  show: () => void;
  hide: () => void;
  bump: () => void;
  setPressing: (value: boolean) => void;
};

export const useOrbStore = create<OrbState>((set) => {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      set({ active: false, pressing: false });
    }, AUTO_HIDE_MS);
  };

  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  return {
    active: false, // hidden until the user swipes up where the orb appears
    pulse: 0,
    pressing: false,
    show: () => {
      set({ active: true });
      armIdle();
    },
    hide: () => {
      clearIdle();
      set({ active: false, pressing: false });
    },
    bump: () => {
      set((s) => ({ pulse: s.pulse + 1 }));
      armIdle(); // touching the orb counts as interaction → reset the idle countdown
    },
    setPressing: (value) => {
      set({ pressing: value });
      if (value) clearIdle(); // don't auto-hide while held
      else armIdle(); // restart the 8s countdown on release
    },
  };
});
