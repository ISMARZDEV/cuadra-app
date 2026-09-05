/**
 * El COLOR de la cabecera del detalle de producto: una carta de cinco, distinta en cada llegada.
 *
 * La cabecera era verde fija. Ahora cambia al entrar a un producto, y eso convierte una pantalla
 * que se repetía en una que se siente nueva cada vez sin cambiar ni un dato.
 *
 * ⭐ **Cada carta es un PAR, no un color.** Dos tonos hermanos, uno luminoso y uno profundo. La
 * primera versión derivaba la tinta por luminancia —blanco o casi-negro, lo que contrastara más— y
 * funcionaba, pero producía un negro genérico puesto encima de cinco colores distintos. Con el par
 * elegido, el título y los glifos comparten familia con su fondo.
 *
 * ⭐⭐ **Y el par sirve para los DOS TEMAS sin duplicarse.** En claro el luminoso es el fondo y el
 * profundo la tinta; en oscuro se cambian los papeles y ya está. Diez hex cubren cinco cartas por
 * dos temas, y como el contraste es simétrico, comprobarlo una vez vale para ambos. No hay una
 * paleta clara y otra oscura que puedan desincronizarse: hay una, leída de dos maneras.
 *
 * ⭐ **Es un MAZO, no un dado.** Con azar puro dos productos seguidos comparten carta una de cada
 * cinco veces, y eso se lee como que la pantalla no cambió — justo lo contrario de lo que el color
 * viene a hacer. Se reparte de una baraja que se agota antes de rebarajarse, así que se ven las
 * cinco antes de que se repita ninguna. Ver `dealNext`.
 *
 * ⚠️ Lo que NO depende del tema es la BARAJA: qué carta toca se decide una vez por llegada, y el
 * tema sólo elige del derecho o del revés. Cambiar de claro a oscuro con la pantalla abierta
 * voltea la carta que ya salió; no reparte otra.
 */

/**
 * Una carta del mazo: DOS colores del mismo tono, uno luminoso y uno profundo.
 *
 * ⭐ La carta NO dice cuál es el fondo. Eso lo decide el TEMA: en claro manda el luminoso y la tinta
 * es el profundo; en oscuro se cambian los papeles. Por eso una carta son diez hex para las cinco y
 * no veinte — y por eso el contraste, que es simétrico, se comprueba UNA vez y vale para los dos
 * temas. Ver `resolveSkin`.
 */
export interface HeaderCard {
  /** El luminoso. Fondo en tema claro, tinta en tema oscuro. */
  light: string;
  /** El profundo. Tinta en tema claro, fondo en tema oscuro. */
  dark: string;
}

/** La carta ya resuelta para un tema: qué se pinta de fondo y con qué se escribe encima. */
export interface HeaderSkin {
  /** El fondo de la cabecera: el rectángulo y la panza. */
  bg: string;
  /** Su tinta: el título y el tirador. */
  ink: string;
  /**
   * Los dos colores del botón de vidrio, si esta piel los impone.
   *
   * `undefined` = que el botón use la receta de MARCA (el lima de siempre). Es lo que quiere la
   * cabecera verde de la home y la rejilla; sólo las cartas mandan colores propios.
   */
  button?: { tint: string; icon: string; solid?: boolean };
}

/**
 * La carta, puesta del derecho para el tema que toca.
 *
 * ⭐ El botón es SIEMPRE la pareja invertida —relleno de la tinta, glifo del fondo— en los dos
 * temas. Lo único que cambia con el tema es el MATERIAL: vidrio en claro, sólido en oscuro. Que la
 * regla de color sea una sola es lo que impide que los dos temas se separen con el tiempo.
 *
 * ⚠️ **Y el sólido en oscuro no es estética: es la única forma de que el aro se vea.** Medido en el
 * simulador sobre la carta azul (`#002E52`): con vidrio tintado, el disco salía en `#29506E` —
 * **1.63:1** contra su cabecera, cuando un control necesita 3.0. Dos causas a la vez:
 *
 * 1. El tinte NO pinta el disco: TIÑE un material translúcido cuya base sigue al tema. En oscuro
 *    esa base es oscura y se traga cualquier color claro — ni siquiera el blanco la levanta.
 * 2. Encima va el degradado de profundidad, que sobre un relleno claro se lee como un velo gris en
 *    vez de como volumen.
 *
 * En claro nada de eso pasa —la base del vidrio es clara y el color profundo contrasta solo— así
 * que ahí se conserva el material.
 */
export function resolveSkin(card: HeaderCard, isDark: boolean): HeaderSkin {
  const [bg, ink] = isDark ? [card.dark, card.light] : [card.light, card.dark];
  // El glifo es SIEMPRE el fondo de la cabecera: así el botón se lee como un hueco recortado en
  // ella, no como una pieza pegada encima con colores de otra parte.
  return { bg, ink, button: { tint: ink, icon: bg, solid: isDark } };
}

