import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Share } from "react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

const setString = vi.fn();
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: (t: string) => setString(t) }));

import { COPIED_MS, MessageActions } from "./message-actions";

describe("MessageActions", () => {
  beforeEach(() => {
    setLanguage("es");
    setString.mockReset();
  });

  test("offers the two actions that WORK, plus the ellipsis placeholder", () => {
    // Los pulgares y regenerar necesitan backend que no existe (§8 del plan), y leer en voz alta
    // una decisión de producto: siguen FUERA porque prometerían una acción concreta que no hay.
    // La elipsis es la excepción deliberada — insinúa «hay más», no promete nada en particular.
    render(<MessageActions text="El arroz está en Bravo." />);

    expect(screen.getByLabelText("Copiar respuesta")).toBeInTheDocument();
    expect(screen.getByLabelText("Compartir respuesta")).toBeInTheDocument();
    expect(screen.getByLabelText("Más opciones")).toBeInTheDocument();
    expect(screen.queryByLabelText(/gusta/i)).toBeNull();
    expect(screen.queryByLabelText(/generar/i)).toBeNull();
  });

  test("copying puts the reply on the clipboard", () => {
    render(<MessageActions text="El arroz está en Bravo." />);

    fireEvent.click(screen.getByLabelText("Copiar respuesta"));

    expect(setString).toHaveBeenCalledWith("El arroz está en Bravo.");
  });

  test("copying confirms itself, then goes back", async () => {
    // Sin confirmación no hay forma de saber si el toque registró — y el portapapeles es invisible.
    vi.useFakeTimers();
    try {
      render(<MessageActions text="hola" />);
      fireEvent.click(screen.getByLabelText("Copiar respuesta"));

      expect(screen.getByLabelText("Copiado")).toBeInTheDocument();

      // Dentro de `act`: avanzar el timer dispara un setState, y sin envolverlo React no re-renderiza
      // antes de la aserción — se mediría el frame anterior.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(COPIED_MS + 100);
      });
      expect(screen.getByLabelText("Copiar respuesta")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  test("sharing hands the reply to the native sheet", async () => {
    const share = vi.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    render(<MessageActions text="El arroz está en Bravo." />);

    fireEvent.click(screen.getByLabelText("Compartir respuesta"));

    await waitFor(() =>
      expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: "El arroz está en Bravo." })),
    );
    share.mockRestore();
  });

  test("localizes its labels", () => {
    setLanguage("en");
    render(<MessageActions text="hi" />);

    expect(screen.getByLabelText("Copy reply")).toBeInTheDocument();
  });
});
