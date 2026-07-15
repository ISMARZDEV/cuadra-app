import { fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useKeyboardReview } from "./useKeyboardReview";

// Atajos de teclado del revisor (batch 2e, tasks 2.21/2.22): conveniencia por encima del mismo flujo
// de aprobar/rechazar/siguiente que ya existe por click — se testea el hook aislado (`renderHook`),
// simulando `keydown` en `document` (donde el hook engancha el listener).
describe("useKeyboardReview", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("fires onApprove on Option+A (Alt+A), not on plain 'a'", () => {
    const onApprove = vi.fn();
    renderHook(() =>
      useKeyboardReview({ onApprove, onReject: vi.fn(), onNext: vi.fn() }),
    );

    // plain 'a' NO dispara (acción consecuente requiere el modificador)
    fireEvent.keyDown(document, { key: "a", code: "KeyA" });
    expect(onApprove).not.toHaveBeenCalled();

    // Option+A sí — en macOS `key` es "å" pero `code` es "KeyA"
    fireEvent.keyDown(document, { key: "å", code: "KeyA", altKey: true });
    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it("fires onReject on Option+R (Alt+R)", () => {
    const onReject = vi.fn();
    renderHook(() =>
      useKeyboardReview({ onApprove: vi.fn(), onReject, onNext: vi.fn() }),
    );

    fireEvent.keyDown(document, { key: "®", code: "KeyR", altKey: true });

    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it("fires onNext on 'n'", () => {
    const onNext = vi.fn();
    renderHook(() =>
      useKeyboardReview({ onApprove: vi.fn(), onReject: vi.fn(), onNext }),
    );

    fireEvent.keyDown(document, { key: "n" });

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("fires onNext on ArrowRight too", () => {
    const onNext = vi.fn();
    renderHook(() =>
      useKeyboardReview({ onApprove: vi.fn(), onReject: vi.fn(), onNext }),
    );

    fireEvent.keyDown(document, { key: "ArrowRight" });

    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("fires onPrev on 'p' and ArrowLeft", () => {
    const onPrev = vi.fn();
    renderHook(() =>
      useKeyboardReview({ onApprove: vi.fn(), onReject: vi.fn(), onNext: vi.fn(), onPrev }),
    );

    fireEvent.keyDown(document, { key: "p" });
    fireEvent.keyDown(document, { key: "ArrowLeft" });

    expect(onPrev).toHaveBeenCalledTimes(2);
  });

  it("ignores hotkeys while the event target is a text input (e.g. the reject reason note)", () => {
    const onApprove = vi.fn();
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    renderHook(() =>
      useKeyboardReview({ onApprove, onReject: vi.fn(), onNext: vi.fn() }),
    );

    fireEvent.keyDown(textarea, { key: "å", code: "KeyA", altKey: true });

    expect(onApprove).not.toHaveBeenCalled();
  });

  it("does nothing when disabled (e.g. while a request is in flight)", () => {
    const onApprove = vi.fn();
    renderHook(() =>
      useKeyboardReview({ onApprove, onReject: vi.fn(), onNext: vi.fn(), disabled: true }),
    );

    fireEvent.keyDown(document, { key: "å", code: "KeyA", altKey: true });

    expect(onApprove).not.toHaveBeenCalled();
  });

  it("cleans up its listener on unmount", () => {
    const onApprove = vi.fn();
    const { unmount } = renderHook(() =>
      useKeyboardReview({ onApprove, onReject: vi.fn(), onNext: vi.fn() }),
    );

    unmount();
    fireEvent.keyDown(document, { key: "å", code: "KeyA", altKey: true });

    expect(onApprove).not.toHaveBeenCalled();
  });
});
