import type { AlertDto } from "@cuadra/api-client";
import { describe, expect, test } from "vitest";

import { followedAlertId } from "./follow-state";

const alerta = (id: string, canonicalProductId: string): AlertDto => ({
  id,
  canonical_product_id: canonicalProductId,
  product_name: "Garbanzos La Famosa 15 oz",
  created_at: "2026-08-22T00:00:00Z",
});

describe("followedAlertId", () => {
  test("sin alertas, no se sigue nada", () => {
    expect(followedAlertId([], "canon-1")).toBeNull();
  });

  test("una alerta de OTRO producto no cuenta", () => {
    expect(followedAlertId([alerta("a1", "canon-2")], "canon-1")).toBeNull();
  });

  test("devuelve el id de LA ALERTA, no el del producto", () => {
    // Es lo que hace falta para dejar de seguir: `unsubscribeAlert` recibe el id de la alerta.
    // Devolver un booleano obligaría a buscarla otra vez en el momento de borrarla.
    expect(followedAlertId([alerta("a1", "canon-1")], "canon-1")).toBe("a1");
  });

  test("la encuentra entre varias", () => {
    const alertas = [alerta("a1", "canon-9"), alerta("a2", "canon-1"), alerta("a3", "canon-7")];
    expect(followedAlertId(alertas, "canon-1")).toBe("a2");
  });

  test("mientras la lista viaja, no se sigue nada", () => {
    // `useMyAlerts` da `undefined` en la primera pasada. Sin esto el botón nacería diciendo «no
    // sigues» y saltaría a «siguiendo» al llegar la respuesta: un parpadeo en el estado, que es
    // peor que un botón que tarda un instante en poder pulsarse.
    expect(followedAlertId(undefined, "canon-1")).toBeNull();
  });

  test("EL DEFECTO QUE ESTO EVITA: sin producto todavía, nada empareja", () => {
    // La comparación llega DESPUÉS que la lista de alertas (ver el waterfall obligatorio de
    // `api.ts`), así que existe una ventana real con `productId` sin resolver. Comparando a pelo,
    // un `undefined === undefined` daría por seguida la primera alerta que viniera mal formada, y
    // el botón aparecería encendido sobre un producto que el usuario no sigue.
    expect(followedAlertId([alerta("a1", undefined as unknown as string)], undefined)).toBeNull();
    expect(followedAlertId([alerta("a1", "canon-1")], undefined)).toBeNull();
  });
});
