/**
 * EL MODELO DE LA LENTE LÍQUIDA — geometría pura, sin React ni Skia.
 *
 * Portado TAL CUAL del patrón autónomo `monogram/hold-to-focus-liquid-lens` (ver
 * `.claude/skills/motion-patterns/`), que a su vez traduce la referencia de 60fps.design. No se
 * reajustan sus números aquí: son aproximaciones visuales PARAMETRIZADAS en proporciones del
 * viewport —no píxeles del teléfono del mock—, y tocarlas sin volver a mirar el vídeo sería
 * inventar precisión.
 *
 * ⚠️ Los tiempos son ESTIMACIONES de intervalos visibles, NO constantes de muelle medidas. El
 * patrón es explícito: sin un sobrepaso defendible, un `withTiming` es preferible a inventarse
 * `damping`/`stiffness`. Ver `cuadra-motion` §8.
 */
/** Translation estimates, not measured spring constants. */
export const LENS_TIMING = { enterMs: 250, withdrawMs: 350, dimMs: 180 } as const;

/**
 * LA COREOGRAFÍA — quién llega antes que quién.
 *
 * ⭐⭐ **El efecto tiene ORDEN DE CAUSAS, y sin él se lee como un interruptor.** Antes el velo, el
 * pliegue y el desenfoque salían todos del mismo `p` multiplicado, así que aparecían los tres a la
 * vez: el usuario lo describió exacto — «aparece porque sí». En un fenómeno físico el agua primero
 * EMPUJA, luego BLANQUEA y al final ESMERILA.
 *
 * Y al soltar la escalera se deshace sola por donde se hizo: al llevar el reloj de 1 a 0 las
 * ventanas se cruzan al revés, así que el desenfoque se va primero y el pliegue es lo último en
 * relajarse. No hay que escribir la vuelta (ver `cuadra-motion` §7).
 *
 * El desfase (~0.13 del reloj ≈ 68 ms sobre 520) sale del `stagger: "subtle"` que declara el shot
 * de referencia; su `stagger_delay: 0.04` es para filas de una lista, y entre capas de un material
 * se lee corto.
 */
const STEP = {
  /** El pliegue: es la CAUSA, arranca al instante. */
  push: [0.0, 0.5],
  /** El blanco viene detrás del empuje. */
  veil: [0.13, 0.92],
  /** El esmerilado es lo último: primero deforma, después difumina. */
  blur: [0.26, 1.0],
} as const;

/**
 * Una ventana del reloj compartido, en 0..1.
 *
 * ⚠️⚠️ **`"worklet"` NO ES OPCIONAL AQUÍ.** `lensUniforms` corre en el HILO DE UI, y desde un worklet
 * sólo se puede llamar a otros worklets: sin la directiva revienta en el dispositivo con
 * «Tried to synchronously call a non-worklet function `windowAt` on the UI thread» — con el
 * typecheck limpio y los tests en verde, porque en el arnés `"worklet"` es una cadena inerte.
 * Ver `cuadra-motion` §12. Y va declarada ANTES de quien la usa, por la misma regla.
 *
 * Recibe los extremos SUELTOS y no una tupla: el plugin de Babel captura lo que el worklet
 * referencia, y desestructurar un objeto capturado es una fuente de sorpresas que no compensa
 * ahorrar un argumento.
 */
function windowAt(clock: number, from: number, to: number): number {
  "worklet";
  return Math.max(0, Math.min(1, (clock - from) / (to - from)));
}

