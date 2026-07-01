// Test stub for react-native-svg. Aliased in vitest.config (its native source can't be parsed by
// vitest). Unlike the icon-stub (which renders null — fine for lucide glyphs), svg containers must
// pass their children through, so every tag resolves to a View passthrough that keeps the subtree.
import { createElement } from "react";
import { View } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Passthrough = (props: any) => createElement(View, props, props?.children);

export default Passthrough;
export const Svg = Passthrough;
export const Defs = Passthrough;
export const LinearGradient = Passthrough;
export const RadialGradient = Passthrough;
export const Stop = Passthrough;
export const Rect = Passthrough;
export const Path = Passthrough;
export const Circle = Passthrough;
export const Ellipse = Passthrough;
export const G = Passthrough;
export const Line = Passthrough;
export const Polygon = Passthrough;
export const Polyline = Passthrough;
export const Mask = Passthrough;
export const ClipPath = Passthrough;
export const Use = Passthrough;
export const Text = Passthrough;
