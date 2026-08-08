/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from "react";
import { Text as RNText, View } from "react-native";

// Test stub for @shopify/react-native-skia — its real entry pulls in a native module (and a WASM
// build on web) that jsdom can't load. Same philosophy as the sibling stubs: keep enough shape that
// components RENDER and their text stays assertable; drawing fidelity is not what these tests check.

// The clock never advances under test — the shimmer's sweep is a visual, verified on device.
export const useClock = () => ({ value: 0 });

export const vec = (x: number, y: number) => ({ x, y });

// A font-like object: enough metrics for callers to lay text out (shimmer-text.tsx measures the
// label to size its canvas, and returns a bare spacer when the font is null — so returning null
// here would make the label untestable).
export const useFont = (_source?: unknown, size = 14) => ({
  getMetrics: () => ({ ascent: -size, descent: size * 0.25 }),
  measureText: (text: string) => ({ width: text.length * size * 0.5 }),
});

export const matchFont = (style?: { fontSize?: number }) => useFont(undefined, style?.fontSize);

export const Canvas = ({ children }: { children?: ReactNode }) => <View>{children}</View>;

// Skia's <Text> draws glyphs; here it becomes a normal RN text node so queries by text work.
export const Text = ({ text }: { text: string }) => <RNText>{text}</RNText>;

export const Group = ({ children }: { children?: ReactNode }) => <>{children}</>;

const nullComponent = () => null;
export const LinearGradient = nullComponent;
export const RadialGradient = nullComponent;
export const Rect = nullComponent;
export const Path = nullComponent;
export const Fill = nullComponent;
export const Blur = nullComponent;
export const Paint = nullComponent;
export const RuntimeShader = nullComponent;
export const Image = nullComponent;

// Minimal imperative surface used by orb-sphere.tsx (built paths are never inspected under test).
const pathBuilder = () => ({
  moveTo: () => pathBuilder(),
  lineTo: () => pathBuilder(),
  close: () => pathBuilder(),
  build: () => ({}),
});

export const Skia = {
  Path: { Make: () => ({}) },
  PathBuilder: { Make: pathBuilder },
  RuntimeEffect: { Make: () => null },
} as any;
