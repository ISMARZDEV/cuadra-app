/**
 * MORPH DEL ÚNICO ORBE VISUAL hacia la píldora «Pensando…».
 *
 * El orbe grande se monta una sola vez en `OrbLiquidFocus`; la barra conserva únicamente su
 * hitbox. Por eso estas funciones ya no deciden entre dos copias: sólo garantizan que el orbe y la
 * píldora sean estados mutuamente excluyentes del mismo lugar.
 */
export interface OrbCycle {
  active: boolean;
  pressing: boolean;
  thinking: boolean;
  curtain: boolean;
}

/** Con el dedo apoyado siempre manda el orbe; sin texto nunca aparece una píldora vacía. */
export function pillReplacesOrb(cycle: OrbCycle, hasText: boolean): boolean {
  return cycle.active
    && hasText
    && (cycle.thinking || cycle.curtain)
    && !cycle.pressing;
}

/** Visibilidad de la única instancia visual del orbe. Es el complemento exacto de la píldora. */
export function orbVisualVisible(cycle: OrbCycle, hasText: boolean): boolean {
  return cycle.active && !pillReplacesOrb(cycle, hasText);
}
