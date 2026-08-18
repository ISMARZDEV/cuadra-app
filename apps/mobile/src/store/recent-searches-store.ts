import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

// Lo que el usuario buscó antes en Save. Es lo PRIMERO que enseña el buscador al abrirse, antes de
// que se escriba nada — porque en un súper la mayoría de las búsquedas se repiten: la lista de la
// compra de esta semana se parece muchísimo a la de la anterior.
//
// Mismo patrón hecho a mano que `suggestion-usage-store.ts` y `use-language-store.tsx`: zustand +
// SecureStore + bandera `restored`. En este repo NO hay AsyncStorage ni MMKV, y el middleware
// `persist` de zustand no se usa en ningún lado; no se agrega una dependencia para guardar una
// lista de cadenas.
export const RECENTS_KEY = "cuadra.save.recentSearches";

/**
 * Cuántas búsquedas se recuerdan.
 *
 * No es un límite técnico —caben miles— sino de UTILIDAD: pasada la primera pantalla, una entrada
 * del historial ya no se encuentra antes que reescribirla. Guardar más sería pagar arranque y
 * memoria por filas que nadie va a llegar a ver.
 */
export const MAX_RECENTS = 12;

interface RecentSearchesState {
  /** De la más reciente a la más vieja. */
  recents: string[];
  /** False hasta que `restore()` resuelve. La pantalla puede pintar antes: sin historial enseña su
   *  esqueleto, y las filas aparecen cuando llegan. */
  restored: boolean;
  restore: () => Promise<void>;
  /** Guarda una búsqueda enviada. Si ya estaba, SUBE en vez de duplicarse. */
  record: (query: string) => Promise<void>;
  /** Quita una del historial — la «x» de cada fila. */
  remove: (query: string) => Promise<void>;
}

/**
 * La forma en que se guarda y se compara una búsqueda.
 *
 * En minúsculas y sin espacios sobrantes porque «Leche», «leche» y «leche  » son LA MISMA búsqueda:
 * sin normalizar, el historial se llena de variantes de lo mismo y expulsa a las que sí son
 * distintas. Se normaliza al GUARDAR, no sólo al comparar, para que la fila se lea igual siempre.
 */
const normalize = (query: string) => query.trim().replace(/\s+/g, " ").toLowerCase();

async function persist(recents: string[]): Promise<void> {
  await SecureStore.setItemAsync(RECENTS_KEY, JSON.stringify(recents));
}

// Un payload corrupto NO puede tumbar el buscador: esto es una comodidad, no un dato crítico. Se
// descarta y se sigue con el historial vacío. Se filtran además las entradas que no son texto —
// vienen de formatos anteriores, y una de ellas en la lista reventaría al renderizar la fila.
function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export const useRecentSearchesStore = create<RecentSearchesState>((set, get) => ({
  recents: [],
  restored: false,

  restore: async () => {
    // UNA SOLA VEZ, y no es una optimización: es una CARRERA que se cierra. El buscador llama a
    // `restore()` cada vez que se abre, y `record()` persiste de forma asíncrona (pone el estado
    // ya, escribe el archivo después). Reabriendo justo después de buscar, la lectura podía
    // adelantar a esa escritura y devolver la lista SIN la búsqueda recién hecha — o sea, borrarla
    // de la pantalla. Se vio: al sembrar cuatro búsquedas, una desaparecía.
    // Después del primer arranque la memoria ya es la verdad; el disco sólo la respalda.
    if (get().restored) return;
    const raw = await SecureStore.getItemAsync(RECENTS_KEY);
    set({ recents: parse(raw), restored: true });
  },

  record: async (query) => {
    const needle = normalize(query);
    // Enviar el campo vacío es un gesto legítimo (abre el catálogo entero), pero no es una
    // búsqueda: guardarlo dejaría una fila en blanco imposible de repetir ni de entender.
    if (!needle) return;
    const recents = [needle, ...get().recents.filter((r) => r !== needle)].slice(0, MAX_RECENTS);
    set({ recents });
    await persist(recents);
  },

  remove: async (query) => {
    const needle = normalize(query);
    const recents = get().recents.filter((r) => r !== needle);
    set({ recents });
    await persist(recents);
  },
}));
