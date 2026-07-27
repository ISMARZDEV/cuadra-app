import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";

import { EcosystemRail } from "./EcosystemRail";

// El rail es el shell del ECOSISTEMA aispace (Figma nodo 484:6497), no del admin de Cuadra. Su
// único control interactivo es el toggle de tema del pie, que reusa la MISMA lógica que
// `components/layout/theme-toggle.tsx` (alterna `.dark` en `<html>`). El resto del cluster es
// decorativo — igual que cuando era un PNG, para no inventar controles muertos sin destino.
describe("EcosystemRail", () => {
  beforeEach(() => {
    document.documentElement.classList.remove("dark");
  });

  // REGRESIÓN: los dos PNG traían el verde `#06382c` HORNEADO en el bitmap. En tema oscuro el
  // contenedor es `dark:bg-[#1c1c1c]`, así que se veían dos rectángulos verdes recortados sobre
  // gris y el rail parecía cortarse a media altura. Con iconos vectoriales no hay fondo que
  // pueda desalinearse con el del contenedor.
  it("no renderiza ninguna imagen — el cluster son iconos vectoriales", () => {
    const { container } = render(<EcosystemRail />);

    expect(container.querySelectorAll("img")).toHaveLength(0);
    expect(container.querySelectorAll("svg").length).toBeGreaterThanOrEqual(6);
  });

  it("llena el alto del viewport para que el fondo no se corte", () => {
    render(<EcosystemRail />);

    const rail = screen.getByLabelText("aispace ecosystem");
    expect(rail.className).toContain("h-screen");
  });

  it("expone un nombre accesible en el botón de tema", () => {
    render(<EcosystemRail />);

    expect(screen.getByRole("button", { name: /tema|theme/i })).toBeInTheDocument();
  });

  it("alterna la clase .dark en document.documentElement al hacer clic", () => {
    render(<EcosystemRail />);

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    const toggle = screen.getByRole("button", { name: /tema|theme/i });
    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(toggle);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  // El icono debe reflejar el estado, no quedarse fijo: en claro se ofrece la luna (ir a oscuro),
  // en oscuro el sol. Antes era un PNG único con AMBOS símbolos horneados, así que no comunicaba
  // ningún estado.
  it("intercambia luna y sol según el tema activo", () => {
    render(<EcosystemRail />);

    const toggle = screen.getByRole("button", { name: /tema|theme/i });
    expect(toggle.querySelector("svg")?.getAttribute("class")).toMatch(/moon/);

    fireEvent.click(toggle);
    expect(toggle.querySelector("svg")?.getAttribute("class")).toMatch(/sun/);
  });

  // El cluster no debe filtrar sus iconos al árbol de accesibilidad: son decorativos, y sin esto
  // un lector de pantalla anunciaría siete elementos sin destino.
  it("mantiene el cluster superior fuera del árbol de accesibilidad", () => {
    render(<EcosystemRail />);

    expect(screen.queryAllByRole("img")).toHaveLength(0);
    // El único elemento interactivo del rail es el toggle de tema.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
