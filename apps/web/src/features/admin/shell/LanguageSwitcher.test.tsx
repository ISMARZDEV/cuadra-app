import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { translate, type MessageKey } from "@/i18n/messages";

import { LanguageSwitcher } from "./LanguageSwitcher";

const t = (key: MessageKey) => translate("es", key);

describe("LanguageSwitcher", () => {
  beforeEach(() => {
    document.cookie = "admin_locale=; path=/; max-age=0";
  });

  it("expone las 3 opciones de idioma bajo un trigger accesible", async () => {
    render(<LanguageSwitcher locale="es" t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Idioma" }));
    expect(await screen.findByText("Español")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Português")).toBeInTheDocument();
  });

  it("elegir un idioma escribe la cookie admin_locale (sin tocar la cuenta global)", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { value: { reload }, writable: true });
    render(<LanguageSwitcher locale="es" t={t} />);
    fireEvent.click(screen.getByRole("button", { name: "Idioma" }));
    fireEvent.click(await screen.findByText("English"));
    expect(document.cookie).toContain("admin_locale=en");
    expect(reload).toHaveBeenCalled();
  });
});
