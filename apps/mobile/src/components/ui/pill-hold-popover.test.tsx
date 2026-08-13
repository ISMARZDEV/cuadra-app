import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

// La medición de truncado es INALCANZABLE bajo jsdom: `onLayout` de react-native-web se resuelve
// por `UIManager.measure`, que lee `node.offsetWidth` (siempre 0 en jsdom) y no
// `getBoundingClientRect` —lo único que `setup.ts` falsea—. Se mockea para poder ejercitar la rama
// "sí está truncado"; la comparación en sí tiene sus propios tests en use-is-truncated.test.tsx.
const truncated = vi.hoisted(() => ({ value: true }));
const measuredWith = vi.hoisted(() => ({ current: null as unknown[] | null }));
vi.mock("./use-is-truncated", () => ({
  useIsTruncated: (...args: unknown[]) => {
    measuredWith.current = args;
    return { isTruncated: truncated.value, shadow: null };
  },
}));

// El módulo nativo de iOS puede NO estar en el binario (dev-client viejo, o un build al que no se
// le corrió `expo prebuild`). `requireOptionalNativeModule` devuelve `null` en ese caso — se
// falsea acá para poder probar las dos ramas.
const nativeModule = vi.hoisted(() => ({ value: {} as object | null }));
vi.mock("expo-modules-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("expo-modules-core")>()),
  requireOptionalNativeModule: () => nativeModule.value,
}));

// `PillButton` ya tiene su propia batería de tests (incl. su cableado de long-press en
// pill-button-hold.test.tsx). Acá se mockea para aislar lo que ESTE archivo debe probar: la
// ORQUESTACIÓN — a quién le pasa qué, y qué hace `PillWithHoldPopover` cuando esas callbacks se
// invocan. Se captura el `onHoldReveal`/`onHoldRelease` recibidos y se llaman como funciones
// planas — el gesto real que los dispara es responsabilidad de PillButton, ya cubierta aparte.
const capturedPillProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock("./pill-button", async (importOriginal) => {
  const { createElement } = await import("react");
  const { Pressable, Text } = await import("react-native");
  return {
    // Se conserva TODO lo real salvo el componente: `PILL_LABEL_STYLE` es la tipografía compartida
    // y la consumen tanto pill-hold-popover como android-hold-popover. Mockear el módulo entero
    // la borraría.
    ...(await importOriginal<typeof import("./pill-button")>()),
    PillButton: (props: Record<string, unknown>) => {
      capturedPillProps.current = props;
      return createElement(
        Pressable,
        {
          accessibilityLabel: (props.accessibilityLabel ?? props.label) as string,
          onPress: props.onPress as () => void,
        },
        createElement(Text, null, props.label as string),
      );
    },
  };
});

import { PillWithHoldPopover, resolveHoldStrategy } from "./pill-hold-popover";

const LABEL = "Sugerencia larga que no entra en la píldora";

