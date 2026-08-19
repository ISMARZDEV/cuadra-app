import { beforeEach, describe, expect, test } from "vitest";

import { __resetSecureStore } from "@/test/secure-store-stub";

import { unreadCount, useAlertsReadStore } from "./alerts-read";

beforeEach(async () => {
  __resetSecureStore();
  useAlertsReadStore.setState({ readIds: [], hydrated: false });
});

// El punto rojo de la campana cuenta lo que el usuario NO HA VISTO EN PANTALLA, y eso NO es lo
// mismo que el set de `local-alerts.ts`. Aquél marca visto en cuanto DISPARA la notificación del
// sistema, así que para cuando abres la app ya está todo "visto" y el punto no se encendería nunca.
// Son dos preguntas distintas: «¿ya te avisé?» y «¿ya lo miraste?».
describe("unreadCount", () => {
  test("sin nada leído, todo el feed cuenta", () => {
    expect(unreadCount(["a", "b", "c"], [])).toBe(3);
  });

  test("lo ya leído no vuelve a contar", () => {
    expect(unreadCount(["a", "b", "c"], ["a", "b", "c"])).toBe(0);
  });

  test("una alerta nueva sobre un feed ya leído enciende el punto de nuevo", () => {
    expect(unreadCount(["a", "b", "c", "d"], ["a", "b", "c"])).toBe(1);
  });

  // Una alerta que YA NO está en el feed no puede dejar el punto encendido para siempre: se cuenta
  // contra el feed vigente, no contra el histórico de lo leído.
  test("lo leído que ya no está en el feed no deja el punto colgado", () => {
    expect(unreadCount(["d"], ["a", "b", "c"])).toBe(1);
    expect(unreadCount([], ["a", "b", "c"])).toBe(0);
  });
});

describe("el registro de alertas vistas", () => {
  test("marcar leído sobrevive al reinicio de la app", async () => {
    await useAlertsReadStore.getState().markAllRead(["a", "b"]);

    // Simula arrancar de cero: el store en blanco, el almacén seguro intacto.
    useAlertsReadStore.setState({ readIds: [], hydrated: false });
    await useAlertsReadStore.getState().hydrate();

    expect(useAlertsReadStore.getState().readIds).toEqual(["a", "b"]);
  });

  test("marcar leído ACUMULA, no reemplaza", async () => {
    await useAlertsReadStore.getState().markAllRead(["a"]);
    await useAlertsReadStore.getState().markAllRead(["b"]);

    expect(useAlertsReadStore.getState().readIds).toEqual(["a", "b"]);
  });

  test("no repite ids", async () => {
    await useAlertsReadStore.getState().markAllRead(["a", "b"]);
    await useAlertsReadStore.getState().markAllRead(["b", "c"]);

    expect(useAlertsReadStore.getState().readIds).toEqual(["a", "b", "c"]);
  });

  // El almacén seguro no es un basurero: sin tope, el registro crece sin fin con cada alerta que
  // pasa por el feed. Se descartan los MÁS VIEJOS, que son justo los que ya no vuelven a aparecer.
  test("el registro tiene tope y descarta lo más viejo", async () => {
    const many = Array.from({ length: 250 }, (_, i) => `id-${i}`);

    await useAlertsReadStore.getState().markAllRead(many);

    const kept = useAlertsReadStore.getState().readIds;
    expect(kept).toHaveLength(200);
    expect(kept[0]).toBe("id-50");
    expect(kept.at(-1)).toBe("id-249");
  });
});
