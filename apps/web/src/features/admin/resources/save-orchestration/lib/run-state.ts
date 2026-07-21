// Afordancias derivadas del estado que DECLARA el runner.
//
// La regla que ordena este archivo: **Dagster es dueño del ESTADO de una corrida; nosotros somos
// dueños de lo que la corrida PRODUJO.** Por eso acá no se infiere ni se adivina un estado — solo se
// traduce el que llegó a "¿qué puede hacer el operador con esto?".
//
// Los estados vienen del dominio (`RunState`): queued · running · canceling · succeeded · failed ·
// canceled · unknown. `null`/`undefined` = el flujo nunca corrió (que NO es lo mismo que el runner
// caído: eso lo declara el backend en `runner_available`).

/** En vuelo: el runner todavía nos debe un desenlace y el estado va a cambiar SOLO. */
const IN_FLIGHT = new Set(["queued", "running", "canceling"]);

/** Cancelable: subconjunto de lo anterior. `canceling` ya está en camino — ofrecerlo otra vez es un
 * botón que no hace nada. Espeja `RunState.is_cancellable` del dominio. */
const CANCELLABLE = new Set(["queued", "running"]);

export function isCancellable(state: string | null | undefined): boolean {
  return state != null && CANCELLABLE.has(state);
}

/**
 * ¿Conviene seguir refrescando? Solo si algo va a cambiar por su cuenta.
 *
 * `unknown` queda FUERA a propósito: no cambia solo, así que refrescar por él sería machacar el
 * runner para siempre. Mismo criterio para "nunca corrió".
 */
export function isInFlight(state: string | null | undefined): boolean {
  return state != null && IN_FLIGHT.has(state);
}

/** Estados desde los que REINTENTAR tiene sentido: los que terminaron mal.
 *
 * El adapter re-ejecuta con `FROM_FAILURE`, que necesita un fallo del cual partir. Ofrecerlo sobre
 * una corrida EXITOSA no es un matiz teórico: Dagster responde `PythonError` (HTTP 500) y la consola
 * lo traduce a "Orquestador no disponible", culpando al runner de una acción imposible que le
 * pedimos nosotros. Verificado contra el runner real (2026-07-20).
 *
 * Y tampoco haría falta: volver a correr una corrida exitosa es "Ejecutar ahora", que ya existe.
 * Dos ítems de menú para lo mismo es peor que uno bien acotado.
 */
const RETRIABLE = new Set(["failed", "canceled"]);

export function isRetriable(state: string | null | undefined): boolean {
  return state != null && RETRIABLE.has(state);
}
