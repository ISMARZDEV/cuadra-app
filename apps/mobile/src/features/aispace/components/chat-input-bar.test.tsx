import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { setLanguage } from "@/i18n";

import { ChatInputBar } from "./chat-input-bar";

describe("ChatInputBar", () => {
  beforeEach(() => setLanguage("es")); // jsdom resolves Intl to en — pin it for determinism

  test("renders the localized placeholder and the action buttons", () => {
    render(<ChatInputBar />);

    expect(screen.getByPlaceholderText(/.+/)).toBeInTheDocument();
    expect(screen.getByLabelText("Enviar")).toBeInTheDocument();
    expect(screen.getByLabelText("Adjuntar")).toBeInTheDocument();
    expect(screen.getByLabelText("Mensaje de voz")).toBeInTheDocument();
  });
});
