import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// react-native-web's onLayout uses ResizeObserver, absent in jsdom — provide a no-op.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// NativeWind runtime needs Metro/babel; under jsdom we stub the hooks it exposes so
// components that read the color scheme (e.g. <Icon>) render without the native runtime.
vi.mock("nativewind", () => ({
  useColorScheme: () => ({ colorScheme: "light", setColorScheme: () => {}, toggleColorScheme: () => {} }),
  vars: (value: unknown) => value,
  cssInterop: () => {},
  remapProps: () => {},
}));

// lucide-react-native / react-native-svg are aliased to a no-op stub in vitest.config.ts
// (Vite hangs pre-bundling the ~1500-module lucide package). The CJS stub can't provide
// named bindings, so icon imports resolve to `undefined` — harmless because we mock the
// <Icon> wrapper to render nothing (it just forwards the lucide component as a prop).
vi.mock("@/components/ui/icon", () => ({ Icon: () => null }));

// Native glass/blur/mask modules — pass children through to a plain View under test.
const viewPassthrough = async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  return ({ children, ...props }: { children?: unknown }) =>
    React.createElement(View, props, children as never);
};

vi.mock("expo-glass-effect", async () => {
  const passthrough = await viewPassthrough();
  return {
    GlassView: passthrough,
    GlassContainer: passthrough,
    isLiquidGlassAvailable: () => false,
    isGlassEffectAPIAvailable: () => false,
  };
});

vi.mock("expo-blur", async () => ({ BlurView: await viewPassthrough() }));

// GlassSurface's non-iOS fallback path renders these (LinearGradient + SquircleView); their native
// sources don't survive vitest's transform → pass children through to a plain View.
vi.mock("expo-linear-gradient", async () => ({ LinearGradient: await viewPassthrough() }));

vi.mock("react-native-squircle-view", async () => ({ SquircleView: await viewPassthrough() }));

// MaskedView's REAL visible/queryable content is `maskElement` (the gradient `children` just fill
// its shape) — unlike the other passthroughs above, rendering `children` here would make gradient
// text (chat-empty-state.tsx) untestable (its actual copy lives in maskElement, not children).
vi.mock("@react-native-masked-view/masked-view", async () => {
  const React = await import("react");
  const { View } = await import("react-native");
  return {
    default: ({ maskElement }: { maskElement?: unknown }) =>
      React.createElement(View, null, maskElement as never),
  };
});
