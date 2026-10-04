import { create } from "zustand";

// Shared "Siri orb" state. Gesture model (driven from the tab bar):
//   • swipe UP on the empty space where the orb appears → `show()` reveals it (bounces in) + the
//     phone buzzes ONCE. This is the ONLY haptic.
//   • press/hold the orb → `setPressing(true)` makes the orb wobble (scale + sway), `bump()` swells
//     the wave. The tab bar emits one platform-native contact haptic. Keeps wobbling while held.
//   • swipe DOWN on the orb → `hide()`.
//   • sin tocar el orbe durante `AUTO_HIDE_MS` → auto-`hide()` (el ocioso se pausa mientras se pulsa).
// The chat screen reads `active` to lift its input pill out of the way while the orb is showing.

/**
 * CUÁNTO AGUANTA EL ORBE A LA VISTA sin que nadie lo toque.
 *
 * ⭐⭐ **8 s → 16 → 24 → 16, y el rodeo enseñó dónde estaba el problema de verdad.** Las dos
 * primeras subidas venían de «se cierra rápido», pero lo que se cerraba rápido NO era esto: era un
 * `hideOrb()` que `orb-liquid-focus` disparaba 620 ms después de navegar al chat. Retirado aquél, 24
 * pasó a sentirse largo y el plazo volvió a 16 — que es donde el usuario lo había pedido desde el
 * principio.
 *
 * ⚠️ **La lección no es el número: es que subir un plazo fue durante dos rondas la respuesta
 * equivocada a un síntoma real.** Cuando algo «se cierra pronto», mirar primero QUIÉN lo cierra.
 *
 * El plazo en sí sigue teniendo su razón: el gesto que revela el orbe no es el final del camino,
 * es el principio — aparece y entonces hay que DECIDIR si dictar, leer o volver a lo de antes. Ocho
 * segundos bastan para un control que CONFIRMA algo; no para uno que INVITA a algo.
 *
 * ⚠️ **SE EXPORTA, y no es cosmético.** Sus tests medían el plazo con números escritos a mano —7 s y
 * 9 s alrededor de los 8 originales—, así que subirlo los rompía a los dos: uno esperaba que a los
 * 9 s ya estuviera cerrado. Un plazo que dos archivos deben acordar vive en UNO y el otro lo importa
 * (`cuadra-motion` §5); así el test afirma la RELACIÓN —antes del plazo sigue, pasado se va— y deja
 * de tener opinión sobre el número.
 *
 * ⚠️ Tiene que seguir siendo MENOR que `LOST_GESTURE_MS` (30 s), o el tope del gesto perdido
 * cerraría el orbe antes que el ocioso y este plazo dejaría de significar nada.
 */
export const AUTO_HIDE_MS = 16_000;
/**
 * TOPE DE UN GESTO. Pasado esto, un dedo «apoyado» ya no es un gesto: es un gesto PERDIDO.
 *
 * ⚠️⚠️ Existe porque `PanResponder` entrega el *grant* y puede no entregar NUNCA el *release* —si la
 * vista se desmonta a mitad del gesto, por ejemplo—. `holding` se quedaba en true, el auto-ocultado
 * quedaba inhibido para siempre y `pressing` mantenía el velo encendido: la app entera atascada con
 * la cúpula puesta y sin ninguna forma de salir, ni recargando.
 *
 * La guarda de `holding` es correcta y se queda; lo que faltaba era el tope. Treinta segundos no
 * estorban a ningún gesto real y rescatan el único caso en que el sistema nos miente.
 */
