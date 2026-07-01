import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

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
});
