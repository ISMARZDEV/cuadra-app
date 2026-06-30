import { fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage } from "@/i18n";

// Native side-effects (haptics + audio) — stub so the component imports in jsdom.
vi.mock("expo-haptics", () => ({ impactAsync: vi.fn(), ImpactFeedbackStyle: { Light: "light" } }));
vi.mock("@/lib/sounds", () => ({ sounds: { dock: vi.fn() } }));

import { ChatDock } from "./chat-dock";

describe("ChatDock", () => {
  beforeEach(() => setLanguage("es"));

  test("closed: the toggle invites opening", () => {
    render(
      <ChatDock open={false} onToggle={vi.fn()}>
        <Text>contenido</Text>
      </ChatDock>,
    );
    expect(screen.getByLabelText("Mostrar sugerencias")).toBeInTheDocument();
  });

  test("open: the toggle invites closing", () => {
    render(
      <ChatDock open onToggle={vi.fn()}>
        <Text>contenido</Text>
      </ChatDock>,
    );
    expect(screen.getByLabelText("Ocultar sugerencias")).toBeInTheDocument();
  });

  test("tapping the toggle reports it", () => {
    const onToggle = vi.fn();
    render(
      <ChatDock open={false} onToggle={onToggle}>
        <Text>contenido</Text>
      </ChatDock>,
    );
    fireEvent.click(screen.getByLabelText("Mostrar sugerencias"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  test("renders its children", () => {
    render(
      <ChatDock open onToggle={vi.fn()}>
        <Text>contenido</Text>
      </ChatDock>,
    );
    expect(screen.getByText("contenido")).toBeInTheDocument();
  });
});
