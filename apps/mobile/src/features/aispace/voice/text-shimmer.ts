/**
 * EL BARRIDO DE BRILLO QUE RECORRE LO DICTADO — geometría pura, sin React ni Reanimated.
 *
 * ⭐⭐⭐ **Sustituye a la desintegración por caracteres, y el porqué importa.** Antes cada letra
 * SUBÍA media pantalla y se deshacía por su cuenta; con una frase de treinta caracteres eso son
 * treinta cosas viajando a alturas distintas, y lo que se leía no era «se envía» sino ruido —letras
 * sueltas desperdigadas por la pantalla—. El usuario lo vio y lo dijo: quitarla.
 *
 * Lo que queda dice lo mismo con un solo suceso: **la frase se queda quieta y un brillo la recorre**
 * mientras el orbe piensa. El texto no se mueve, así que se puede LEER; el brillo dice que algo está
 * trabajando. Y cuando termina, la frase se va entera —de una pieza— en lugar de descomponerse.
 *
 * ⚠️⚠️ **TODO ESTE MÓDULO SON WORKLETS.** Lo consume `useAnimatedStyle`, que corre en el HILO DE UI,
 * y desde allí sólo se puede llamar a otros worklets: sin la directiva revienta en el dispositivo con
 * «Tried to synchronously call a non-worklet function», mientras el typecheck sale limpio y los tests
 * en verde —en el arnés `"worklet"` es una cadena inerte—. Ver `cuadra-motion` §12a, y por eso los
 * llamados van SIEMPRE declarados antes que quien los llama.
 *
 * ⭐ **Un reloj compartido y una VENTANA por letra** (`cuadra-motion` §7). No son N animaciones: es
 * una resta por fotograma en el hilo de UI. Con un reloj por carácter, una frase larga montaría
 * decenas de animaciones y el barrido iría a tirones justo cuando más se mira.
 */

/**
 * ANCHO DE LA BANDA, en fracción de la frase.
 *
 * ⭐ Ancha a propósito. Una banda estrecha se lee como un punto que pasa —o peor, como un cursor—;
 * lo que dice «esto está trabajando» es un degradado suave que abarca varias letras a la vez, igual
 * que el shimmer del `PillButton` abarca la etiqueta entera.
 */
const BAND = 0.42;

/**
 * OPACIDAD DE REPOSO del texto mientras el brillo lo recorre.
 *
 * ⚠️ **El shimmer ATENÚA, no borra.** Bajar más apagaría la frase justo cuando el usuario querría
 * comprobar que se entendió bien lo que dictó, y confundiría dos sucesos distintos: el barrido (que
 * dice «trabajando») y el desvanecido final (que dice «enviado»).
 *
 * Sobre esta paleta equivale al color base que ya usaba la píldora: `#141A17` al 50 % sobre blanco
 * da ≈ `#7E837F`, prácticamente el `SHIMMER_BASE_LIGHT` (`#8A9490`) de antes. Por eso el brillo va
 * por OPACIDAD y no por color: un solo canal, sin `interpolateColor`, y el mismo resultado en los
 * dos temas —en oscuro el texto es claro sobre fondo oscuro, así que atenuar también lo apaga—.
 */
export const DIM = 0.5;

/**
 * DÓNDE ESTÁ EL FRENTE del barrido, en posición de frase (0 = primera letra · 1 = última).
 *
 * ⭐ Nace FUERA por la izquierda y muere FUERA por la derecha. Recorriendo sólo 0..1, la primera
 * letra aparecería ya encendida en el fotograma inicial y la última se quedaría iluminada al
 * terminar: el barrido parecería empezar y acabar a medias en vez de cruzar.
 */
export function shimmerHead(cycle: number): number {
  "worklet";
  return -BAND + cycle * (1 + 2 * BAND);
}

/**
 * BRILLO de la letra `index` de un texto de `total`, en 0..1, para un ciclo 0..1.
 *
 * ⭐ La caída es una CAMPANA de coseno y no una rampa: un canto duro se lee como un borrado que
 * avanza —o como una selección de texto—, no como luz. Lo que hace que parezca un reflejo es que no
 * haya ningún borde.
 */
export function shimmerGlow(cycle: number, index: number, total: number): number {
  "worklet";
  // Con una sola letra no hay recorrido que repartir: vive en el origen y el frente le pasa por
  // encima igual. Dividir por `total - 1` aquí sería dividir por cero.
  const at = total <= 1 ? 0 : index / (total - 1);
  const distance = Math.abs(at - shimmerHead(cycle)) / BAND;
  if (distance >= 1) return 0;
  return 0.5 * (1 + Math.cos(Math.PI * distance));
}

/** La opacidad que le toca a una letra según su brillo: del apagado legible al pleno. */
export function shimmerOpacity(glow: number): number {
  "worklet";
  const g = Math.max(0, Math.min(1, glow));
  return DIM + (1 - DIM) * g;
}
