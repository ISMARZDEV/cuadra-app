import { fireEvent, render, screen } from "@testing-library/react";
import { Text } from "react-native";
import { beforeEach, describe, expect, test, vi } from "vitest";

// `expo-haptics` ya viene aliaseado a un stub INERTE en vitest.config (su build web llama a
// `window.matchMedia` en el import y revienta en jsdom). El stub no registra llamadas, así que
// para poder ASERTAR sobre la háptica hace falta este mock explícito encima del alias.
vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(),
  ImpactFeedbackStyle: { Light: "light" },
}));

// `setup.ts` clava el esquema en "light" para toda la suite, así que el tema oscuro no era
// observable en ningún test. Acá SÍ importa: la variante del carrusel se define en oscuro, y la del
// input tiene que quedarse quieta en los dos. Se sustituye el mock global por uno mutable.
const theme = vi.hoisted(() => ({ scheme: "light" as "light" | "dark" }));
vi.mock("nativewind", () => ({
  useColorScheme: () => ({
    colorScheme: theme.scheme,
    setColorScheme: () => {},
    toggleColorScheme: () => {},
  }),
  vars: (value: unknown) => value,
  cssInterop: () => {},
  remapProps: () => {},
}));

import * as Haptics from "expo-haptics";

import { PillButton } from "./pill-button";

