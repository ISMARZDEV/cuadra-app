import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// Native side-effects (haptics + audio) — stub so the component imports in jsdom.
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("@/lib/sounds", () => ({ sounds: { send: vi.fn() } }));

import { ChatInputBar } from "./chat-input-bar";

describe("ChatInputBar", () => {
  beforeEach(() => setLanguage("es")); // jsdom resolves Intl to en — pin it for determinism

  test("empty field shows attach + mic, never send (mic⇄send swap)", () => {
    render(<ChatInputBar />);

    expect(screen.getByPlaceholderText(/.+/)).toBeInTheDocument();
    expect(screen.getByLabelText("Adjuntar")).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje de voz")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enviar")).not.toBeInTheDocument();
  });

  test("typing reveals send; pressing it calls onSend with the text and clears the field", () => {
    const onSend = vi.fn();
    render(<ChatInputBar onSend={onSend} />);

    fireEvent.change(screen.getByPlaceholderText(/.+/), { target: { value: "gasté 500 en gas" } });
    fireEvent.click(screen.getByLabelText("Enviar"));

    expect(onSend).toHaveBeenCalledWith("gasté 500 en gas");
    // field cleared → the button reverts to the mic
    expect(screen.getByLabelText("Mensaje de voz")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enviar")).not.toBeInTheDocument();
  });

  test("a late autocorrect-commit echo of the sent text is swallowed, not shown", () => {
    // iOS can commit a pending predictive-text candidate on a NATIVE event that fires AFTER Send
    // already cleared the field — reproduces that race: a second onChangeText with the
    // (differently-cased) sent text arriving right after the click.
    const onSend = vi.fn();
    render(<ChatInputBar onSend={onSend} />);
    const input = screen.getByPlaceholderText(/.+/);

    fireEvent.change(input, { target: { value: "gaste 500 en amazon" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    fireEvent.change(input, { target: { value: "Gaste 500 en Amazon" } });

    expect(input).toHaveValue("");
    expect(screen.getByLabelText("Mensaje de voz")).toBeInTheDocument();
    expect(screen.queryByLabelText("Enviar")).not.toBeInTheDocument();
  });

  test("the echo is swallowed even when autocorrect added an ACCENT, not just a capital", () => {
    // Caso real en device (2026-08-09): se envió "Super" y el campo quedó con "Súper". El guard
    // original sólo normalizaba MAYÚSCULAS, así que "súper" ≠ "super" y el eco pasaba de largo.
    // En español el autocorrector acentúa más seguido de lo que cambia mayúsculas.
    const onSend = vi.fn();
    render(<ChatInputBar onSend={onSend} />);
    const input = screen.getByPlaceholderText(/.+/);

    fireEvent.change(input, { target: { value: "Super" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    fireEvent.change(input, { target: { value: "Súper" } });

    expect(onSend).toHaveBeenCalledWith("Super");
    expect(input).toHaveValue("");
    expect(screen.queryByLabelText("Enviar")).not.toBeInTheDocument();
  });

  test("typing a genuinely new message right after Send is NOT swallowed", () => {
    const onSend = vi.fn();
    render(<ChatInputBar onSend={onSend} />);
    const input = screen.getByPlaceholderText(/.+/);

    fireEvent.change(input, { target: { value: "gaste 500 en amazon" } });
    fireEvent.click(screen.getByLabelText("Enviar"));
    fireEvent.change(input, { target: { value: "otro mensaje" } });

    expect(input).toHaveValue("otro mensaje");
    expect(screen.getByLabelText("Enviar")).toBeInTheDocument();
  });

  // El borrador se publica hacia arriba para alimentar las sugerencias en vivo. Lo que importa es
  // DÓNDE se engancha: después del guard de eco, no en el evento crudo del TextInput.
  describe("draft reporting (live suggestions)", () => {
    test("reports the text as it is typed", () => {
      const onChangeText = vi.fn();
      render(<ChatInputBar onChangeText={onChangeText} />);

      fireEvent.change(screen.getByPlaceholderText(/.+/), { target: { value: "guan" } });

      expect(onChangeText).toHaveBeenLastCalledWith("guan");
    });

    test("reports the field emptying on Send, so the suggestions reset with it", () => {
      const onChangeText = vi.fn();
      render(<ChatInputBar onSend={vi.fn()} onChangeText={onChangeText} />);
      const input = screen.getByPlaceholderText(/.+/);

      fireEvent.change(input, { target: { value: "guandules" } });
      fireEvent.click(screen.getByLabelText("Enviar"));

      expect(onChangeText).toHaveBeenLastCalledWith("");
    });

    // EL CASO QUE JUSTIFICA EL ENGANCHE: iOS commitea una autocorrección DESPUÉS del envío. El
    // guard de eco se la traga, pero un observador colgado del evento crudo del TextInput vería
    // ese fantasma y buscaría sugerencias para un texto que el usuario ya mandó.
    test("never leaks the late autocorrect echo upward", () => {
      const onChangeText = vi.fn();
      render(<ChatInputBar onSend={vi.fn()} onChangeText={onChangeText} />);
      const input = screen.getByPlaceholderText(/.+/);

      fireEvent.change(input, { target: { value: "Super" } });
      fireEvent.click(screen.getByLabelText("Enviar"));
      fireEvent.change(input, { target: { value: "Súper" } }); // el eco

      expect(onChangeText).not.toHaveBeenCalledWith("Súper");
      expect(onChangeText).toHaveBeenLastCalledWith("");
    });
  });
});
