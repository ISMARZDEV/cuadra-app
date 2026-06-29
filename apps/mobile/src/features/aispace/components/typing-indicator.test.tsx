import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { setLanguage } from "@/i18n";

import { TypingIndicator } from "./typing-indicator";

describe("TypingIndicator", () => {
  beforeEach(() => setLanguage("es"));

  test("shows the loading dots while visible", () => {
    render(<TypingIndicator visible />);
    expect(screen.getByLabelText("Cargando respuesta…")).toBeInTheDocument();
  });

  test("renders nothing when not visible", () => {
    render(<TypingIndicator visible={false} />);
    expect(screen.queryByLabelText("Cargando respuesta…")).toBeNull();
  });
});
