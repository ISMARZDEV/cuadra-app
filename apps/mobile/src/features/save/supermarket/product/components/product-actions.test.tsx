import type { AlertDto } from "@cuadra/api-client";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { setLanguage, t } from "@/i18n";

// Se moquea al nivel del HOOK y no del cliente HTTP: lo que se prueba aquí es la DECISIÓN —seguir
// o dejar de seguir— y atarla al transporte haría fallar el test por razones ajenas. Mismo criterio
// que `hub-screen.test.tsx`.
const { useMyAlerts, subscribeMutate, unsubscribeMutate } = vi.hoisted(() => ({
  useMyAlerts: vi.fn(),
  subscribeMutate: vi.fn(),
  unsubscribeMutate: vi.fn(),
}));
vi.mock("../../../api", () => ({
  useMyAlerts,
  useSubscribeAlert: () => ({ mutate: subscribeMutate, isPending: false }),
  useUnsubscribeAlert: () => ({ mutate: unsubscribeMutate, isPending: false }),
}));

import { HEADER_CARDS, resolveSkin } from "../../header-palette";
import { ProductActions } from "./product-actions";

const PRODUCTO = "canon-1";
const PIEL = resolveSkin(HEADER_CARDS[0], false);
const alerta: AlertDto = {
  id: "alerta-7",
  canonical_product_id: PRODUCTO,
  product_name: "Garbanzos La Famosa 15 oz",
  created_at: "2026-08-22T00:00:00Z",
};

const pintar = (props: Partial<React.ComponentProps<typeof ProductActions>> = {}) =>
  render(<ProductActions skin={PIEL} productId={PRODUCTO} onMoreInfo={() => {}} {...props} />);

describe("ProductActions · seguir el precio", () => {
  beforeEach(() => {
    setLanguage("es");
    subscribeMutate.mockClear();
    unsubscribeMutate.mockClear();
    useMyAlerts.mockReturnValue({ data: [] });
  });

  test("sin seguir, el toque SUSCRIBE al canónico", () => {
    pintar();

    fireEvent.click(screen.getByLabelText(t("save.product.follow.off")));

    expect(subscribeMutate).toHaveBeenCalledWith({ productId: PRODUCTO, thresholdMinor: null });
    expect(unsubscribeMutate).not.toHaveBeenCalled();
  });

  test("siguiendo, el toque DA DE BAJA — y por el id de la ALERTA, no el del producto", () => {
    // La inversión de esta rama es el defecto que este test existe para cazar, y mandar el id
    // equivocado sería peor todavía: borraría la alerta de otro producto.
    useMyAlerts.mockReturnValue({ data: [alerta] });
    pintar();

    fireEvent.click(screen.getByLabelText(t("save.product.follow.on")));

    expect(unsubscribeMutate).toHaveBeenCalledWith("alerta-7");
    expect(subscribeMutate).not.toHaveBeenCalled();
  });

  test("una alerta de OTRO producto no lo da por seguido", () => {
    useMyAlerts.mockReturnValue({ data: [{ ...alerta, canonical_product_id: "canon-9" }] });
    pintar();

    expect(screen.getByLabelText(t("save.product.follow.off"))).toBeInTheDocument();
  });

  test("sin producto todavía, el botón está y NO hace nada", () => {
    // Se dibuja apagado en vez de desaparecer: un control que aparece a los 200 ms movería la fila
    // entera justo cuando el usuario está leyendo el precio.
    pintar({ productId: undefined });

    fireEvent.click(screen.getByLabelText(t("save.product.follow.off")));

    expect(subscribeMutate).not.toHaveBeenCalled();
    expect(unsubscribeMutate).not.toHaveBeenCalled();
  });
});

describe("ProductActions · las otras dos", () => {
  beforeEach(() => {
    setLanguage("es");
    useMyAlerts.mockReturnValue({ data: [] });
  });

  test("«Más información» avisa a la pantalla", () => {
    const bajar = vi.fn();
    pintar({ onMoreInfo: bajar });

    fireEvent.click(screen.getByLabelText(t("save.product.actions.moreInfo")));

    expect(bajar).toHaveBeenCalledOnce();
  });

  test("sin grupos todavía, «Añadir a grupo» NO acepta toques", () => {
    // Mientras la capacidad no exista de verdad, la pantalla no pasa `onAddToGroup` y el botón se
    // apaga solo. Un botón vivo que promete guardar y no guarda es peor que uno apagado.
    pintar();

    fireEvent.click(screen.getByLabelText(t("save.product.actions.group")));

    // No hay nada que afirmar salvo que no reventó y sigue ahí, apagado.
    expect(screen.getByLabelText(t("save.product.actions.group"))).toBeInTheDocument();
  });

  test("con grupos, el toque abre la hoja", () => {
    const abrir = vi.fn();
    pintar({ onAddToGroup: abrir });

    fireEvent.click(screen.getByLabelText(t("save.product.actions.group")));

    expect(abrir).toHaveBeenCalledOnce();
  });
});
