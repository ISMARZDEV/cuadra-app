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
  /**
   * Marca del último TOQUE en la pantalla. La barra se retira sola tras un rato quieta, y un toque
   * —no un arrastre— la trae de vuelta.
   *
   * Es un TIMESTAMP y no un booleano a propósito: la barra necesita enterarse de que hubo un toque
   * OTRA VEZ, y un booleano que ya está en `true` no notifica el segundo.
   */
  tappedAt: number;
  tap: () => void;
  /**
   * Una pantalla que la quiere fuera SIEMPRE, pase lo que pase (el detalle de producto, que tiene
   * su propio pie flotante y no puede enseñar dos barras a la vez).
   *
   * Es distinto de `hidden`: aquél es transitorio —el scroll y el reposo lo mueven— y éste es una
   * DECISIÓN de la pantalla. Sin separarlos, el primer toque dentro del detalle devolvía la barra
   * de tabs encima de su propio pie.
   */
  forceHidden: boolean;
  setForceHidden: (value: boolean) => void;
  /**
   * ¿Esta pantalla quiere que la barra se retire sola tras un rato quieta?
   *
   * ⭐ Es OPT-IN por pantalla, y no una propiedad de la barra. Un comportamiento de navegación no
   * puede decidirlo el componente que lo dibuja: aplicado a toda la app, la barra se esfumaba en
   * el chat, en Insights y en Ajustes, donde nadie lo pidió y donde no hay nada que ganar
   * escondiéndola. Lo enciende la pantalla que SÍ gana pantalla con ello — hoy, Save Supermarket.
   */
  idleHideEnabled: boolean;
  setIdleHideEnabled: (value: boolean) => void;
};

export const useNavHideStore = create<NavHideState>((set) => ({
  hidden: false,
  setHidden: (value) => set((s) => (s.hidden === value ? s : { hidden: value })),

  tappedAt: 0,
  tap: () => set({ tappedAt: Date.now() }),

  forceHidden: false,
  setForceHidden: (value) =>
    set((s) => (s.forceHidden === value ? s : { forceHidden: value })),

  idleHideEnabled: false,
  setIdleHideEnabled: (value) =>
    set((s) => (s.idleHideEnabled === value ? s : { idleHideEnabled: value })),
}));
