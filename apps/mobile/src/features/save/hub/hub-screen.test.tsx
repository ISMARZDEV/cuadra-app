import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage, t } from "@/i18n";
import { QueryWrapper } from "@/test/query-wrapper";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push }) }));

// El feed de alertas se moquea al nivel del HOOK y no del cliente HTTP: al hub sólo le importa
// CUÁNTAS hay sin ver, y atarlo al transporte haría fallar estos tests por razones ajenas.
const { useAlertNotifications } = vi.hoisted(() => ({ useAlertNotifications: vi.fn() }));
vi.mock("../api", () => ({ useAlertNotifications }));

import { useAlertsReadStore } from "../alerts-read";
import { titleIndentFor } from "./components/vertical-card";
import { HubScreen } from "./hub-screen";
import { VERTICALS } from "./verticals";

const renderHub = () => render(<HubScreen />, { wrapper: QueryWrapper });

// Las consultas van por ETIQUETA ACCESIBLE, no por texto: el card parte el título en las líneas
// del diseño («Super / market»), así que el nodo de texto ya no dice «Supermarket». La etiqueta
// sigue siendo la marca entera — que es justo lo que un lector de pantalla debe anunciar.
describe("HubScreen", () => {
  beforeEach(() => {
    setLanguage("es");
    push.mockClear();
    useAlertNotifications.mockReturnValue({ data: [] });
    useAlertsReadStore.setState({ readIds: [], hydrated: true });
  });

  test("muestra las cuatro verticales de Save", () => {
    renderHub();

    expect(screen.getByLabelText("Supermarket")).toBeInTheDocument();
    expect(screen.getByLabelText("Credit Cards")).toBeInTheDocument();
    expect(screen.getByLabelText("Loans & Insurance")).toBeInTheDocument();
    expect(screen.getByLabelText("Investments")).toBeInTheDocument();
  });

  test("Promotions NO es una vertical: es una capa transversal", () => {
    renderHub();

    expect(screen.queryByLabelText("Promotions")).toBeNull();
  });

  test("la campana lleva al feed de alertas — que dejó de ser la pantalla de Save", () => {
    renderHub();

    fireEvent.click(screen.getByLabelText("Alertas de precio"));

    expect(push).toHaveBeenCalledWith("/save/alerts");
  });

  test("la vertical con datos navega a su stack", () => {
    renderHub();

    fireEvent.click(screen.getByLabelText("Supermarket"));

    expect(push).toHaveBeenCalledWith("/save/supermarket");
  });

  test("una vertical sin datos NO navega — no manda a una pantalla vacía", () => {
    renderHub();

    fireEvent.click(screen.getByLabelText("Credit Cards"));

    expect(push).not.toHaveBeenCalled();
  });

  test("la vertical sin datos abre su promesa concreta", () => {
    renderHub();

    fireEvent.click(screen.getByLabelText("Credit Cards"));

    expect(screen.getByText(t("save.hub.cards.blurb"))).toBeInTheDocument();
  });

  test("la hoja de «en construcción» se cierra con Entendido", () => {
    renderHub();
    fireEvent.click(screen.getByLabelText("Credit Cards"));

    fireEvent.click(screen.getByText(t("save.hub.soon.close")));

    expect(screen.queryByText(t("save.hub.cards.blurb"))).toBeNull();
  });

  // Esta es la que ata el defecto: la hoja vivía INLINE al final del `ScrollView`, detrás de los
  // cuatro cards, así que al tocar una vertical de abajo aparecía fuera de pantalla. Al vivir en un
  // `Modal` gana un fondo tocable — que es la prueba de que FLOTA y ya no se scrollea con la lista.
  test("la hoja se cierra tocando el fondo — flota, ya no vive al final del scroll", () => {
    renderHub();
    fireEvent.click(screen.getByLabelText("Credit Cards"));

    fireEvent.click(screen.getByLabelText(t("save.hub.soon.dismiss")));

    expect(screen.queryByText(t("save.hub.cards.blurb"))).toBeNull();
  });
});

