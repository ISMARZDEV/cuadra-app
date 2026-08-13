// Test stub for expo-ios-popover. Aliased in vitest.config so Vite never resolves the real
// package: its `native-view/index.js` calls `requireNativeViewManager` at MODULE TOP LEVEL (not
// inside a component), so merely importing it crashes under jsdom — same class of problem as
// haptics/skia/secure-store, just triggered at import time instead of at call time.
//
// The real component is iOS-only (`expo-module.config.json`: `"platforms": ["apple"]`) and is
// NEVER exercised under jsdom anyway — `Platform.OS` resolves to `"web"` here (react-native-web),
// so `pill-hold-popover.tsx`'s `Platform.OS === "ios"` branch is unreachable in tests by
// construction. This stub only needs to exist so the MODULE IMPORT doesn't crash and the
// non-iOS code paths remain testable.
import { createElement, type ReactNode } from "react";
import { View } from "react-native";

const Passthrough = ({ children }: { children?: ReactNode }) => createElement(View, null, children);

function Root({ children }: { children?: ReactNode }) {
  return createElement(View, null, children);
}
Root.Trigger = Passthrough;
Root.Content = Passthrough;
Root.Pressable = Passthrough;

export const Popover = Root;
export const RootPopover = Root;
export const Trigger = Passthrough;
export const Content = Passthrough;
export const Pressable = Passthrough;

export const ArrowEdge = {
  Top: "down",
  Bottom: "up",
  Leading: "right",
  Trailing: "left",
  Any: "any",
  None: "none",
} as const;

export const TriggerType = { Tap: "tap", LongPress: "longpress", DoubleTap: "doubletap" } as const;
