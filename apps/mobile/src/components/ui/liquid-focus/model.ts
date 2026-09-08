/**
 * Modelo geométrico de la lente de Monogram, separado de React y Skia para poder verificarlo.
 *
 * La referencia muestra UN solo menisco: el mismo canto arqueado dobla el contenido, introduce el
 * esmerilado y deja crecer el velo hacia el pie. La implementación anterior movía una frontera de
 * refracción y otra de blanco hasta lugares distintos, de modo que la cúpula terminaba pareciendo
 * una niebla global. También añadió un muelle y un vaivén perpetuo que no aparecen medidos en el
 * clip. La respiración sí existe, pero cambia la FORMA del canto (altura, arco y asimetría), no
 * traslada la misma máscara arriba y abajo para siempre.
 */

/** Tiempos guiados por el clip y afinados en el simulador; no son constantes de un muelle. */
export const LENS_TIMING = {
  /** El control reacciona primero; el menisco empieza a subir un instante después. */
  leadMs: 32,
  /** Entrada larga con cola suave: responde pronto, pero la masa tarda en asentarse. */
  enterMs: 520,
  /** ⭐ Subido de 350: la retirada tiene que dejar SEGUIR el frente con la vista. A 350 la onda se
   *  percibía como un corte; el ojo necesita más recorrido para leerla como agua que se va. */
  withdrawMs: 620,
  /** La atenuación acompaña a la masa; no debe terminar mientras el menisco apenas empieza. */
  dimMs: 420,
  /** Onda radial que nace en el orbe al soltar y alcanza el techo. */
  /** ⭐ Subido de 480 por el mismo motivo: es el viaje de la onda radial desde el orbe hasta el
   *  techo, y es LO QUE MÁS SE MIRA de toda la salida. Correrlo la abarata. */
  releaseMs: 900,
  /** El morph del control cabe antes de que la cúpula quede establecida. */
  controlMs: 220,
} as const;

