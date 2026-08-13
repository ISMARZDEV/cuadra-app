import { beforeEach, describe, expect, test, vi } from "vitest";

// `expo-secure-store` no está aliaseado en vitest.config (a diferencia de haptics/skia/svg): su
// módulo nativo simplemente no existe en jsdom, así que se mockea acá. Es el mismo almacén que ya
// usan auth e idioma — ver use-language-store.tsx, de donde sale el patrón de este store.
const { getItemAsync, setItemAsync } = vi.hoisted(() => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({ getItemAsync, setItemAsync }));

import { USAGE_KEY, useSuggestionUsageStore } from "./suggestion-usage-store";

const state = () => useSuggestionUsageStore.getState();

describe("suggestion usage store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Un store de zustand es un singleton de módulo: sin este reset el estado se filtra entre tests.
    useSuggestionUsageStore.setState({ usage: {}, restored: false });
  });

  test("restores the counters persisted by a previous run", async () => {
    getItemAsync.mockResolvedValue(JSON.stringify({ "chat.quickActions.savingTip": 4 }));

    await state().restore();

    expect(state().usage).toEqual({ "chat.quickActions.savingTip": 4 });
    expect(state().restored).toBe(true);
  });

  test("starts empty on a fresh install", async () => {
    getItemAsync.mockResolvedValue(null);

    await state().restore();

    expect(state().usage).toEqual({});
    expect(state().restored).toBe(true);
  });

  // Un JSON corrupto no puede tumbar el arranque del chat: el historial es una comodidad, no un
  // dato crítico. Se descarta y se sigue con el contador vacío.
  test("survives a corrupted payload instead of throwing", async () => {
    getItemAsync.mockResolvedValue("{ no es json");

    await expect(state().restore()).resolves.toBeUndefined();

    expect(state().usage).toEqual({});
    expect(state().restored).toBe(true);
  });

  test("counts a sent suggestion and persists it", async () => {
    await state().record("chat.quickActions.spentThisMonth");

    expect(state().usage).toEqual({ "chat.quickActions.spentThisMonth": 1 });
    expect(setItemAsync).toHaveBeenCalledWith(
      USAGE_KEY,
      JSON.stringify({ "chat.quickActions.spentThisMonth": 1 }),
    );
  });

  test("adds up repeat sends of the same suggestion", async () => {
    await state().record("chat.quickActions.shoppingList");
    await state().record("chat.quickActions.shoppingList");
    await state().record("chat.quickActions.biggestExpense");

    expect(state().usage).toEqual({
      "chat.quickActions.shoppingList": 2,
      "chat.quickActions.biggestExpense": 1,
    });
  });
});
