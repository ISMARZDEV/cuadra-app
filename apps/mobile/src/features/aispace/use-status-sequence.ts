import { useEffect, useRef, useState } from "react";

import { ChatStatus } from "./enums";

// Cuánto dura cada paso en pantalla. Cerca del barrido del shimmer (1500ms) para que el cambio de
// palabra no compita con la luz que la recorre.
export const STEP_MS = 1400;

// Mientras corre una búsqueda el cliente CAMINA por estos pasos. El backend no puede reportar este
// detalle: sólo sabe «arrancó una tool» (un único frame `status`), no en qué punto va por dentro.
// Por eso la coreografía vive acá — es presentación, no señal.
//
// No arranca en `Thinking` a propósito: cuando llega `searching` el usuario YA vio «Pensando…»
// durante la fase previa a la tool, así que repetirlo sería un paso perdido.
const SEARCH_STEPS = [ChatStatus.Searching, ChatStatus.Validating, ChatStatus.Analyzing] as const;

// Sin búsqueda, «Pensando…» y «Razonando…» dicen lo MISMO — son la misma espera con dos palabras.
// Se alternan, arrancando por una al azar, para que dos turnos seguidos no se vean calcados.
const IDLE_STEPS = [ChatStatus.Thinking, ChatStatus.Reasoning] as const;

/**
 * Convierte el estado que anuncia el backend en la secuencia que ve el usuario.
 *
 * - `searching` → avanza Buscando… → Validando… → Analizando… y se QUEDA en el último. Volver al
 *   primero se leería como retroceder, y el trabajo no retrocede.
 * - cualquier otro → alterna Pensando… ↔ Razonando… indefinidamente, empezando por una al azar.
 *
 * `random` se inyecta para poder fijar el arranque en los tests; en producción es `Math.random`.
 */
export function useStatusSequence(
  status: ChatStatus,
  active: boolean,
  random: () => number = Math.random,
): ChatStatus {
  const isSearch = status === ChatStatus.Searching;
  const steps = isSearch ? SEARCH_STEPS : IDLE_STEPS;

  // El arranque aleatorio se decide UNA vez por tanda (no en cada render, o la palabra saltaría
  // sola entre frames).
  const [startIndex, setStartIndex] = useState(0);
  const [step, setStep] = useState(0);

  const randomRef = useRef(random);
  randomRef.current = random;

  useEffect(() => {
    setStep(0);
    setStartIndex(isSearch ? 0 : Math.floor(randomRef.current() * IDLE_STEPS.length));
  }, [isSearch, active]);

  useEffect(() => {
    if (!active) return;
    // La búsqueda se detiene en el último paso; la espera genérica sigue alternando, así que un
    // turno largo nunca se queda congelado en una sola palabra.
    if (isSearch && step >= SEARCH_STEPS.length - 1) return;
    const id = setTimeout(() => setStep((s) => s + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [active, isSearch, step]);

  return steps[(startIndex + step) % steps.length];
}
