import * as Haptics from "expo-haptics";
import { createContext, createElement, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useSharedValue, withSpring, type SharedValue } from "react-native-reanimated";

// Chat-sessions drawer (AISpace). One shared progress value drives EVERYTHING off the same
// timeline: 0 = closed (full chat) → 1 = open (sessions sidebar revealed, chat pushed aside, tab
// bar slid down).
//
// The value lives in a `useSharedValue` owned by a provider near the root and is shared via React
// Context — NOT a module-level `makeMutable`. Animating a global makeMutable with `withTiming`
// crashes reanimated v4 ("undefined is not a function" → animation.onStart); a component-owned
// `useSharedValue` is the proven pattern (same as the keyboard animation in chat-screen).
type DrawerContextValue = {
  progress: SharedValue<number>;
  open: boolean;
  setOpen: (value: boolean) => void;
  toggle: () => void;
};

const DrawerContext = createContext<DrawerContextValue | null>(null);

// Snappy, fluid spring — PHYSICS config (damping/stiffness/mass), the exact same kind the orb uses
// (so it's a proven-safe animation when assigned from the JS thread). High stiffness + low mass =
// fast; damping a touch below critical = a little natural settle = fluid.
// CRITICAL: do NOT use the duration/dampingRatio spring config, nor withTiming+Easing.bezier — both
// build their params lazily and crash reanimated v4 ("undefined is not a function" →
// animation.onStart) when assigned from JS.

export function DrawerProvider({ children }: { children: ReactNode }) {
  const progress = useSharedValue(0);
  const [open, setOpenState] = useState(false);
  const openRef = useRef(false);

  // Stable (doesn't depend on `open`) so gestures created once never capture a stale copy.
  const setOpen = useCallback(
    (value: boolean) => {
      const changed = openRef.current !== value;
      openRef.current = value;
      progress.value = withSpring(value ? 1 : 0, { damping: 18, stiffness: 240, mass: 0.55 });
      // Light impact on EVERY toggle — opening AND closing (select session / swipe back) — same cue
      // as the orb appearing.
      if (changed) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setOpenState(value);
    },
    [progress],
  );
  const toggle = useCallback(() => setOpen(!openRef.current), [setOpen]);

  const value = useMemo<DrawerContextValue>(
    () => ({ progress, open, setOpen, toggle }),
    [progress, open, setOpen, toggle],
  );

  return createElement(DrawerContext.Provider, { value }, children);
}

export function useDrawer() {
  const ctx = useContext(DrawerContext);
  if (!ctx) throw new Error("useDrawer must be used inside <DrawerProvider>");
  return ctx;
}
