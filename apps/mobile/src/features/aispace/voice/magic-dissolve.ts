/**
 * LA ONDA MÁGICA QUE DESHACE EL TEXTO — geometría pura, sin React ni Reanimated.
 *
 * ⭐⭐ **La onda sube, así que el texto se deshace POR EL FINAL.** Un texto se lee de arriba abajo y
 * de izquierda a derecha, así que sus últimos caracteres son los que están más ABAJO. Barriendo por
 * índice inverso, el frente recorre la frase de abajo arriba — que es lo que se pidió. Hacerlo por
 * orden natural daría una onda descendente, la lectura contraria.
 *
 * ⚠️⚠️ **TODO ESTE MÓDULO SON WORKLETS.** Lo consume `useAnimatedStyle`, que corre en el HILO DE
 * UI, y desde allí sólo se puede llamar a otros worklets: sin la directiva revienta en el
 * dispositivo con «Tried to synchronously call a non-worklet function», mientras el typecheck sale
 * limpio y los tests en verde —en el arnés `"worklet"` es una cadena inerte—.
 *
 * ⭐ **El desorden es DETERMINISTA**, nunca `Math.random()`. Con aleatorio de verdad cada render
 * repartiría retardos distintos y el mismo carácter se desharía en un momento diferente cada vez:
 * la magia se convierte en ruido. Con un desorden derivado del índice se ve caótico y es
 * reproducible — que es exactamente lo que un efecto necesita.
 */

/**
 * Cuánto del reloj ocupa el BARRIDO de la onda.
 *
 * ⭐ Subido de 0.55: con la onda ocupando poco más de la mitad del reloj, las letras se solapaban
 * tanto que el frente casi no se veía viajar. Con 0.68 el recorrido se lee.
 */
const SWEEP = 0.68;
/**
 * Lo que dura la desaparición de UNA letra dentro del reloj.
 *
 * ⭐ Bajado de 0.45: cada letra se pasaba el 45 % del reloj —más de 400 ms— desvaneciéndose, y esa
 * cola larguísima por carácter era la mitad de la sensación de lentitud. Acortarla hace la letra
 * ÁGIL sin tocar la duración total: lo que cambia es la nitidez del frente, no el tiempo.
 */
const SPAN = 0.32;
/** Amplitud del desorden, en fracción de reloj. Suficiente para romper la fila, no para deshacerla. */
const JITTER = 0.08;

/**
 * Un desorden reproducible a partir del índice. Los primos evitan que se alinee con la rejilla.
 *
 * ⚠️ Declarada ANTES de quien la usa: dentro de un worklet el hoisting de JS NO aplica —el plugin
 * captura lo referenciado al crearlo— y una llamada hacia abajo sale `undefined is not a function`
 * en el dispositivo, con los tests verdes. Ver `cuadra-motion` §12a.
 */
function jitter(index: number): number {
  "worklet";
  return (((index * 37 + 11) % 17) / 17) * JITTER;
}

/**
 * Cuándo empieza a deshacerse el carácter `index` de un texto de `total`, en 0..1.
 *
 * Se expresa en FRACCIÓN del reloj y no en milisegundos para que un texto largo y uno corto se
 * deshagan en el mismo tiempo total: lo que cambia es lo apretada que va la onda, no su duración.
 */
export function charDelay(index: number, total: number): number {
  "worklet";
  if (total <= 1) return 0;
  // Índice invertido: el final del texto —lo más abajo— se va primero.
  const fromEnd = (total - 1 - index) / (total - 1);
  return Math.min(1 - SPAN, fromEnd * SWEEP + jitter(index));
}

/**
 * Progreso de desaparición de un carácter, en 0..1, dado el reloj global.
 *
 * 0 = intacto · 1 = ido del todo.
 */
export function charProgress(clock: number, index: number, total: number): number {
  "worklet";
  const from = charDelay(index, total);
  return Math.max(0, Math.min(1, (clock - from) / SPAN));
}


/**
 * A partir de dónde empieza a apagarse una letra, en fracción de SU propio viaje.
 *
 * ⭐ Antes de esto la opacidad caía linealmente desde el primer instante: a media subida el texto
 * ya estaba al 50 % y dejaba de leerse justo cuando más viaja. Lo que se envía tiene que seguir
 * siendo LEGIBLE mientras cruza la pantalla, y apagarse al final del recorrido.
 */
const FADE_FROM = 0.55;

/**
 * Opacidad de una letra según lo avanzado que lleve su viaje.
 *
 * 1 hasta `FADE_FROM`, y de ahí a 0 en el tramo restante.
 */
export function charFade(charProgressValue: number): number {
  "worklet";
  const p = Math.max(0, Math.min(1, charProgressValue));
  if (p <= FADE_FROM) return 1;
  return 1 - (p - FADE_FROM) / (1 - FADE_FROM);
}
