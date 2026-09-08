import { create } from "zustand";

/**
 * LA MÁQUINA DE ESTADOS DEL DICTADO, compartida entre el orbe y el chat.
 *
 * ⭐⭐ **La cúpula dejó de ser un efecto del gesto para ser el TELÓN de una transición.** Al soltar
 * no se retira: se queda tapando la pantalla mientras por debajo se navega al chat y el agente
 * responde. El usuario no ve el salto — ve su texto, el telón se levanta, y ahí está la respuesta.
 *
 * ⭐ **El dueño de la máquina no puede ser ninguna de las dos pantallas.** El gesto ocurre en la
 * barra de pestañas y el suceso que la cierra —la respuesta— ocurre en el chat. Un estado que
 * cruza dos pantallas vive en un store o no vive en ningún sitio coherente.
 *
 * ```
 * idle ──sueltas──▶ answering ──responde──▶ leaving ──▶ idle
 * ```
 */
export type VoicePhase = "idle" | "answering" | "leaving";

type VoiceSendState = {
  phase: VoicePhase;
  /** El texto dictado esperando a que el chat lo envíe. `null` una vez recogido. */
  pending: string | null;
  /** Lo dictado, que sigue EN PANTALLA sobre la cúpula mientras el agente responde. */
  spoken: string;

  /** El orbe deja aquí lo dictado al entrar en el telón. NO lo entrega todavía — ver `dispatch`. */
  queue: (text: string) => void;
  /**
   * Suelta el texto para que el chat lo envíe.
   *
   * ⭐⭐ **Separado de `queue` a propósito.** El envío tiene que ocurrir cuando la cúpula YA SE FUE:
   * si se entrega al entrar en el telón, el mensaje sube a su sitio detrás de la cúpula y al
   * levantarse el usuario encuentra todo hecho — nunca ve la animación de envío del chat, que es
   * justo lo que da continuidad entre dictar y conversar.
   */
  dispatch: () => void;
  /** La pantalla del chat lo recoge para enviarlo. Devuelve `null` si no había nada. */
  take: () => string | null;
  /** El agente terminó (o falló, o se agotó el tope): el telón se levanta. */
  finish: () => void;
  /** Terminada la salida, todo vuelve al reposo. */
  reset: () => void;
};

export const useVoiceSendStore = create<VoiceSendState>((set, get) => ({
  phase: "idle",
  pending: null,
  spoken: "",

  queue: (text) => {
    const clean = text.trim();
    if (!clean) return;
    // `pending` queda a null: el texto se guarda en `spoken` y se entrega en `dispatch`.
    set({ pending: null, spoken: clean, phase: "answering" });
  },

  dispatch: () => {
    const text = get().spoken.trim();
    if (text) set({ pending: text });
  },

  // ⚠️ Lee Y BORRA en el mismo paso: si sólo se leyera y se limpiara aparte, volver a la pestaña
  // del chat reenviaría el último dictado.
  take: () => {
    const text = get().pending;
    if (text !== null) set({ pending: null });
    return text;
  },

  // ⚠️ Sólo desde `answering`: llega de varios sitios —fin de respuesta, error, tope— y sin la
  // guarda el que llegue tarde reabriría algo ya cerrado.
  //
  // El «Pensando…» dura EXACTAMENTE lo que tarde la respuesta. Hubo aquí un mínimo visible de 5 s
  // —para que no parpadeara— y se retiró a petición del usuario: prefiere que el ritmo lo marque el
  // agente y no un número nuestro.
  finish: () => {
    if (get().phase !== "answering") return;
    set({ phase: "leaving" });
  },

  reset: () => set({ phase: "idle", pending: null, spoken: "" }),
}));
