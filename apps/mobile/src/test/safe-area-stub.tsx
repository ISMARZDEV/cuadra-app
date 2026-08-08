// Test stub for react-native-safe-area-context. Aliased in vitest.config porque su package.json
// declara `"react-native": "src/index.tsx"` → el resolver de vitest agarra el FUENTE TypeScript, y
// `SafeArea.types.ts` usa `typeof` a nivel de tipos que el transform SSR no sabe leer
// (`SyntaxError: Unexpected token 'typeof'`). Misma razón que reanimated/svg/expo-haptics.
//
// Apareció con el PRIMER test de una PANTALLA: hasta entonces todos los tests eran de componentes,
// y ninguno montaba un SafeAreaView.
import { createElement, type ReactNode } from "react";
import { View } from "react-native";

const ZERO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 } as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Passthrough = (props: any) => createElement(View, props, props?.children);

export const SafeAreaView = Passthrough;
export const SafeAreaProvider = ({ children }: { children?: ReactNode }) => children ?? null;
export const SafeAreaInsetsContext = { Consumer: Passthrough, Provider: Passthrough };
export const useSafeAreaInsets = () => ZERO_INSETS;
export const useSafeAreaFrame = () => ({ x: 0, y: 0, width: 390, height: 844 });
export const initialWindowMetrics = { insets: ZERO_INSETS, frame: { x: 0, y: 0, width: 390, height: 844 } };
