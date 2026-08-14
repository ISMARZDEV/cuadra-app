import { create } from "zustand";

// Lo que hay ESCRITO en el input del chat, sin enviar todavía.
//
// Vive en un store y no en el estado de `chat-screen` por RENDIMIENTO, y la diferencia es grande:
// el borrador cambia en CADA TECLA, y la pantalla del chat son ~860 líneas con la lista de
// mensajes dentro. Con el `useState` en la pantalla, cada carácter la re-renderizaba entera y con
// ella TODAS las filas de la conversación — medido en device: JS a 45 fps escribiendo.
//
// El único que necesita el valor es `QuickActions` (la cascada de sugerencias). Con el store, sólo
// ÉL se suscribe: `ChatInputBar` escribe, `QuickActions` lee, y la pantalla no se entera.
//
// ⚠️ Quien lo lea debe hacerlo con un SELECTOR (`useChatDraftStore((s) => s.draft)`), nunca
// desestructurando el store entero — eso vuelve a suscribir al componente a cualquier cambio y
// deshace el arreglo.
type ChatDraftState = {
  draft: string;
  setDraft: (value: string) => void;
};

export const useChatDraftStore = create<ChatDraftState>((set) => ({
  draft: "",
  setDraft: (value) => set({ draft: value }),
}));
