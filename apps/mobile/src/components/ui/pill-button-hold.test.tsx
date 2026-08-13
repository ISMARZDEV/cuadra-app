import { render } from "@testing-library/react";
import { forwardRef, createElement } from "react";
import { describe, expect, test, vi } from "vitest";

// Este archivo existe SÓLO por este mock — no puede convivir con pill-button.test.tsx porque
// reemplaza `Pressable` de "react-native" a nivel de MÓDULO, lo que rompería sus tests basados en
// `fireEvent.click` contra el Pressable real de react-native-web.
const captured = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));
vi.mock("react-native", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-native")>();
  const CapturingPressable = forwardRef((props: Record<string, unknown>, ref) => {
    captured.current = props;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stub sólo de test
    return createElement(actual.View as any, { ...props, ref });
  });
  return { ...actual, Pressable: CapturingPressable };
});
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));

import { PillButton } from "./pill-button";

// ── Mantener oprimido ──────────────────────────────────────────────────────────────────────────
//
// Verifica el CABLEADO de PillButton hacia su Pressable — qué props le pasa y qué hacen esas props
// al invocarse — no el gesto de long-press en sí.
//
// Por qué no se simula el gesto con fireEvent: el temporizador de long-press vive en el sistema de
// "responder" LEGADO de react-native-web (`useResponderEvents/ResponderSystem.js`), que escucha
// eventos NATIVOS del `document` (no props sintéticas de React) y negocia el responder con su
// propia máquina de estados. Probado en vivo: ni `fireEvent.mouseDown` ni `fireEvent.pointerDown` +
// avanzar los timers de vitest logran que dispare `onLongPress` bajo jsdom — nadie en este repo lo
// había ejercitado antes (0 tests de `onLongPress` existían, ni siquiera para el único long-press
// previo del repo, tx-row-item.tsx). Es la misma familia de límite que ya documenta
// `info-tooltip.tsx`: `.measure()` tampoco corre su callback bajo jsdom («no jsdom equivalent,
// callback never fires under test»).
//
// Lo real y verificable en jsdom: que PillButton arme las props correctas. Que esas props, una vez
// invocadas por React Native de verdad, hagan lo correcto, es responsabilidad de RN (ya verificado
// leyendo su fuente — Pressability.js:749-752 — que `onPress` no dispara tras soltar un long-press)
// y de este cableado. El gesto en sí: sólo en simulador/device.
describe("PillButton — hold to reveal wiring", () => {
  // `onHoldReveal` sólo existe para el camino Android/JS del popover (pill-hold-popover.tsx). Sin
  // él, el Pressable no debe recibir NINGÚN `onLongPress` — nada que disparar.
  test("wires no onLongPress when onHoldReveal is not given", () => {
    render(<PillButton label="Tocame" onPress={vi.fn()} />);

    expect(captured.current?.onLongPress).toBeUndefined();
  });

  test("wires onLongPress with the established 280ms delay when onHoldReveal is given", () => {
    render(<PillButton label="Tocame" onPress={vi.fn()} onHoldReveal={vi.fn()} />);

    expect(captured.current?.onLongPress).toBeInstanceOf(Function);
    expect(captured.current?.delayLongPress).toBe(280);
  });

  test("onPressOut calls onHoldRelease when it was given, in addition to the press-back spring", () => {
    const onHoldRelease = vi.fn();
    render(<PillButton label="Tocame" onPress={vi.fn()} onHoldRelease={onHoldRelease} />);

    (captured.current?.onPressOut as () => void)();

    expect(onHoldRelease).toHaveBeenCalledOnce();
  });

  // Una píldora decorativa (sin onPress NI onHoldRelease) sigue sin recibir onPressOut — el gate
  // original (`interactive`) no se aflojó al agregar esto.
  test("a decorative pill (no onPress, no onHoldRelease) still gets no onPressOut", () => {
    render(<PillButton label="0/5 mensajes" />);

    expect(captured.current?.onPressOut).toBeUndefined();
  });
});
