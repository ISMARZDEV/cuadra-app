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
  /** Recogida redondeada al soltar sin voz ni texto, antes de que nazca la onda radial. */
  emptyRetreatMs: 700,
  /** El morph del control cabe antes de que la cúpula quede establecida. */
  controlMs: 220,
} as const;

/** Convierte la altura ya envuelta del dictado en un aporte estable de una a cuatro líneas. */
export function transcriptHeightInfluence(textHeight: number) {
  "worklet";
  if (!Number.isFinite(textHeight)) return 0;
  return Math.max(0, Math.min(1, (textHeight - 32) / 96));
}

export function lensUniforms(
  width: number,
  height: number,
  progress: number,
  pulse: number,
  reducedMotion: boolean,
  /** Segundos acumulados de un reloj continuo; nunca vuelve a cero mientras el gesto siga vivo. */
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
  /** Fuerza táctil real o aproximada por duración, 0..1. */
  touchPressure = 0,
  /** Altura visual del texto transcrito, normalizada a 0..1. */
  transcriptInfluence = 0,
  /** Reloj 0..1 de la recogida al soltar vacío. */
  emptyRetreat = 0,
  /** Voz o texto detectado en cualquier momento de este gesto, 0..1. */
  speechPresence = 0,
) {
  "worklet";
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("The lens requires a finite, positive viewport.");
  }

  const p = reducedMotion || !Number.isFinite(progress)
    ? 0
    : Math.max(0, Math.min(1, progress));
  const modulation = Number.isFinite(pulse) ? Math.max(0, Math.min(1, pulse)) : 0;
  const elapsed = Number.isFinite(breath) ? Math.max(0, breath) : 0;
  // Más vivo que el primer ajuste: la respiración completa se percibe en pocos segundos, pero la
  // combinación de frecuencias sigue sin tener un punto de reinicio compartido.
  const motionTime = elapsed * 1.55;
  // El volumen bajo también debe mover la membrana; sqrt expande el rango audible sin permitir que
  // una muestra ruidosa salga de 0..1.
  const voiceEnergy = Math.sqrt(modulation);
  const pressure = Number.isFinite(touchPressure)
    ? Math.max(0, Math.min(1, touchPressure))
    : 0;
  const transcriptLift = Number.isFinite(transcriptInfluence)
    ? Math.max(0, Math.min(1, transcriptInfluence))
    : 0;
  const retreat = Number.isFinite(emptyRetreat)
    ? Math.max(0, Math.min(1, emptyRetreat))
    : 0;
  const speechHold = Number.isFinite(speechPresence)
    ? Math.max(0, Math.min(1, speechPresence))
    : 0;
  const liveHold = Math.max(pressure, voiceEnergy, transcriptLift, speechHold);
  // La recogida sólo existe si el gesto quedó realmente vacío. Cualquier presión, voz o texto la
  // cancela de manera continua, sin cambiar a una segunda pose o a otro orbe.
  const gather = retreat * (1 - Math.min(1, liveHold * 1.4));
  // Osciladores deliberadamente no sincronizados y con deriva de fase. No existe un «final del
  // ciclo» donde todo se pare y vuelva a empezar: la combinación tarda minutos en aproximarse a
  // una pose anterior y, aun entonces, llega a ella con velocidad continua.
  const primary = Math.sin(motionTime * 0.83 + Math.sin(motionTime * 0.17) * 0.28);
  const secondary = Math.sin(
    motionTime * 0.47 + 0.8 + Math.sin(motionTime * 0.13 + 0.4) * 0.32
  );
  const tertiary = Math.sin(
    motionTime * 1.11 - 0.45 + Math.sin(motionTime * 0.19 - 0.8) * 0.24
  );
  // La altura estable también respira. Estas dos derivas nacen en cero para conservar exactamente
  // el encuadre de entrada ya aprobado, pero luego se separan del pulso principal con frecuencias
  // inconmensurables: la línea sube, baja y cambia de dirección sin repetir una secuencia corta.
  const slowRise = Math.sin(motionTime * 0.31 + Math.sin(motionTime * 0.071) * 0.55);
  const offBeatRise = Math.sin(motionTime * 0.59 + Math.sin(motionTime * 0.097) * 0.31);
  const verticalBreath = primary * 0.5 + slowRise * 0.33 + offBeatRise * 0.17;
  const interactionLift = Math.min(
    0.085,
    pressure * 0.035 + voiceEnergy * 0.03 + transcriptLift * 0.02,
  );
  // Contracción radial independiente de la altura: cambia simultáneamente ancho y profundidad del
  // arco. La mezcla evita el gesto mecánico de inflar/desinflar con una sola frecuencia.
  const domePulse = p * (
    secondary * 0.48
    + Math.sin(motionTime * 0.37 + Math.sin(motionTime * 0.083) * 0.47) * 0.34
    + tertiary * 0.18
    + pressure * 0.35
    + voiceEnergy * 0.45
    + transcriptLift * 0.22
  );
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
    0.075 + 0.026 * secondary + 0.03 * pressure + 0.035 * voiceEnergy
    + 0.02 * transcriptLift
    + 0.055 * (1 - p) + 0.055 * entrySurge
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
      + height * 0.034 * p * verticalBreath
      - height * interactionLift * p * (0.82 + 0.18 * tertiary)
      // En vacío la masa baja claramente hacia el orbe: el hombro empieza a caer primero y el
      // centro queda suspendido un instante, como una gota que se recoge antes de soltarse.
      + height * 0.31 * gather * p
      + height * 0.075 * releaseEnvelope,
    /**
     * Al recogerse bajan primero los hombros, no el centro: el arco gana profundidad y se cierra
     * como una burbuja. Reducir `bow` aquí era lo que lo convertía en una línea recta.
     */
    bow: baseBow * (1 + 1.75 * gather) * (1 - 0.55 * releaseEnvelope),
    /** Banda más concentrada: reemplaza píxeles alrededor del pliegue sin crear una reflexión. */
    feather: height * (0.05 + 0.008 * tertiary) * (1 - 0.18 * gather),
    /** El texto se pliega con claridad; ya no hay que esconder el defecto reduciendo el alfa. */
    displacement: width * (0.066 + 0.048 * entrySurge) * p
      * (1 + 0.22 * secondary)
      * (1 + 0.52 * voiceEnergy)
      * (1 + 0.35 * pressure + 0.18 * transcriptLift)
      * (1 - 0.25 * gather),
    /** El blur crece junto al mismo canto; el velo termina de disolver el pie. */
    blurRadius: width * (0.016 + 0.003 * primary + 0.002 * voiceEnergy) * p,
    /**
     * El plano superior también está dentro del material, pero a mucha menor intensidad que la
     * cúpula. Son factores relativos: el shader los combina con tres armónicos suaves y con la
     * máscara inversa del menisco, sin desplazar ninguna coordenada por encima del canto.
     */
    ambientBlur: 0.42 * p,
    ambientVeil: 0.07 * p,
    /** Ondulación vertical del plano alto, como fracción del desplazamiento fuerte de la cúpula. */
    ambientDisplacement: 0.12 * p,
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
        + 0.018 * voiceEnergy * secondary
        + 0.012 * pressure * secondary
        + 0.008 * transcriptLift * tertiary
        + 0.024 * entrySurge
        + 0.018 * releaseEnvelope * releaseOscillation
      ) * (1 - 0.65 * gather),
    ripple: p === 0
      ? 0
      : width * (
        0.02 * p * tertiary
        + 0.034 * voiceEnergy
        + 0.026 * pressure
        + 0.014 * transcriptLift
        + 0.018 * entrySurge
        + 0.065 * releaseEnvelope
      ) * (1 - 0.55 * gather),
    domePulse,
    gather,
    wavePhase: motionTime,
    release: releaseProgress,
    dropOrigin: [width * 0.5, height * 0.91],
    dropRadius: height * 1.08 * releaseProgress,
    dropWidth: height * 0.095,
  };
}
