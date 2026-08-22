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
// ⭐ Las curvas se DEVUELVEN ETIQUETADAS, y no es un capricho del arnés.
//
// Antes esto era `new Proxy({}, { get: () => () => 0 })`: cualquier curva —lineal, bezier, la que
// fuera— salía como una función nueva e indistinguible. Con eso NINGÚN test podía notar que a un
// reloj de cascada le habían puesto una curva, y la cascada del detalle de producto se estuvo
// atropellando durante toda una fase con 480 tests en verde. Un mock más amable que la realidad es
// un test que miente.
//
// Ahora cada nombre devuelve SIEMPRE la misma función (identidad estable) y lleva su `easingName`,
// así que se puede afirmar QUÉ curva eligió un módulo. Como valor sigue siendo la identidad: bajo
// jsdom no se interpola nada, y el arnés no debe fingir que sí.
type TaggedEasing = ((t: number) => number) & { easingName: string };
const easingCache = new Map<string, TaggedEasing>();
function taggedEasing(name: string): TaggedEasing {
  const hit = easingCache.get(name);
  if (hit) return hit;
  const base = ((t: number) => t) as TaggedEasing;
  base.easingName = name;
  // Algunos nombres son CURVAS (`Easing.linear`) y otros FÁBRICAS (`Easing.bezier(...)`,
  // `Easing.out(...)`). El mismo objeto sirve para las dos cosas: al llamarlo devuelve otra curva
  // etiquetada con la llamada, así `Easing.out(Easing.cubic)` se lee como `out(cubic)`.
  const fn = new Proxy(base, {
    apply: (_target, _thisArg, args: unknown[]) =>
      taggedEasing(
        `${name}(${args.map((a) => (a as TaggedEasing)?.easingName ?? String(a)).join(",")})`,
      ),
  }) as TaggedEasing;
  easingCache.set(name, fn);
  return fn;
}
export const Easing = new Proxy(
  {},
  { get: (_target, key) => taggedEasing(String(key)) },
) as Record<string, TaggedEasing>;

/** Lee el nombre de la curva que un módulo eligió. Devuelve `undefined` si no es una curva. */
export function easingNameOf(easing: unknown): string | undefined {
  return (easing as TaggedEasing | undefined)?.easingName;
}
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