/**
 * Las cinco cartas.
 *
 * ⭐ Emparejadas por TONO, no por el orden en que llegaron. Cuatro caen a Δ≤13° y la quinta —teal
 * con lima, Δ99°— queda por eliminación, porque las otras cuatro claras tenían dueño más cercano.
 * Está anotada como lo que es: la excepción del mazo, no un descuido.
 */
export const HEADER_CARDS: readonly HeaderCard[] = [
  { light: "#C2E3FF", dark: "#002E52" }, // azul     Δ  1° · 10.40:1
  { light: "#D5FF99", dark: "#00383C" }, // lima     Δ 99° · 11.40:1  ← la excepción
  { light: "#FFE2C9", dark: "#481C00" }, // durazno  Δ  4° · 11.77:1
  { light: "#FAD6FF", dark: "#6E1D75" }, // lila     Δ  3° ·  7.70:1
  { light: "#FFD4E4", dark: "#760045" }, // rosa     Δ 13° ·  8.51:1
] as const;

/**
 * La cabecera VERDE de siempre, que es la que siguen usando la home y la rejilla.
 *
 * ⚠️ Es un `HeaderSkin` y NO una carta, a propósito: el verde de Supermarket es verde en los dos
 * temas. Modelarlo como par lo haría voltearse en oscuro —fondo blanco, letras verdes— que no es
 * lo que esa pantalla quiere. Una carta se voltea; una piel, no.
 *
 * Vive aquí y no en `curved-header.tsx` para que el verde y las cinco cartas se declaren en el mismo
 * sitio: son la misma decisión —de qué color es una cabecera de Supermarket— y separarlas es cómo
 * acabaría habiendo dos verdes que nadie eligió.
 */
export const HEADER_SKIN_GREEN: HeaderSkin = { bg: "#034842", ink: "#FFFFFF" };
// Sin `button` a propósito: sus aros se quedan con el lima de marca, que es lo que la home y la
// rejilla llevan desde siempre. Imponerles el par de la piel les cambiaría el color sin que nadie
// lo hubiera pedido.

/** Canal sRGB de 0-255 a lineal (WCAG 2.1). */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa (WCAG 2.1). Tolera el hex con o sin `#`, en cualquier caja. */
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/**
 * El contraste entre los dos colores de una carta.
 *
 * ⭐ Ya no se usa para ELEGIR la tinta —eso lo decide la carta— sino para COMPROBARLA. Es la única
 * forma de que una carta nueva no pueda entrar rota: el test recorre el mazo y exige el piso. Una
 * pareja mal elegida es un título ilegible, y eso no se nota mirando un hex en un fichero.
 */
export function contrastOf(pair: HeaderCard | HeaderSkin): number {
  const [x, y] = "bg" in pair ? [pair.bg, pair.ink] : [pair.light, pair.dark];
  const [a, b] = [luminance(x), luminance(y)];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** El piso que toda carta debe cumplir. AA para texto normal; el título va muy por encima. */
export const CONTRAST_FLOOR = 4.5;

/** Un índice válido pase lo que pase: `Math.random()` redondea raro en los extremos. */
function safeIndex(raw: number, length: number): number {
  if (!Number.isFinite(raw)) return 0;
  return Math.min(Math.max(Math.floor(raw), 0), length - 1);
}

/**
 * Reparte la siguiente carta y devuelve el mazo que queda.
 *
 * `remaining` vacío = ciclo agotado → se rebaraja con el mazo ENTERO. `previous` es la carta que se
 * está viendo ahora mismo.
 *
 * ⭐ **La anterior se excluye de la primera carta, no del mazo.** Sacarla del relleno entero la
 * dejaría fuera de todo el ciclo siguiente, y a la larga un color aparecería la mitad de veces que
 * los demás sin que nadie supiera por qué. Se le prohíbe salir AHORA; vuelve más adelante.
 */
export function dealNext(
  remaining: readonly HeaderCard[],
  previous: HeaderCard | null,
  pick: (n: number) => number = (n) => Math.random() * n,
): { card: HeaderCard; remaining: HeaderCard[] } {
  const deck = remaining.length > 0 ? [...remaining] : [...HEADER_CARDS];
  // Se comparan por su color LUMINOSO y no por identidad de objeto: el mazo se rehidrata desde
  // constantes y dos ciclos distintos no comparten referencias, así que `!==` dejaría pasar el
  // repetido. Se usa un color y no el par entero porque la carta es la misma en los dos temas.
  const same = (a: HeaderCard, b: HeaderCard | null) => b != null && a.light === b.light;
  // Con una sola carta se devuelve aunque repita: preferimos una cabecera repetida a una sin pintar,
  // que es lo que dejaría un `undefined`.
  const candidates = deck.length > 1 ? deck.filter((c) => !same(c, previous)) : deck;
  const pool = candidates.length > 0 ? candidates : deck;

  const card = pool[safeIndex(pick(pool.length), pool.length)];
  return { card, remaining: deck.filter((c) => c.light !== card.light) };
}
