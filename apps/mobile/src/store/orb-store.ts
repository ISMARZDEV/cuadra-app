import { create } from "zustand";

// Shared "Siri orb" state. Gesture model (driven from the tab bar):
//   • swipe UP on the empty space where the orb appears → `show()` reveals it (bounces in) + the
//     phone buzzes ONCE. This is the ONLY haptic.
//   • press/hold the orb → `setPressing(true)` makes the orb wobble (scale + sway), `bump()` swells
//     the wave. The tab bar emits one platform-native contact haptic. Keeps wobbling while held.
//   • swipe DOWN on the orb → `hide()`.
//   • 8s with no orb interaction → auto-`hide()` (the idle timer is paused while pressing).
// The chat screen reads `active` to lift its input pill out of the way while the orb is showing.
const AUTO_HIDE_MS = 8000;
type OrbState = {
  active: boolean;
  pulse: number;
  pressing: boolean;
  /**
   * Pausa el auto-ocultado mientras el reconocedor o el telón siguen vivos después de soltar.
   */
  lensHold: boolean;
  show: () => void;
  hide: () => void;
  bump: () => void;
  setPressing: (value: boolean) => void;
  setLensHold: (value: boolean) => void;
};

export const useOrbStore = create<OrbState>((set, get) => {
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  // ¿Hay un dedo apoyado ahora mismo? Lo consultan `armIdle` y `bump`. Se declara ANTES que ellos.
  let holding = false;

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      // ⚠️⚠️ **LA GUARDA VA AQUÍ, en el disparo, y no sólo en quien arma el temporizador.**
      //
      // Antes bastaba con que alguien armara el ocioso en mal momento para que el orbe se cerrara
      // con el dedo encima. Comprobarlo sólo en `bump` deja el invariante repartido entre varios
      // sitios: cualquier camino nuevo que llame a `armIdle()` vuelve a romperlo, y el defecto
      // reaparece a los 8 segundos —tarde, intermitente y difícil de atribuir—.
      //
      // Preguntándolo en el disparo, el invariante es UNO y no depende de por dónde se llegó:
      // el auto-ocultado es para el ABANDONO, y un dedo apoyado es lo contrario de abandonar.
      if (holding) {
        armIdle(); // sigue habiendo dedo: se vuelve a contar desde cero al soltarlo
        return;
      }
      // ⚠️⚠️ **Y TAMPOCO en mitad del dictado, por el mismo motivo.**
      //
      // Al soltar sin decir nada el reconocedor no emite su `end`, y el ciclo espera hasta su tope
      // de 10 s. El ocioso son 8: en esa ventana `active` caía a false con la CÚPULA todavía
      // puesta, y como el control exige `active` pero el velo no, quedaba el fondo deformado y
      // ningún orbe encima. Se veía como «el orbe desaparece y vuelve».
      //
      // El invariante es el de siempre —el auto-ocultado es para el ABANDONO— y por eso vive aquí,
      // en el disparo: cualquier camino nuevo que arme el ocioso queda cubierto sin tocar nada.
      if (get().lensHold) {
        armIdle();
        return;
      }
      set({ active: false, pressing: false, lensHold: false });
    }, AUTO_HIDE_MS);
  };

  const clearIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  return {
    active: false, // hidden until the user swipes up where the orb appears
    pulse: 0,
    pressing: false,
    lensHold: false,
    show: () => {
      set({ active: true });
      armIdle();
    },
    hide: () => {
      clearIdle();
      holding = false;
      // ⚠️ `lensHold` se limpia AQUÍ también: si el ciclo del dictado se cortó por el camino, un
      // hold huérfano dejaría la barra sin orbe para siempre.
      set({ active: false, pressing: false, lensHold: false });
    },
    bump: () => {
      set((s) => ({ pulse: s.pulse + 1 }));
      // ⚠️⚠️ **NO se rearma el ocioso si hay un dedo encima, y aquí vivía un defecto real.**
      //
      // La barra llama `setPressing(true)` —que CANCELA el temporizador— e inmediatamente después
      // `bump()`, que lo volvía a armar. Resultado: el orbe se auto-ocultaba a los 8 s AUNQUE lo
      // estuvieras manteniendo pulsado, en mitad del gesto.
      //
      // El auto-ocultado es para el ABANDONO —el orbe quedó abierto y nadie lo usa—, y mantener el
      // dedo encima es lo contrario de abandonar. Se arregla aquí y no reordenando las llamadas en
      // la barra: el invariante es de este store, y con el orden como red se rompería en cuanto
      // alguien llamara a `bump` desde otro sitio.
      if (!holding) armIdle();
    },
    setPressing: (value) => {
      const wasHolding = holding;
      if (value) {
        holding = true;
        set({ pressing: true });
        clearIdle(); // don't auto-hide while held
        return;
      }

      holding = false;
      // `PanResponder` puede entregar release + terminate/cancel para el mismo contacto. Ese segundo
      // `false` NO es otra transición y no debe reiniciar ningún reloj.
      if (!wasHolding) return;

      set({ pressing: false });
      armIdle(); // restart the 8s countdown on release
    },
    setLensHold: (value) => {
      set({ lensHold: value });
      // Terminado el ciclo, el ocioso cuenta desde CERO: el usuario acaba de recuperar el control y
      // cerrárselo de golpe sería castigarle por haber dictado.
      if (!value && !holding && get().active) armIdle();
    },
  };
});
