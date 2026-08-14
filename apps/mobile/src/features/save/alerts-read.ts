import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

// Qué alertas del feed YA MIRÓ el usuario en pantalla. Alimenta el punto rojo de la campana del hub.
//
// ⚠️ NO confundir con el set de `lib/notifications/local-alerts.ts`. Aquél responde «¿ya te avisé
// por notificación del sistema?» y marca visto en el instante en que DISPARA el aviso — para cuando
// abres la app, todo está "visto" ahí. Éste responde «¿ya lo miraste?», y sólo se limpia cuando la
// pantalla de alertas se monta de verdad. Un punto rojo alimentado por el set equivocado no se
// encendería jamás; uno decorativo, encendido siempre, mentiría al revés. Las dos preguntas son
// distintas y por eso son dos registros.
const KEY = "cuadra.read_alert_notifs";

// Tope del registro. Sin él, el almacén seguro crece con cada alerta que pasa por el feed. Se
// descartan los MÁS VIEJOS: son justo los que ya salieron del feed y nunca vuelven a consultarse.
const MAX_READ = 200;

type AlertsReadState = {
  readIds: string[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markAllRead: (ids: string[]) => Promise<void>;
};

async function persist(ids: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(ids));
  } catch {
    // El punto rojo no vale una pantalla rota: si el almacén falla, se pierde la marca de leído y
    // el punto reaparece en el próximo arranque. Molesto, no grave.
  }
}

export const useAlertsReadStore = create<AlertsReadState>((set, get) => ({
  readIds: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      set({ readIds: raw ? (JSON.parse(raw) as string[]) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  markAllRead: async (ids) => {
    // ACUMULA en vez de reemplazar: el feed es una ventana móvil, así que reemplazar borraría la
    // marca de todo lo que hoy no aparece y lo haría "no leído" otra vez si vuelve.
    const merged = [...get().readIds];
    for (const id of ids) if (!merged.includes(id)) merged.push(id);
    const capped = merged.slice(-MAX_READ);
    set({ readIds: capped });
    await persist(capped);
  },
}));

/**
 * Cuántas alertas del feed vigente todavía no vio el usuario.
 *
 * Se cuenta contra el FEED, no contra el histórico de leídos: así una alerta que ya salió del feed
 * no puede dejar el punto encendido para siempre.
 */
export function unreadCount(feedIds: readonly string[], readIds: readonly string[]): number {
  const read = new Set(readIds);
  return feedIds.filter((id) => !read.has(id)).length;
}