// El punto rojo de la campana es VERDADERO o no es: uno decorativo, encendido siempre, entrena al
// usuario a ignorarlo — y a la tercera vez que abre y no hay nada, la campana deja de significar
// algo. Estos casos son la diferencia entre un aviso y un adorno.
describe("el punto de la campana", () => {
  beforeEach(() => {
    setLanguage("es");
    useAlertsReadStore.setState({ readIds: [], hydrated: true });
  });

  test("sin alertas no hay punto", () => {
    useAlertNotifications.mockReturnValue({ data: [] });

    renderHub();

    expect(screen.queryByTestId("glass-button-badge")).toBeNull();
  });

  test("con alertas sin mirar, se enciende", () => {
    useAlertNotifications.mockReturnValue({ data: [{ id: "a" }, { id: "b" }] });

    renderHub();

    expect(screen.getByTestId("glass-button-badge")).toBeInTheDocument();
  });

  test("si ya las miraste todas, se apaga", () => {
    useAlertNotifications.mockReturnValue({ data: [{ id: "a" }, { id: "b" }] });
    useAlertsReadStore.setState({ readIds: ["a", "b"], hydrated: true });

    renderHub();

    expect(screen.queryByTestId("glass-button-badge")).toBeNull();
  });

  test("una alerta nueva sobre lo ya mirado vuelve a encenderlo", () => {
    useAlertNotifications.mockReturnValue({ data: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    useAlertsReadStore.setState({ readIds: ["a", "b"], hydrated: true });

    renderHub();

    expect(screen.getByTestId("glass-button-badge")).toBeInTheDocument();
  });

  // Un punto de color NO EXISTE para un lector de pantalla: si la cuenta no va también en la
  // etiqueta, la campana suena igual con dos alertas nuevas que con ninguna.
  test("la cuenta va también en la etiqueta accesible", async () => {
    useAlertNotifications.mockReturnValue({ data: [{ id: "a" }, { id: "b" }] });

    renderHub();

    await waitFor(() => {
      expect(screen.getByLabelText("Alertas de precio, 2 sin leer")).toBeInTheDocument();
    });
  });
});

describe("el registro de verticales", () => {
  // Ninguna queda con el panel pelado: `check-emblem` es el genérico de las que no tienen
  // ilustración propia. NO se puede afirmar CUÁL emblema le toca a cada una — bajo vitest TODOS
  // los `.svg` resuelven al mismo stub (`vitest.config.ts`), así que comparar identidades pasaría
  // por la razón equivocada. Eso se verifica en device.
  test("toda vertical tiene emblema", () => {
    for (const vertical of VERTICALS) {
      expect(vertical.art).toBeDefined();
    }
  });

  // El corte del título es DATO, no wrap automático: sin esto RN parte por donde entra y escupe
  // «Supermar / ket».
  test("el título se parte donde lo parte el diseño", () => {
    const bySlug = Object.fromEntries(VERTICALS.map((v) => [v.id, v.titleLines]));

    expect(bySlug.supermarket).toEqual(["Super", "market"]);
    expect(bySlug.cards).toEqual(["Credit", "Cards"]);
    expect(bySlug.loans).toEqual(["Loans &", "Insurance"]);
  });

  // «Investments» es la ÚNICA que se parte dentro de una palabra, y por eso es la única que lleva
  // guion: sin él, «Invest / ments» se lee como dos palabras rotas en vez de una partida. El corte
  // va donde lo pide la sílaba (In·vest·ments), no donde entra el pixel.
  test("la palabra que se parte por dentro lleva su guion", () => {
    const investments = VERTICALS.find((v) => v.id === "investments");

    expect(investments?.titleLines).toEqual(["Invest-", "ments"]);
  });

  // Ningún título se va a UNA línea larga: medido en simulador, a 30pt no entra en el blanco del
  // card y sale truncado con «…» — un corte sin dónde leer el resto. Dos líneas siempre.
  test("ningún título queda en una sola línea larga", () => {
    for (const vertical of VERTICALS) {
      expect(vertical.titleLines.length).toBeGreaterThan(1);
    }
  });

  // `WIDEST_TITLE_PT` (vertical-card) está medido contra ESTAS líneas exactas, sumando avances de
  // glifo del .ttf. Si alguien agrega o cambia un título, este test cae — y esa caída es la
  // instrucción: volver a medir con `scripts/measure-title-width.py` antes de tocar la constante.
  test("las líneas de título son las que están medidas", () => {
    expect([...VERTICALS.flatMap((v) => v.titleLines)].sort()).toEqual(
      ["Cards", "Credit", "Insurance", "Invest-", "Loans &", "Super", "market", "ments"].sort(),
    );
  });

  // El título completo sobrevive como MARCA aunque el card lo parta: es la etiqueta accesible y el
  // nombre que usa la hoja de «en construcción».
  //
  // El guion se descuenta junto con los espacios, y por la misma razón: ninguno de los dos es parte
  // del nombre, son marcas de CÓMO se dibuja. «Invest-/ments» sigue siendo la marca «Investments».
  test("el título de marca no se pierde al partirlo", () => {
    for (const vertical of VERTICALS) {
      expect(vertical.titleLines.join("").replace(/[\s-]/g, "")).toBe(
        vertical.title.replace(/[\s-]/g, ""),
      );
    }
  });
});

// La sangría del título es lo ÚNICO del card que depende del ancho de la pantalla, y su defecto no
// se ve en el simulador que uno tiene abierto: con la constante fija de antes (12), «Insurance»
// salía truncada con «…» en cualquier iPhone de 375pt y entera en el de 393 del escritorio. Por eso
// se afirma como función pura sobre los tres tamaños, en vez de mirarlo.
describe("la sangría del título", () => {
  // El blanco disponible = ancho − 2·gutter(14) − 2·borde(2) − panel(187) − holgura derecha(8).
  // «Insurance» necesita 142.2pt medidos sobre el .ttf.
  test("en una pantalla angosta cede hasta pegarse al canto antes que truncar", () => {
    // 375 → columna 156 → sobran 5.8 tras la línea más ancha.
    expect(titleIndentFor(375)).toBe(5);
  });

  test("en una pantalla media reparte lo que sobra", () => {
    // 393 → columna 174 → sobran 23.8.
    expect(titleIndentFor(393)).toBe(23);
  });

  test("en una pantalla ancha llega al tope que pide el diseño y NO lo pasa", () => {
    // 430 → sobrarían ~60, pero el diseño pide 50 y de ahí no se mueve: más sangría empujaría el
    // título contra el panel de arte, que es lo que la referencia no hace.
    expect(titleIndentFor(430)).toBe(50);
  });

  test("nunca es negativa — si ni pegada al canto entra, se queda en cero", () => {
    expect(titleIndentFor(320)).toBe(0);
  });
});
