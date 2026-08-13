import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// Las consultas por TEXTO ignoran lo que está fuera del árbol de accesibilidad, igual que ya lo
// ignoran `script`/`style` (el default de la librería). Un elemento `aria-hidden` no existe para
// quien usa la app —ni a la vista ni para un lector de pantalla—, así que tampoco debería existir
// para un test que dice buscar "el texto que se ve".
//
// Lo destapó el texto-fantasma de `use-is-truncated.tsx`, que mide el ancho natural de una etiqueta
// renderizándola aparte: sin esto, cada etiqueta aparecía DOS veces y `getByText` fallaba con
// "Found multiple elements". La respuesta correcta no era parchear los tests que la buscaban, sino
// marcar el fantasma como invisible para accesibilidad (que era un bug real: se leía dos veces) y
// enseñarle al harness a respetarlo.
configure({ defaultIgnore: 'script, style, [aria-hidden="true"]' });

// Metro defines `__DEV__` globally in the app; jsdom doesn't. Modules that read it at import
// time (e.g. lib/api/client.ts) crash without it — provide it (false = quiet dev warnings).
(globalThis as { __DEV__?: boolean }).__DEV__ ??= false;

// ── Layout falso, porque jsdom no hace layout ────────────────────────────────
// jsdom no calcula geometría: `getBoundingClientRect` devuelve todo en cero y react-native-web
// (que mide con ResizeObserver + getBoundingClientRect) reporta `onLayout` con tamaño 0.
//
// Para casi todo daba igual — hasta que el chat pasó a una lista VIRTUALIZADA (`LegendList`): una
// lista que cree que su viewport mide 0 no renderiza NINGUNA fila, así que ningún test podía volver
// a afirmar nada sobre los mensajes. Sin esto, migrar a virtualización equivale a perder la
// cobertura de la pantalla entera.
//
// Se declara un viewport de teléfono y se dispara el observer al observar. No es geometría real
// —nada acá mide de verdad— pero es COHERENTE, que es lo que la virtualización necesita para
// decidir cuántas filas montar.
const VIEWPORT = { width: 390, height: 800 };

globalThis.ResizeObserver ??= class {
  private readonly cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe(target: Element) {
    const rect = target.getBoundingClientRect();
    this.cb([{ target, contentRect: rect } as unknown as ResizeObserverEntry], this as never);
  }
  unobserve() {}
  disconnect() {}
};

Element.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    right: VIEWPORT.width,
    bottom: VIEWPORT.height,
    toJSON: () => ({}),
  } as DOMRect;
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

// El paquete exporta por DEFAULT (`export default class SquircleView`). El stub declaraba un
// export NOMBRADO, así que los tests pasaban con un import que en runtime es `undefined` — el
// mock tapaba el fallo real. Debe espejar la forma del módulo, no la que nos convendría.
vi.mock("react-native-squircle-view", async () => ({ default: await viewPassthrough() }));

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