const LOST_GESTURE_MS = 30_000;
type OrbState = {
  active: boolean;
  pulse: number;
  pressing: boolean;
  /**
   * PAUSA EL AUTO-OCULTADO mientras el reconocedor o el telón siguen vivos después de soltar.
   *
   * ⚠️ Lo consulta `armIdle` EN EL DISPARO, igual que `holding`. Durante un tiempo sólo se guardaba
   * y no lo miraba nadie, así que la pausa que promete esta línea no existía.
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
  let lostTimer: ReturnType<typeof setTimeout> | null = null;
  // ¿Hay un dedo apoyado ahora mismo? Lo consultan `armIdle` y `bump`. Se declara ANTES que ellos.
  let holding = false;

  const clearLost = () => {
    if (lostTimer) clearTimeout(lostTimer);
    lostTimer = null;
  };

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      idleTimer = null;
      // ⚠️⚠️ **LA GUARDA VA AQUÍ, en el disparo, y no sólo en quien arma el temporizador.**
      //
      // Antes bastaba con que alguien armara el ocioso en mal momento para que el orbe se cerrara
      // con el dedo encima. Comprobarlo sólo en `bump` deja el invariante repartido entre varios
      // sitios: cualquier camino nuevo que llame a `armIdle()` vuelve a romperlo, y el defecto
      // reaparece al cumplirse el plazo —tarde, intermitente y difícil de atribuir—.
      //
      // Preguntándolo en el disparo, el invariante es UNO y no depende de por dónde se llegó:
      // el auto-ocultado es para el ABANDONO, y un dedo apoyado es lo contrario de abandonar.
      //
      // ⚠️⚠️ **Y `lensHold` ES EL MISMO INVARIANTE POR OTRA PUERTA — faltaba, y era un defecto.**
      // Este campo se documentaba como «pausa el auto-ocultado mientras el reconocedor o el telón
      // siguen vivos», pero NADIE lo consultaba: se guardaba y ya. Con el plazo en 8 s no se notaba
      // porque el ciclo del dictado dura ~3,5 s y nunca llegaba a chocar; el día que una sesión de
      // voz se alargara —el reconocedor tarda, el agente tarda—, el orbe se habría cerrado EN MITAD
      // del dictado, con la cúpula puesta y el usuario hablando.
      //
      // Es exactamente la lección de arriba aplicada dos veces: dictar tampoco es abandonar.
      if (holding || get().lensHold) {
        armIdle(); // el ciclo sigue vivo: se vuelve a contar desde cero cuando termine
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
      clearLost();
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
      // `bump()`, que lo volvía a armar. Resultado: el orbe se auto-ocultaba al cumplirse el plazo
      // AUNQUE lo estuvieras manteniendo pulsado, en mitad del gesto.
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
        // ⚠️⚠️ **LA RED DEL GESTO PERDIDO.**
        //
        // `PanResponder` entrega el *grant* y puede no entregar NUNCA el *release* —si la vista se
        // desmonta a mitad del gesto, por ejemplo—. Sin esto, `holding` se quedaba en true, el
        // auto-ocultado quedaba inhibido PARA SIEMPRE y `pressing` mantenía el velo encendido: la
        // app atascada con la cúpula puesta y sin salida, ni recargando.
        //
        // La guarda de `holding` es correcta y se queda; lo que faltaba era el TOPE.
        clearLost();
        lostTimer = setTimeout(() => {
          lostTimer = null;
          holding = false;
          clearIdle();
          set({ active: false, pressing: false, lensHold: false });
        }, LOST_GESTURE_MS);
        return;
      }

      clearLost();
      holding = false;
      // `PanResponder` puede entregar release + terminate/cancel para el mismo contacto. Ese segundo
      // `false` NO es otra transición y no debe reiniciar ningún reloj.
      if (!wasHolding) return;

      set({ pressing: false });
      armIdle(); // al soltar, la cuenta de `AUTO_HIDE_MS` empieza de CERO
    },
    setLensHold: (value) => {
      set({ lensHold: value });
      // Terminado el ciclo, el ocioso cuenta desde CERO: el usuario acaba de recuperar el control y
      // cerrárselo de golpe sería castigarle por haber dictado.
      if (!value && !holding && get().active) armIdle();
    },
  };
});
