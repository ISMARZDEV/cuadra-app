import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { translate, type MessageKey } from "@/i18n/messages";

import { HealthBadge } from "./HealthBadge";

// `t` real en español → verifica el texto localizado (10.A: la etiqueta sale de i18n, no hardcode).
const t = (key: MessageKey) => translate("es", key);

describe("HealthBadge", () => {
  it("renders green for ok", () => {
    render(<HealthBadge health="ok" t={t} />);
    expect(screen.getByText("OK")).toHaveClass("bg-green-100");
  });

  it("renders amber for stale", () => {
    render(<HealthBadge health="stale" t={t} />);
    expect(screen.getByText("Desactualizada")).toHaveClass("bg-amber-100");
  });

  it("renders grey for paused", () => {
    render(<HealthBadge health="paused" t={t} />);
    expect(screen.getByText("Pausada")).toHaveClass("bg-gray-100");
  });
});