describe("PillButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    theme.scheme = "light";
  });

  test("renders its label and the icon node it was given", () => {
    render(<PillButton icon={<Text>✦</Text>} label="0/5 mensajes" />);

    expect(screen.getByText("0/5 mensajes")).toBeInTheDocument();
    expect(screen.getByText("✦")).toBeInTheDocument();
  });

  test("falls back to the label as the accessible name", () => {
    render(<PillButton label="0/5 mensajes" />);

    expect(screen.getByLabelText("0/5 mensajes")).toBeInTheDocument();
  });

  test("fires onPress when tapped", () => {
    const onPress = vi.fn();
    render(<PillButton label="Tocame" onPress={onPress} />);

    fireEvent.click(screen.getByLabelText("Tocame"));

    expect(onPress).toHaveBeenCalledOnce();
  });

  // La háptica va ANTES del handler: el dedo tiene que sentir la respuesta en el mismo frame, no
  // después de que el estado (o una navegación) se resuelva. Misma regla que basket-product-card.
  test("fires the haptic BEFORE running the handler", () => {
    const order: string[] = [];
    vi.mocked(Haptics.impactAsync).mockImplementation(async () => {
      order.push("haptic");
    });

    render(<PillButton label="Tocame" onPress={() => order.push("handler")} />);
    fireEvent.click(screen.getByLabelText("Tocame"));

    expect(order).toEqual(["haptic", "handler"]);
  });

  // El contador de mensajes gratis del input (chat-input-bar.tsx) usa PillButton SIN acción. Un
  // botón que no hace nada no debe vibrar: sería prometer una respuesta que no llega. Este test
  // es el que protege ese llamador de la animación/háptica que se agregó para el carrusel.
  test("stays inert when there is no onPress", () => {
    render(<PillButton label="0/5 mensajes" />);

    fireEvent.click(screen.getByLabelText("0/5 mensajes"));

    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  describe("variants", () => {
    // La variante `surface` (carrusel de sugerencias) se definió en OSCURO: negro en degradado con
    // letra blanca. El degradado vive en el <Svg> y no es observable en jsdom; el color del texto
    // sí, y es lo que distingue una variante de la otra de un vistazo.
    test("surface writes in white on dark", () => {
      theme.scheme = "dark";
      render(<PillButton variant="surface" label="¿Cuánto gasté este mes 📅?" />);

      expect(screen.getByText("¿Cuánto gasté este mes 📅?")).toHaveStyle({ color: "rgb(255, 255, 255)" });
    });

    // EL TEST QUE IMPORTA: al agregar la variante del carrusel, el contador del input NO se
    // contagia. `brand` es el default, así que un llamador que no pide variante conserva su lima.
    test("brand is the default and keeps its lime on dark", () => {
      theme.scheme = "dark";
      render(<PillButton label="0/5 mensajes" />);

      expect(screen.getByText("0/5 mensajes")).toHaveStyle({ color: "rgb(194, 251, 126)" });
    });

    test("brand keeps its dark green on light", () => {
      render(<PillButton label="0/5 mensajes" />);

      expect(screen.getByText("0/5 mensajes")).toHaveStyle({ color: "rgb(3, 72, 66)" });
    });

    // La trampa de `fillOpacity`: el degradado vive en el <Svg>, que sólo se dibuja tras el primer
    // onLayout, así que debajo hay SIEMPRE un color plano de base. Si ese color se quedara opaco,
    // taparía por abajo exactamente lo que el degradado deja pasar por arriba y la prop no haría
    // nada visible. El alfa tiene que viajar a los dos.
    test("fillOpacity also reaches the flat base colour underneath the gradient", () => {
      theme.scheme = "dark";
      render(<PillButton variant="surface" label="Translúcida" fillOpacity={0.5} />);

      expect(screen.getByLabelText("Translúcida")).toHaveStyle({
        backgroundColor: "rgba(10, 10, 12, 0.5)",
      });
    });

    // `brand` ignora la prop: su fondo ya es translúcido por definición y tiene que seguir dejando
    // pasar el glass del input tal cual está hoy.
    test("brand ignores fillOpacity", () => {
      theme.scheme = "dark";
      render(<PillButton label="0/5 mensajes" fillOpacity={0.2} />);

      expect(screen.getByLabelText("0/5 mensajes")).toHaveStyle({
        backgroundColor: "rgba(21, 21, 21, 0.2)",
      });
    });
  });

  describe("truncation", () => {
    // react-native-web traduce `numberOfLines={1}` a CSS (`text-overflow: ellipsis` +
    // `white-space: nowrap`), no a un prop que sobreviva al DOM — por eso se lee del ESTILO
    // computado, no de `.props` (los nodos que devuelve `getByText` son DOM reales, no elementos
    // React; no tienen `.props`).
    test("without maxLines, the label never truncates", () => {
      render(<PillButton label="0/5 mensajes" />);

      expect(screen.getByText("0/5 mensajes")).not.toHaveStyle({ textOverflow: "ellipsis" });
    });

    // `ellipsizeMode` no se puede verificar acá — react-native-web ni siquiera lo lee (sólo
    // consume `numberOfLines`, que es lo que produce este CSS); se le sigue pasando "tail" porque
    // ES lo que gobierna el corte en iOS/Android nativo, donde `ellipsizeMode` sí importa.
    test("maxLines lets the label wrap and only then cuts it with an ellipsis", () => {
      render(<PillButton label="¿Dónde está el mejor precio de Guandules Verdes Goya?" maxLines={2} />);

      expect(screen.getByText(/mejor precio/)).toHaveStyle({
        WebkitLineClamp: "2",
        textOverflow: "ellipsis",
      });
    });

    // EL TOPE VIVE EN LA PÍLDORA, NO EN EL TEXTO. Puesto en el texto, una etiqueta que envuelve
    // reserva el ancho completo del tope y deja aire muerto a los lados: la píldora dejaba de
    // abrazar su contenido.
    test("maxWidth caps the PILL, so it hugs its content below that", () => {
      render(<PillButton label="Corta" maxWidth={240} maxLines={2} />);

      expect(screen.getByLabelText("Corta")).toHaveStyle({ maxWidth: "240px" });
      expect(screen.getByText("Corta")).not.toHaveStyle({ maxWidth: "240px" });
    });
  });

  // El cableado de "mantener oprimido" (onHoldReveal/onHoldRelease/delayLongPress) tiene su
  // PROPIO archivo — pill-button-hold.test.tsx — porque verificarlo exige mockear `Pressable` de
  // "react-native" a nivel de módulo, y ese mock rompería el resto de los tests de este archivo
  // (los que dependen de `fireEvent.click` contra el Pressable REAL de react-native-web).
});
