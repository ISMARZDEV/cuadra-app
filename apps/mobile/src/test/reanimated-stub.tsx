// Test stub for react-native-reanimated. Aliased in vitest.config so Vite never resolves the real
// package — its source can't go through vitest's SSR transform and it pulls Metro-only globals
// (__DEV__, matchMedia). We expose only the surface our components use: Animated.* host components
// (so children still render), inert worklet hooks, identity `withX` helpers, and chainable
// layout-animation builders. Behavior is asserted at the hook level (use-chat), not via worklets.
import { Image, ScrollView, Text, View } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chainable: any = new Proxy({}, { get: () => () => chainable });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const identity = (value: any) => value;

const Animated = {
  View,
  Text,
  ScrollView,
  // `Animated.Image` lo usan las fotos que se funden al cargar (tarjeta de producto, ruleta de
  // categorías). Sin él aquí, esos componentes renderizan `undefined` y el árbol entero revienta.
  Image,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createAnimatedComponent: (component: any) => component,
};

export default Animated;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useSharedValue = (value: any) => ({ value });
export const useAnimatedStyle = () => ({});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useDerivedValue = (fn: () => any) => ({ value: fn() });
export const useAnimatedRef = () => ({ current: null });
// `scrollTo` es el worklet que empuja la ruleta de categorías fotograma a fotograma durante su
// barrido de presentación. Inerte acá —no hay lista nativa que desplazar— pero DEBE existir: el
// módulo lo exporta y importar algo que el stub no tiene revienta el árbol entero, lección que ya
// costó ocho tests con `Animated.Image`.
export const scrollTo = () => {};
export const withSpring = identity;
export const withTiming = identity;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const withSequence = (...steps: any[]) => steps[0];
export const withRepeat = identity;
// No-op: sin animaciones reales bajo jsdom no hay nada que cancelar. Está aquí porque el módulo
// DEBE exportarlo — importar algo que el stub no tiene revienta el árbol entero, y esa lección ya
// costó ocho tests con `Animated.Image`.
export const cancelAnimation = () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const withDelay = (_delay: any, value: any) => value;
export const Easing = new Proxy({}, { get: () => () => 0 });
export const ZoomIn = chainable;
export const ZoomOut = chainable;
export const FadeIn = chainable;
export const FadeOut = chainable;
export const SlideInDown = chainable;
export const SlideOutDown = chainable;
// Scroll-driven animations (insights-carousel.tsx) — inert here too: the worklet callback body
// (which reads native scroll-event fields like `.contentOffset.x`, absent on a DOM ScrollEvent)
// is never invoked, same "asserted at the hook level, not via worklets" policy as the rest of
// this stub. Just needs to exist so the `onScroll` prop wiring doesn't throw at import/call time.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const useAnimatedScrollHandler = (_handler: any) => () => {};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const interpolate = (..._args: any[]) => 0;