export function lensUniforms(
  width: number,
  height: number,
  progress: number,
  pulse: number,
  reducedMotion: boolean,
  /**
   * EL VAIVÉN de la cúpula, en −1..1 y con 0 en reposo.
   *
   * ⚠️ Va APARTE de `pulse` a propósito. `pulse` es del patrón, vive en 0..1 y su 0 significa «sin
   * modulación»; si el vaivén se derivara de él, el valor por defecto (0) equivaldría a «cúpula
   * hundida del todo» y cualquiera que no pasara pulso vería la geometría desplazada. Dos ideas
   * distintas, dos entradas distintas.
   */
  swing = 0,
  /**
   * EL RELOJ DE LA COREOGRAFÍA, aparte del progreso.
   *
   * ⚠️ **Tiene que ser LINEAL, y por eso no puede ser `progress`.** El progreso es un MUELLE —de ahí
   * el peso de la entrada— y un reloj con curva APLASTA el escalonado: los pasos del medio se
   * amontonan y los de los extremos se separan (`cuadra-motion` §7a, medido en la cascada del
   * detalle de producto). Son dos cosas distintas: dónde ESTÁ la cúpula, y en qué orden LLEGAN sus
   * capas. Dos relojes.
   */
  phase = 1,
) {
  "worklet";
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError('The lens requires a finite, positive viewport.');
  }
  const p = reducedMotion || !Number.isFinite(progress) ? 0 : Math.max(0, Math.min(1, progress));
  // ⭐⭐ LA GEOMETRÍA PUEDE PASARSE DE 1; LA INTENSIDAD NO.
  //
  // La subida es un muelle y su gracia está en el SOBREPASO: la cúpula llega arriba, se pasa un
  // pelo y se asienta —como una masa de agua con inercia—. Si se acotara todo a 1, ese sobrepaso no
  // existiría: el muelle terminaría en el mismo sitio que una curva y no se notaría ninguna
  // diferencia. Pero el velo y el desenfoque SÍ se acotan: un velo por encima de 1 no significa
  // nada y un desenfoque de más sólo cuesta fotogramas.
  const pGeo = reducedMotion || !Number.isFinite(progress)
    ? 0
    : Math.max(0, Math.min(1.15, progress));

  // Las tres capas, cada una en su ventana del reloj lineal.
  const clock = reducedMotion || !Number.isFinite(phase) ? 0 : Math.max(0, Math.min(1, phase));
  const kPush = windowAt(clock, STEP.push[0], STEP.push[1]);
  const kVeil = windowAt(clock, STEP.veil[0], STEP.veil[1]);
  const kBlur = windowAt(clock, STEP.blur[0], STEP.blur[1]);
  const modulation = Number.isFinite(pulse) ? Math.max(0, Math.min(1, pulse)) : 0;
  // El vaivén se acota y se apaga con el progreso: en reposo la cúpula no puede estar movida.
  const sway = (Number.isFinite(swing) ? Math.max(-1, Math.min(1, swing)) : 0) * p;

  return {
    size: [width, height],
    strength: p,
    /** El canto de la cúpula, con su VAIVÉN encima: sube y baja mientras se mantiene pulsado, y al
     *  moverse cambia dónde cae el pliegue. Ese movimiento es lo que se lee como líquido. */
    boundary: height * (1.08 - 0.49 * pGeo) + height * 0.055 * sway,
    bow: width * 0.04 * p,
    /** ⭐⭐ EL ANCHO DEL CANTO DE LA CÚPULA — el número que produce el «corte».
     *  Estaba en 0.075 (≈63 pt): a esa escala el paso de nítido a velado ocurre en un dedo de
     *  pantalla y el ojo lo lee como un BORDE. A 0.20 (≈170 pt) el contenido se hunde en la cúpula
     *  progresivamente y ya no hay canto que ver. */
    feather: height * 0.20,
    /** ⭐ EL PLIEGUE. Subido de 0.04 a 0.10: a 0.04 el contenido apenas se movía y el efecto se
     *  leía como un desenfoque con velo. Lo que hace «líquido» es ver la GEOMETRÍA doblarse. */
    displacement: width * 0.10 * p * kPush * (1 + 0.2 * modulation),
    // ⚠️ AJUSTADOS CONTRA LA PANTALLA REAL. Los del patrón eran `blurRadius: width * 0.018` y
    // `veil: 0.48`, y en Cuadra BORRABAN el contenido: gris lechoso plano, ilegible. Dos motivos,
    // los dos ausentes en la referencia:
    //
    //   · El patrón traduce una UI de fondo GRIS con texto oscuro; un velo claro ahí desatura. La
    //     pantalla de Cuadra ya es casi blanca, así que un velo blanco al 48 % la deja en blanco.
    //   · 7 pt de radio con kernel 7×7 sobre una pantalla a 3× es un desenfoque enorme. En el
    //     fotograma de referencia (`frames/w2/f012`) las tarjetas de debajo SE SIGUEN LEYENDO:
    //     el análisis de 60fps lo llama «frosted blur», no una destrucción.
    //
    // El patrón declara estos números «parameterized visual approximations», así que ajustarlos es
    // lo esperado — pero se dejan los originales escritos para que siga siendo trazable.
    blurRadius: width * 0.008 * p * kBlur,
    /** ⭐ La CÚPULA. En la referencia, bajo el canto el fondo es del color del tema —blanco puro en
     *  claro—, no una neblina tímida. Estuvo en 0.48 y se veía a gris sucio, pero la culpa NO era
     *  del velo: encima caía una capa negra al 18 % que lo aplanaba. Retirada aquélla, el velo puede
     *  volver a pesar lo que pesa en el original — y con la rampa lineal, este 0.96 es el blanco del
     *  FONDO de la pantalla, no el de toda la zona velada. */
    veil: 1.0 * p * kVeil,
    /** ⭐ Dónde EMPIEZA el velo, en píxeles desde arriba. Viaja del suelo (sin velo) a `0.10·alto`
     *  —casi el techo— al pulsar del todo. Desde ahí hasta el fondo el blanco crece LINEALMENTE:
     *  es lo que deja la cabecera legible y el pie completamente blanco, como en la referencia. */
    veilStart: height * (1.0 - 0.94 * pGeo) + height * 0.05 * sway,
    /** Dónde el velo llega a su MÁXIMO. No es el suelo de la pantalla: si el blanco pleno sólo se
     *  alcanzara en el último píxel, el pie nunca llegaría a verse blanco del todo. */
    veilFull: height * 0.78,
    /** Separación RGB en el canto. Lo justo para que se lea como vidrio y no como un defecto. */
    chroma: width * 0.006 * p * kPush,
  };
}