export function lensUniforms(
  width: number,
  height: number,
  progress: number,
  pulse: number,
  reducedMotion: boolean,
  /** Reloj lineal 0..1 de una respiración larga; la forma combina armónicos dentro del worklet. */
  breath = 0,
  /** Reloj 0..1 de la onda radial de liberación. */
  release = 0,
  /**
   * EL SELLADO DEL TELÓN, 0..1.
   *
   * Cierra el velo de borde a borde para tapar una navegación que ocurre por debajo. Es un trabajo
   * DISTINTO del velo de dictado —aquél acompaña, éste oculta— y por eso entra aparte en vez de
   * retocar los números del menisco.
   */
  seal = 0,
) {
  "worklet";
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("The lens requires a finite, positive viewport.");
  }

  const p = reducedMotion || !Number.isFinite(progress)
    ? 0
    : Math.max(0, Math.min(1, progress));
  const modulation = Number.isFinite(pulse) ? Math.max(0, Math.min(1, pulse)) : 0;
  const boundedCycle = Number.isFinite(breath) ? Math.max(0, Math.min(1, breath)) : 0;
  const cycle = boundedCycle === 1 ? 0 : boundedCycle;
  const angle = cycle * Math.PI * 2;
  // Dos armónicos enteros: la curva cambia durante el ciclo y vuelve sin costura al empezar.
  const primary = Math.sin(angle);
  const secondary = Math.sin(angle * 2 + 0.8);
  const tertiary = Math.sin(angle * 3 - 0.45);
  // La entrada no debe asomar como una línea horizontal. El arco revela primero el centro, cerca
  // del orbe, y abre los hombros después; al establecerse vuelve a la curvatura final ya aprobada.
  // El centro tiene que asomar desde el primer tramo aunque la masa completa siga subiendo lenta.
  // A 0.42 el smoothstep quedaba enteramente bajo el viewport durante demasiado tiempo.
  const revealClock = Math.min(1, p / 0.29);
  // Smoothstep: también anula la velocidad en ambos extremos. El multiplicador lineal anterior
  // abría el arco cuatro veces más rápido que el resto de la masa y daba un tirón visible.
  const domeReveal = revealClock * revealClock * (3 - 2 * revealClock);
  // Pulso que existe SÓLO durante la entrada: nace y termina en cero, con máxima masa a mitad del
  // recorrido. Da el pliegue profundo y asimétrico de la referencia sin cambiar la forma estable.
  const entrySine = Math.sin(p * Math.PI);
  // La onda al cuadrado nace y muere con pendiente cero; así el pliegue no «golpea» al aparecer.
  const entrySurge = entrySine * entrySine;
  const releaseProgress = reducedMotion || !Number.isFinite(release)
    ? 0
    : Math.max(0, Math.min(1, release));
  // La gota no sólo borra: primero hunde el menisco y luego lo deja recuperar. La envolvente vale
  // cero en ambos extremos, de modo que soltar no introduce un salto y completar la onda tampoco.
  const releaseEnvelope = Math.sin(releaseProgress * Math.PI);
  const releaseOscillation = Math.sin(releaseProgress * Math.PI * 2);
  const baseBow = width * (
    0.056 + 0.02 * secondary + 0.055 * (1 - p) + 0.055 * entrySurge
  ) * domeReveal;

  return {
    size: [width, height],
    strength: p,
    /**
     * En Cuadra hay un hueco grande entre las acciones y el dock. Detener el canto a 0.54H lo
     * dejaba flotando en ese vacío; a 0.43H atraviesa la fila inferior, como el menisco de la
     * referencia atraviesa la última tarjeta en vez de dibujarse debajo de ella.
     */
    boundary: height * (1.08 - 0.65 * p)
      + height * 0.018 * p * primary
      + height * 0.075 * releaseEnvelope,
    /** Al nacer el arco es más profundo: centro visible, extremos todavía fuera del viewport. */
    bow: baseBow * (1 - 0.55 * releaseEnvelope),
    /** Banda más concentrada: reemplaza píxeles alrededor del pliegue sin crear una reflexión. */
    feather: height * (0.05 + 0.008 * tertiary),
    /** El texto se pliega con claridad; ya no hay que esconder el defecto reduciendo el alfa. */
    displacement: width * (0.066 + 0.048 * entrySurge) * p
      * (1 + 0.22 * secondary) * (1 + 0.2 * modulation),
    /** El blur crece junto al mismo canto; el velo termina de disolver el pie. */
    blurRadius: width * (0.016 + 0.003 * primary) * p,
    /**
     * Densidad del MATERIAL, no otro reloj. `lensMix` ya introduce `p`; multiplicarlo también aquí
     * hacía que la opacidad entrara como p² y el comienzo pareciera una lámina transparente. Así el
     * blanco/oscuro nace linealmente y termina con un poco más de cuerpo sin volverse plano.
     */
    veil: 0.92,
    seal: Number.isFinite(seal) ? Math.max(0, Math.min(1, seal)) : 0,
    /** El blanco llega a pleno antes del borde físico inferior, como en el plano de referencia. */
    veilFull: height * 0.88,
    /** La respiración ladea y ondula el menisco; ambos se apagan al retirar la lente. */
    edgeTilt: p === 0
      ? 0
      : width * (
        0.024 * p * secondary
        + 0.024 * entrySurge
        + 0.018 * releaseEnvelope * releaseOscillation
      ),
    ripple: p === 0
      ? 0
      : width * (
        0.02 * p * tertiary
        + 0.018 * entrySurge
        + 0.065 * releaseEnvelope
      ),
    wavePhase: angle,
    release: releaseProgress,
    dropOrigin: [width * 0.5, height * 0.91],
    dropRadius: height * 1.08 * releaseProgress,
    dropWidth: height * 0.095,
  };
}
