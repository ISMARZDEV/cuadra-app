import { create } from "zustand";

// ¿Alguna pantalla está pidiendo que la barra de tabs se aparte?
//
// Tercer disparador del MISMO gesto de ocultar, junto al drawer del chat (`drawer-store`) y al chat
// expandido (`chat-expand-store`). La barra los combina con `Math.max`, así que ninguno pisa a otro.
//
// Es un BOOLEANO y no un valor animado, igual que `chat-expand-store`: cada consumidor anima lo
// suyo. Un `makeMutable` de módulo compartido revienta reanimated v4 al animarlo desde JS — está
// documentado en `drawer-store`, y por eso aquél necesita un provider. Aquí no hace falta.
//
// ⚠️ Quien lo encienda DEBE apagarlo al desmontarse. Una pantalla que se va dejando la barra
// escondida se la esconde también a la siguiente, que no tiene forma de saber por qué.
type NavHideState = {
  hidden: boolean;
  setHidden: (value: boolean) => void;
};

export const useNavHideStore = create<NavHideState>((set) => ({
  hidden: false,
  setHidden: (value) => set((s) => (s.hidden === value ? s : { hidden: value })),
}));