const reveal = () =>
  (capturedPillProps.current?.onHoldReveal as (a: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void)({ x: 40, y: 300, width: 90, height: 44 });
const release = () => (capturedPillProps.current?.onHoldRelease as () => void)();

describe("PillWithHoldPopover", () => {
  beforeEach(() => {
    truncated.value = true;
    nativeModule.value = {};
  });

  // El componente NO puede probar esta decisión: bajo jsdom `Platform.OS` es siempre "web", así que
  // la rama iOS es inalcanzable y un test ahí pasaría por la razón equivocada. Por eso la decisión
  // es una función PURA y se prueba acá, con las cuatro combinaciones reales.
  describe("resolveHoldStrategy", () => {
    test("a label that fits offers nothing, on any platform", () => {
      expect(resolveHoldStrategy({ isTruncated: false, isIOS: true, nativeAvailable: true })).toBe("none");
      expect(resolveHoldStrategy({ isTruncated: false, isIOS: false, nativeAvailable: false })).toBe("none");
    });

    test("iOS with the native module uses the native popover", () => {
      expect(resolveHoldStrategy({ isTruncated: true, isIOS: true, nativeAvailable: true })).toBe("native");
    });

    // EL GUARD QUE PAGA ESTE BLOQUE. Sin módulo en el binario, `Popover.Trigger` no renderiza la
    // píldora: renderiza el recuadro rojo "Unimplemented component:
    // <ViewManagerAdapter_ExpoiOSPopoverModule>" — visto en device el 2026-08-09 al recargar JS
    // nuevo sobre un dev-client viejo. Un carrusel de recuadros rojos es MUCHO peor que no tener
    // popover, así que se degrada al camino JS, que funciona en cualquier binario.
    test("iOS WITHOUT the native module degrades to the JS popover instead of red error boxes", () => {
      expect(resolveHoldStrategy({ isTruncated: true, isIOS: true, nativeAvailable: false })).toBe("js");
    });

    test("Android always uses the JS popover — the module has no Android build at all", () => {
      expect(resolveHoldStrategy({ isTruncated: true, isIOS: false, nativeAvailable: false })).toBe("js");
    });
  });

  test("sends the label on a normal tap, same as PillButton always did", () => {
    const onPress = vi.fn();
    render(<PillWithHoldPopover label={LABEL} onPress={onPress} />);

    fireEvent.click(screen.getByLabelText(LABEL));

    expect(onPress).toHaveBeenCalledWith(LABEL);
  });

  // La píldora abraza su contenido hasta el tope, y ahí el texto envuelve — hasta dos líneas antes
  // de recortar. El alto se DERIVA de esas líneas (lineHeight 18 × 2 + 11 de padding arriba y
  // abajo): si alguien sube el tope de líneas sin tocar el alto, el texto se recortaría por la
  // caja en vez de por el `…`, y sería un recorte invisible.
  test("caps the pill's width and sizes its height for exactly two lines", () => {
    render(<PillWithHoldPopover label={LABEL} onPress={vi.fn()} />);

    expect(capturedPillProps.current?.maxWidth).toBe(240);
    expect(capturedPillProps.current?.maxLines).toBe(2);
    expect(capturedPillProps.current?.height).toBe(58);
    expect(capturedPillProps.current?.radius).toBe(29);
  });

  // El truncado se mide con el ancho que le queda al TEXTO (240 de píldora − 16 de padding a cada
  // lado), no con el de la píldora. Midiendo contra el ancho total entraría una línea de más y el
  // `…` aparecería tarde: se vería texto cortado por la caja, sin puntos suspensivos y sin gesto
  // para leer el resto — un fallo silencioso.
  test("measures truncation against the width left to the TEXT, not the pill's", () => {
    render(<PillWithHoldPopover label={LABEL} onPress={vi.fn()} />);

    expect(measuredWith.current).toEqual([LABEL, 240 - 16 * 2, 2]);
  });

  // Un texto que ya se ve entero no ofrece el gesto: revelar lo mismo que está a la vista sería
  // una promesa vacía.
  test("a label that fits gets NO hold affordance at all", () => {
    truncated.value = false;
    render(<PillWithHoldPopover label="Corta" onPress={vi.fn()} />);

    expect(capturedPillProps.current?.onHoldReveal).toBeUndefined();
  });

  // Bajo jsdom `Platform.OS` resuelve a "web" (react-native-web) — nunca "ios" — así que el camino
  // nativo real (expo-ios-popover) es inalcanzable por construcción bajo este harness y se verifica
  // EXCLUSIVAMENTE en simulador/device. Estos tests ejercitan el camino Android/JS.
  describe("the Android/JS path", () => {
    test("wires onHoldReveal/onHoldRelease down to PillButton", () => {
      render(<PillWithHoldPopover label={LABEL} onPress={vi.fn()} />);

      expect(capturedPillProps.current?.onHoldReveal).toBeInstanceOf(Function);
      expect(capturedPillProps.current?.onHoldRelease).toBeInstanceOf(Function);
    });

    test("revealing shows the popover with the full label; releasing hides it", () => {
      render(<PillWithHoldPopover label={LABEL} onPress={vi.fn()} />);

      expect(screen.getAllByText(LABEL)).toHaveLength(1); // sólo la píldora

      act(reveal);
      // El popover repite el MISMO texto: ahora hay dos nodos, la píldora y el bubble.
      expect(screen.getAllByText(LABEL)).toHaveLength(2);

      act(release);
      // El Modal deja de montar sus hijos con `visible=false` — mismo comportamiento que ya prueba
      // info-tooltip.test.tsx.
      expect(screen.getAllByText(LABEL)).toHaveLength(1);
    });
  });
});
