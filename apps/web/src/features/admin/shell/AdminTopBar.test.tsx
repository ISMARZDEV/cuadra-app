import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AdminTopBar } from "./AdminTopBar";
import { initialsFromName } from "./initials";

describe("AdminTopBar", () => {
  it("renderiza el nombre del usuario actual", () => {
    render(<AdminTopBar name="Ismael Martínez" locale="es" />);
    expect(screen.getByText("Ismael Martínez")).toBeInTheDocument();
  });

  it("renderiza las iniciales del nombre en el Avatar", () => {
    render(<AdminTopBar name="Ismael Martínez" locale="es" />);
    expect(screen.getByText("IM")).toBeInTheDocument();
  });

  it("renderiza el botón de notificaciones (campana) por nombre accesible", () => {
    render(<AdminTopBar name="Ismael Martínez" locale="es" />);
    expect(screen.getByRole("button", { name: "Notificaciones" })).toBeInTheDocument();
  });

  it("renderiza el botón de configuración (gear) por nombre accesible", () => {
    render(<AdminTopBar name="Ismael Martínez" locale="es" />);
    expect(screen.getByRole("button", { name: "Configuración" })).toBeInTheDocument();
  });

  it("respeta el locale para los aria-labels (en)", () => {
    render(<AdminTopBar name="Ismael Martínez" locale="en" />);
    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
  });
});

describe("initialsFromName", () => {
  it("nombre de 2+ palabras → primera letra de las primeras dos, mayúsculas", () => {
    expect(initialsFromName("Ismael Martínez")).toBe("IM");
    expect(initialsFromName("ismael martinez perez")).toBe("IM");
  });

  it("nombre de una sola palabra → hasta 2 letras", () => {
    expect(initialsFromName("Ismael")).toBe("IS");
    expect(initialsFromName("A")).toBe("A");
  });

  it("nombre vacío o solo espacios → string vacío, no revienta", () => {
    expect(initialsFromName("")).toBe("");
    expect(initialsFromName("   ")).toBe("");
  });
});
