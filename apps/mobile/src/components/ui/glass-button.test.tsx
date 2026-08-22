import { fireEvent, render, screen } from "@testing-library/react";
import { Plus } from "lucide-react-native";
import { describe, expect, test, vi } from "vitest";

import { GlassButton } from "./glass-button";

describe("GlassButton", () => {
  test("exposes its accessible label", () => {
    render(<GlassButton icon={Plus} label="Attach" />);

    expect(screen.getByLabelText("Attach")).toBeInTheDocument();
  });

  test("fires onPress when tapped", () => {
    const onPress = vi.fn();
    render(<GlassButton icon={Plus} label="Attach" onPress={onPress} />);

    fireEvent.click(screen.getByLabelText("Attach"));

    expect(onPress).toHaveBeenCalledOnce();
  });

  // El punto es OPT-IN: un botón de herramienta no lleva nada encima salvo que se lo pidan.
  test("no draws a badge by default", () => {
    render(<GlassButton icon={Plus} label="Attach" />);

    expect(screen.queryByTestId("glass-button-badge")).toBeNull();
  });

  test("draws a badge when asked", () => {
    render(<GlassButton icon={Plus} label="Attach" badge />);

    expect(screen.getByTestId("glass-button-badge")).toBeInTheDocument();
  });
});

describe("GlassButton — variante con texto", () => {
  test("sin `text` no pinta texto: sigue siendo un botón de símbolo", () => {
    render(<GlassButton icon={Plus} label="Añadir" />);

    // El `label` es para el lector de pantalla, NO texto visible. Confundirlos haría que cada
    // botón de la app empezara a mostrar su etiqueta de accesibilidad.
    expect(screen.queryByText("Añadir")).not.toBeInTheDocument();
  });

  test("con `text` lo pinta junto al icono", () => {
    render(<GlassButton icon={Plus} label="Añadir a la lista" text="Añadir a la lista" />);

    expect(screen.getByText("Añadir a la lista")).toBeInTheDocument();
  });

  test("la variante con texto sigue siendo pulsable como cualquier otra", () => {
    // El defecto que la motivó: el botón de añadir era un `Pressable` plano y no reaccionaba como
    // sus vecinos de vidrio. Debe compartir el MISMO camino de pulsación, no uno paralelo.
    const onPress = vi.fn();
    render(<GlassButton icon={Plus} label="Añadir" text="Añadir" onPress={onPress} />);

    fireEvent.click(screen.getByLabelText("Añadir"));

    expect(onPress).toHaveBeenCalledOnce();
  });
});
