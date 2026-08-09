/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ReactNode } from "react";

// Stub de `react-native-keyboard-controller` — módulo NATIVO, sin nada que hacer en jsdom.
// `KeyboardProvider` (root layout) sólo tiene que dejar pasar a sus hijos.
export const KeyboardProvider = ({ children }: { children?: ReactNode }) => <>{children}</>;
export const KeyboardStickyView = ({ children }: { children?: ReactNode }) => <>{children}</>;
export const KeyboardAvoidingView = ({ children }: { children?: ReactNode }) => <>{children}</>;

export const useKeyboardAnimation = () => ({ height: { value: 0 }, progress: { value: 0 } });
export const useReanimatedKeyboardAnimation = useKeyboardAnimation;
export const KeyboardController: any = { dismiss: () => {}, setInputMode: () => {} };
