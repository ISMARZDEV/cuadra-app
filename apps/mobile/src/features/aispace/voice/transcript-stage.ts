/**
 * EL CICLO DEL ORBE, en las cuatro señales que lo describen.
 *
 * Vivía en `orb-handoff`, que existía para arbitrar entre el orbe y la píldora «Pensando…». Al
 * desaparecer la píldora —ahora el propio orbe ES el «pensando»— aquel arbitraje se quedó sin nada
 * que arbitrar y el tipo se mudó a su único consumidor que queda.
 */
export interface OrbCycle {
  /** El orbe está a la vista. */
  active: boolean;
  /** Hay un dedo apoyado: se está dictando. */
  pressing: boolean;
  /** Soltado, esperando a que la sesión de voz cierre del todo. */
  thinking: boolean;
  /** El telón: lo dictado ya viaja y el agente trabaja. */
  curtain: boolean;
}

/**
 * QUÉ TEXTO SE PINTA SOBRE LA CÚPULA — y, sobre todo, CUÁNDO NO SE PINTA NINGUNO.
 *
 * ⭐⭐⭐ **El reposo es vacío POR CONSTRUCCIÓN, y ésa es toda la razón de que esto exista.** Antes la
 * única guarda era `orbActive`, así que el texto no se BORRABA al terminar un dictado: se ESCONDÍA
 * con el orbe. Al volver a revelarlo —un swipe cualquiera, minutos después— el residuo del
 * reconocedor reaparecía a plena vista, plantado sobre una pantalla en la que no estaba pasando
 * nada. El usuario lo reportó tal cual: «tras enviar un mensaje se queda con el último texto y lo
 * muestra cuando hago slide».
 *
 * Limpiar el residuo en su dueño (`use-voice-capture.clear`) arregla la CAUSA. Esto es la RED: aunque
 * mañana alguien conserve texto por otro camino, no existe ningún estado en reposo capaz de sacarlo
 * a pantalla. Es el mismo movimiento que se hizo con `orb-handoff` cuando el orbe se pintaba dos
 * veces: la regla vive en UN sitio, se enumera entera y se prueba exhaustivamente.
 *
 * ⚠️ Y de paso cierra un segundo defecto que todavía no se había visto: `hayTexto` se derivaba del
 * transcript crudo, así que en reposo era TRUE con el residuo puesto. En cuanto un ciclo nuevo
 * encendiera «pensando» antes de llegar la primera palabra, `pillReplacesOrb` habría sacado la
 * píldora con el texto VIEJO por debajo. Derivándolo de aquí, no puede pasar.
 *
 * @param live   Lo que el reconocedor tiene ahora mismo (tramos cerrados + parcial en curso).
 * @param spoken Lo que ya se dio por dicho y viaja en el telón (`voice-send-store.spoken`).
 */
export function transcriptOnStage(cycle: OrbCycle, live: string, spoken: string): string {
  // Sin orbe no hay escenario. Es la guarda que ya existía, y sigue siendo la primera.
  if (!cycle.active) return "";
  // En el telón manda lo ENVIADO: el reconocedor ya cerró y lo que le quede suelto es historia.
  if (cycle.curtain) return spoken.trim();
  // Con el dedo apoyado —o soltado y aún pensando— manda lo que llega en vivo. `thinking` no sobra:
  // es la ventana entre levantar el dedo y cerrar la sesión, y sin él el texto parpadearía ahí.
  if (cycle.pressing || cycle.thinking) return live.trim();
  // REPOSO. Aquí es donde vivía el defecto y aquí es donde no se pinta nada, nunca.
  return "";
}
