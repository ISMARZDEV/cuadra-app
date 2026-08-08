import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { setLanguage } from "@/i18n";

import { ChatStatus } from "../enums";
import { TypingIndicator } from "./typing-indicator";

describe("TypingIndicator", () => {
  beforeEach(() => setLanguage("es"));

  test("shows the status line after the entrance delay", async () => {
    // Mount hidden first, then flip to visible — mirrors real usage (chat.isThinking starts
    // false), which is the path the entrance delay actually applies to.
    const { rerender } = render(<TypingIndicator visible={false} />);
    rerender(<TypingIndicator visible />);
    // Not immediate on purpose — the entrance is delayed (ENTER_DELAY_MS) so it lands just after
    // the sent message's own entrance animation instead of popping in at the same instant.
    expect(screen.queryByLabelText("Cargando respuesta…")).toBeNull();
    expect(await screen.findByLabelText("Cargando respuesta…")).toBeInTheDocument();
  });

  test("renders nothing when not visible", () => {
    render(<TypingIndicator visible={false} />);
    expect(screen.queryByLabelText("Cargando respuesta…")).toBeNull();
  });

  test("never shows if it goes invisible again before the entrance delay elapses", async () => {
    const { rerender } = render(<TypingIndicator visible={false} />);
    rerender(<TypingIndicator visible />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 100)));
    rerender(<TypingIndicator visible={false} />);
    await act(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(screen.queryByLabelText("Cargando respuesta…")).toBeNull();
  });

  // `random: () => 0` fija la primera de las dos palabras de espera, que si no sale al azar. La
  // secuencia completa (el paso a paso en el tiempo) se prueba en use-status-sequence.test.tsx;
  // acá sólo importa QUÉ se pinta en el primer frame.
  const show = (status?: ChatStatus) => {
    const props = { status, random: () => 0 };
    const { rerender } = render(<TypingIndicator visible={false} {...props} />);
    rerender(<TypingIndicator visible {...props} />);
  };

  test("defaults to the thinking label", async () => {
    show();
    expect(await screen.findByText("Pensando…")).toBeInTheDocument();
  });

  test("a search opens on Buscando, never on the generic wait", async () => {
    // Cuando llega `searching` el usuario YA vio «Pensando…» en la fase previa a la tool: repetirlo
    // sería un paso perdido.
    show(ChatStatus.Searching);
    expect(await screen.findByText("Buscando…")).toBeInTheDocument();
    expect(screen.queryByText("Pensando…")).toBeNull();
  });

  test("a reasoning turn shows one of the two interchangeable waiting words", async () => {
    show(ChatStatus.Reasoning);
    expect(await screen.findByText("Pensando…")).toBeInTheDocument();
  });

  test("every label ends in an ellipsis — the work is still going", async () => {
    show(ChatStatus.Searching);
    const label = await screen.findByText(/Buscando/);
    expect(label.textContent).toMatch(/…$/);
  });

  test("localizes the status label", async () => {
    setLanguage("en");
    show(ChatStatus.Searching);
    expect(await screen.findByText("Searching…")).toBeInTheDocument();
  });
});
