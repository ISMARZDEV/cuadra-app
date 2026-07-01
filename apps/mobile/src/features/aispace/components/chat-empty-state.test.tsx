import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// Native side-effects (haptics + audio) — stub so the component imports in jsdom.
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("@/lib/sounds", () => ({ sounds: { send: vi.fn() } }));

import { ChatEmptyState } from "./chat-empty-state";

describe("ChatEmptyState", () => {
  beforeEach(() => setLanguage("es"));

  test("renders the greeting and all 4 widgets", () => {
    render(<ChatEmptyState onSelect={vi.fn()} />);
    expect(screen.getByText("Hey, What's up")).toBeInTheDocument(); // fixed English in every locale
    expect(screen.getByText(/Ismael/)).toBeInTheDocument(); // name + emoji line
    expect(screen.getByLabelText("Registrar ingresos")).toBeInTheDocument();
    expect(screen.getByLabelText("Registrar gastos")).toBeInTheDocument();
    expect(screen.getByLabelText("Registrar ahorros")).toBeInTheDocument();
    expect(screen.getByLabelText("Mostrar balance")).toBeInTheDocument();
  });

  test("tapping a widget sends its prompt", () => {
    const onSelect = vi.fn();
    render(<ChatEmptyState onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("Registrar ingresos"));
    expect(onSelect).toHaveBeenCalledWith("Quiero registrar un ingreso");
  });

  test("each widget sends its own distinct prompt", () => {
    const onSelect = vi.fn();
    render(<ChatEmptyState onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText("Mostrar balance"));
    expect(onSelect).toHaveBeenCalledWith("Muéstrame mi balance");
  });

  // Regression: t() reads a plain module var (src/i18n) — a mounted screen that doesn't otherwise
  // re-render (unlike the tab bar, which re-renders on every navigation) kept showing the language
  // active at ITS OWN mount, stale, after the user changed it in Config. Reported live TWICE: once
  // fixed by subscribing to the language-preference store (use-language-store.tsx) — which didn't
  // reproduce reliably on device — then properly fixed via useLang(), which subscribes directly to
  // this exact module's `lang` (useSyncExternalStore), the actual value t() reads.
  test("updates its copy when the language changes, without remounting", () => {
    render(<ChatEmptyState onSelect={vi.fn()} />);
    expect(screen.getByText("Cuadremos tus finanzas personales")).toBeInTheDocument();

    act(() => setLanguage("en"));

    expect(screen.getByText("Let's square up your personal finances")).toBeInTheDocument();
    expect(screen.getByLabelText("Log income")).toBeInTheDocument();
  });
});
