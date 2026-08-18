import { beforeEach, describe, expect, test, vi } from "vitest";

// Mismo mock que `suggestion-usage-store.test.ts`: `expo-secure-store` no está aliaseado en
// vitest.config y su módulo nativo no existe bajo jsdom.
const { getItemAsync, setItemAsync } = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({ getItemAsync, setItemAsync }));

import { MAX_RECENTS, RECENTS_KEY, useRecentSearchesStore } from "./recent-searches-store";

const state = () => useRecentSearchesStore.getState();

describe("recent searches store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Un store de zustand es un singleton de módulo: sin reset el estado se filtra entre tests.
    useRecentSearchesStore.setState({ recents: [], restored: false });
  });

  test("recupera lo buscado en una sesión anterior", async () => {
    getItemAsync.mockResolvedValue(JSON.stringify(["leche", "arroz"]));

    await state().restore();

    expect(state().recents).toEqual(["leche", "arroz"]);
    expect(state().restored).toBe(true);
  });

  // El buscador llama a `restore()` CADA VEZ que se abre. Como `record()` persiste de forma
  // asíncrona, una segunda lectura podía adelantar a esa escritura y devolver la lista sin la
  // búsqueda recién hecha — borrándola de la pantalla. Pasó de verdad al sembrar cuatro búsquedas:
  // una desaparecía.
  test("no vuelve a leer el disco una vez restaurado", async () => {
    getItemAsync.mockResolvedValue(JSON.stringify(["leche"]));
    await state().restore();
    await state().record("arroz");

    await state().restore();

    expect(getItemAsync).toHaveBeenCalledOnce();
    expect(state().recents).toEqual(["arroz", "leche"]);
  });

  test("arranca vacío en una instalación nueva", async () => {
    getItemAsync.mockResolvedValue(null);

    await state().restore();

    expect(state().recents).toEqual([]);
    expect(state().restored).toBe(true);
  });

  // El historial es una comodidad, no un dato crítico: un payload corrupto se descarta y la
  // pantalla abre vacía en vez de reventar.
  test("sobrevive a un payload corrupto en vez de lanzar", async () => {
    getItemAsync.mockResolvedValue("{ no es json");

    await expect(state().restore()).resolves.toBeUndefined();

    expect(state().recents).toEqual([]);
    expect(state().restored).toBe(true);
  });

  // Un array con basura dentro es tan probable como un JSON roto: viene de una versión anterior
  // del formato. Se quedan sólo las cadenas.
  test("descarta las entradas que no son texto", async () => {
    getItemAsync.mockResolvedValue(JSON.stringify(["leche", 42, null, "arroz"]));

    await state().restore();

    expect(state().recents).toEqual(["leche", "arroz"]);
  });

  test("lo último buscado va primero", async () => {
    await state().record("leche");
    await state().record("arroz");

    expect(state().recents).toEqual(["arroz", "leche"]);
  });

  // Buscar dos veces lo mismo no debe dejar dos filas iguales: la repetida SUBE al principio, que
  // es lo que el usuario espera de un historial.
  test("repetir una búsqueda la sube en vez de duplicarla", async () => {
    await state().record("leche");
    await state().record("arroz");
    await state().record("leche");

    expect(state().recents).toEqual(["leche", "arroz"]);
  });

  // «Leche» y «leche  » son la misma búsqueda. Sin normalizar, el historial se llena de variantes
  // de lo mismo y expulsa a las de verdad distintas.
  test("no distingue mayúsculas ni espacios sobrantes", async () => {
    await state().record("Leche");
    await state().record("  leche ");

    expect(state().recents).toEqual(["leche"]);
  });

  test("una búsqueda vacía no se guarda", async () => {
    await state().record("   ");

    expect(state().recents).toEqual([]);
    expect(setItemAsync).not.toHaveBeenCalled();
  });

  test("el historial tiene tope: lo más viejo se cae", async () => {
    for (let i = 0; i < MAX_RECENTS + 5; i += 1) await state().record(`busqueda ${i}`);

    expect(state().recents).toHaveLength(MAX_RECENTS);
    // La primera de todas ya no está; la última sigue arriba.
    expect(state().recents).not.toContain("busqueda 0");
    expect(state().recents[0]).toBe(`busqueda ${MAX_RECENTS + 4}`);
  });

  test("quitar una búsqueda la borra y persiste el resto", async () => {
    await state().record("leche");
    await state().record("arroz");
    vi.clearAllMocks();

    await state().remove("leche");

    expect(state().recents).toEqual(["arroz"]);
    expect(setItemAsync).toHaveBeenCalledWith(RECENTS_KEY, JSON.stringify(["arroz"]));
  });

  test("quitar algo que no está no rompe nada", async () => {
    await state().record("leche");

    await expect(state().remove("pan")).resolves.toBeUndefined();

    expect(state().recents).toEqual(["leche"]);
  });
});
