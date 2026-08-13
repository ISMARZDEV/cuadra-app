import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

// Cuántas veces envió el usuario cada sugerencia del dock. Ordena el carrusel: las más usadas van
// primero (`use-suggestions.ts`). Se persiste para que ese orden sobreviva a cerrar la app —
// aprender del usuario y olvidarlo en cada arranque no sería aprender nada.
//
// Mismo patrón hecho a mano que `features/settings/use-language-store.tsx`: zustand + SecureStore +
// bandera `restored`. En este repo NO hay AsyncStorage ni MMKV, y el middleware `persist` de
// zustand no se usa en ningún lado; no se agrega una dependencia para guardar un diccionario.
export const USAGE_KEY = "cuadra.suggestionUsage";

/** Clave i18n de la sugerencia → veces que se envió. */
type Usage = Record<string, number>;

interface SuggestionUsageState {
  usage: Usage;
  /** False hasta que `restore()` resuelve. El carrusel puede pintar antes: sin historial el orden
   *  es simplemente el aleatorio, y se reordena solo cuando el contador llega. */
  restored: boolean;
  /** Lee el historial persistido. Se llama una vez al arrancar la app. */
  restore: () => Promise<void>;
  /**
   * Suma uno a una sugerencia enviada.
   *
   * ⚠️ La clave es la CLAVE i18n (`chat.quickActions.savingTip`), NUNCA el texto renderizado.
   * Contar el texto partiría el historial en tres al cambiar de idioma: el mismo usuario tendría
   * dos historiales distintos de la misma sugerencia por haber pasado de español a inglés.
   */
  record: (key: string) => Promise<void>;
}

async function persist(usage: Usage): Promise<void> {
  await SecureStore.setItemAsync(USAGE_KEY, JSON.stringify(usage));
}

// Un payload corrupto NO puede tumbar el arranque del chat: esto es una comodidad, no un dato
// crítico. Se descarta y se sigue con el contador vacío.
function parse(raw: string | null): Usage {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Usage;
  } catch {
    return {};
  }
}

export const useSuggestionUsageStore = create<SuggestionUsageState>((set, get) => ({
  usage: {},
  restored: false,

  restore: async () => {
    const raw = await SecureStore.getItemAsync(USAGE_KEY);
    set({ usage: parse(raw), restored: true });
  },

  record: async (key) => {
    const usage = { ...get().usage, [key]: (get().usage[key] ?? 0) + 1 };
    set({ usage });
    await persist(usage);
  },
}));
