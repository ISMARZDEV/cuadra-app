import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

const push = vi.fn();
vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));

// `vi.mock` se hoistea al tope del archivo, así que la fábrica NO puede leer un `const` de arriba:
// se evalúa antes. `vi.hoisted` sube la creación del spy con ella. (`push` se salva porque vive
// dentro de un closure que recién corre al renderizar.)
const { openURL } = vi.hoisted(() => ({ openURL: vi.fn() }));
vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("react-native")>("react-native");
  return { ...actual, Linking: { openURL } };
});

import { AgentMessage } from "./agent-message";

describe("AgentMessage", () => {
  test("renders plain reply text when there is no href", () => {
    // StreamingText fades in per word → each word is its own node (no single full-string node).
    render(<AgentMessage text="gasto registrado" />);
    expect(screen.getByText("registrado")).toBeInTheDocument();
  });

  test("once the reply is done (showActions), plain text is ONE selectable node, not per-word", () => {
    // Live streaming needs the per-word split for the fade; a finished reply doesn't, and
    // splitting there was the reason drag-to-select a phrase never worked — selection can't cross
    // from one <Text> node into the next. If this still rendered per-word, the full sentence
    // wouldn't exist as a single text match — only its individual words would.
    render(<AgentMessage text="gasto registrado con éxito" showActions />);
    expect(screen.getByText("gasto registrado con éxito")).toBeInTheDocument();
  });

  test("a markdown reply renders the **opener** as a heading + normal coaching, no ** markers", () => {
    render(<AgentMessage text={"**Wow!!! 🫣**\nEso es mucho dinero Ismael"} />);
    expect(screen.getByText("Wow!!! 🫣")).toBeInTheDocument();
    expect(screen.getByText("Eso es mucho dinero Ismael")).toBeInTheDocument();
    expect(screen.queryByText(/\*\*/)).toBeNull();
  });

  test("an href turns the message into a deep link that navigates", () => {
    push.mockClear();
    render(<AgentMessage text="Ver en Insight" href="insights" />);
    fireEvent.click(screen.getByText("Ver en Insight"));
    expect(push).toHaveBeenCalledWith("/insights");
  });

  // Una comparación de 3 tiendas × 4 cifras metida en oraciones es ilegible. La gramática es
  // MÍNIMA a propósito: `## sección` + `- viñeta` + el `**negrita**` que ya existía.
  describe("la gramática de datos", () => {
    test("`## Tienda` es un SUBTÍTULO, no el titular gigante del coach", () => {
      // El defecto que esto evita: una línea entera en **negrita** ya significaba «titular a
      // 24px» (el «Wow!!!» del coach). Reusarla para el nombre de una tienda haría que un token
      // nombrara dos cosas distintas y ninguna quedaría bien.
      render(<AgentMessage text={"Con RD$10,000:\n\n## Sirena\n60 artículos"} />);

      const heading = screen.getByText("Sirena");
      expect(heading).toBeInTheDocument();
      expect(screen.queryByText(/##/)).toBeNull();
      expect(Number.parseFloat(heading.style.fontSize)).toBeLessThan(24);
    });

    test("el titular del coach SIGUE siendo grande — no se rompe lo que ya andaba", () => {
      render(<AgentMessage text={"**Wow!!! 🫣**\nEso es mucho"} />);

      expect(Number.parseFloat(screen.getByText("Wow!!! 🫣").style.fontSize)).toBe(24);
    });

    test("`- item` sale como viñeta y sin el guion crudo", () => {
      render(<AgentMessage text={"## Bravo\n- Arroz Campos\n- Aceite Mazola"} />);

      expect(screen.getByText("Arroz Campos")).toBeInTheDocument();
      expect(screen.getByText("Aceite Mazola")).toBeInTheDocument();
      expect(screen.queryByText(/^- /)).toBeNull();
    });

    test("un texto con `##` se renderiza rico aunque NO traiga `**`", () => {
      // Sin esto el usuario vería los `##` crudos: RichText sólo se activaba con `**`.
      render(<AgentMessage text={"## Sirena\nRD$215.00"} />);

      expect(screen.queryByText(/##/)).toBeNull();
      expect(screen.getByText("RD$215.00")).toBeInTheDocument();
    });

    test("una respuesta sin marcas sigue con el fade por palabra", () => {
      render(<AgentMessage text="No tengo ese producto en el catálogo" />);
      expect(screen.getByText("catálogo")).toBeInTheDocument();
    });
  });

  // El canal de enlaces se construyó para deep links INTERNOS ("insights"). Con los enlaces de
  // tienda de Save entra un http(s):// externo, y `router.push("/https://sirena…")` no lleva a
  // ninguna parte: hay que salir al navegador. Son dos destinos distintos por el mismo campo.
  describe("un enlace EXTERNO de tienda", () => {
    test("abre el navegador en vez de navegar dentro de la app", () => {
      push.mockClear();
      openURL.mockClear();
      render(<AgentMessage text="Comprar en Sirena" href="https://sirena.com.do/p/1" />);

      fireEvent.click(screen.getByText("Comprar en Sirena"));

      expect(openURL).toHaveBeenCalledWith("https://sirena.com.do/p/1");
      expect(push).not.toHaveBeenCalled();
    });

    test("un http:// también sale al navegador", () => {
      openURL.mockClear();
      render(<AgentMessage text="Comprar en Bravo" href="http://bravo.com.do/p/2" />);

      fireEvent.click(screen.getByText("Comprar en Bravo"));

      expect(openURL).toHaveBeenCalledWith("http://bravo.com.do/p/2");
    });

    test("una ruta interna NO sale al navegador", () => {
      openURL.mockClear();
      render(<AgentMessage text="Ver en Insight" href="insights" />);

      fireEvent.click(screen.getByText("Ver en Insight"));

      expect(openURL).not.toHaveBeenCalled();
    });
  });
});
