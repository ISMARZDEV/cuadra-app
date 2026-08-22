/**
 * El PLEGADO de la galería del detalle: la tarjeta de la foto se retira hacia arriba **cruzando por
 * encima de la cabecera** mientras la ficha del producto sube a ocupar su sitio, el verde se
 * compacta y aparece el tirador.
 *
 * ⭐ **Todo cuelga del MISMO `scrollY`**, y por eso es reversible sin escribir la vuelta: no hay
 * animación de entrada y otra de salida que puedan discrepar, hay un número que sube y baja con el
 * dedo. Volver atrás es, literalmente, el mismo cálculo con otro valor. Y por lo mismo el dedo
 * puede pararse DONDE QUIERA: cada punto de scroll tiene su estado, no dos orillas entre las que
 * elegir.
 *
 * ⭐ Y es aritmética PURA, sin `interpolate` de Reanimated, por dos razones que van juntas: se puede
 * probar sin dispositivo —el arnés stubea `interpolate`, así que un test sobre él no probaría
 * nada— y se puede llamar desde un worklet declarándolo. Cada función lleva su `"worklet"` porque
 * quien las invoca corre en el HILO DE UI.
 *
 * ⭐⭐ **Los tramos se expresan en FRACCIONES del recorrido, no en puntos.** El recorrido se deriva
 * de la pantalla (`collapseDistance`), así que escribir «a los 200pt» ataría el plegado a un
 * teléfono concreto: generoso en un Pro Max, ahogado en un SE. En fracciones, la coreografía es la
 * misma en los dos y sólo cambia cuánto dedo cuesta.
 */

/** Rampa lineal acotada. El `clamp` es lo que impide que nada se pase de rosca fuera del rango. */
function ramp(value: number, from: number, to: number): number {
  "worklet";
  if (to <= from) return value >= to ? 1 : 0;
  const t = (value - from) / (to - from);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Cuánto BAJA la tarjeta de la foto desde la fila de botones, en reposo.
 *
 * Es el verde que asoma por encima de ella. Vive aquí y no en la pantalla porque es lo que abre el
 * recorrido: quien decide este número está decidiendo, sin saberlo, cuánto dura el plegado.
 */
export const PHOTO_GAP = 26;

/**
 * El dedo de verde que queda cuando la cabecera está compacta, por debajo del área segura.
 *
 * Sin ese resto la curva aterrizaría sobre el reloj del sistema. Tiene que coincidir con el
 * `collapsed` de `CurvedHeader`: es el canto contra el que la tarjeta termina de esconderse.
 */
export const HEADER_REST = 6;

/**
 * El aire EXTRA entre el canto del verde y el techo del contenido cuando el plegado termina.
 *
 * Va por encima del `pt-5` que ya lleva `ProductSummary`: con sólo ese padding el título quedaba
 * pegado a la curva, y una curva es un canto BLANDO — pide más aire que un borde recto para no
 * leerse como que el texto se le está metiendo debajo.
 *
 * Es EL número a mover si el título queda alto o bajo al imantar. Nada más hay que tocar: el
 * recorrido, la foto y el tirador se recolocan solos.
 */
export const TITLE_CLEARANCE = 16;

/** La geometría real de la pantalla de la que se deriva el recorrido. */
export interface CollapseGeometry {
  /** Alto de la fila de botones del header. */
  headerRow: number;
  /**
   * Cuánto CUELGA la panza de la curva por debajo de la caja del header.
   *
   * ⭐⭐ Va aquí y no se da por supuesto porque olvidarla costó una ronda entera: la panza vive
   * `position: absolute; bottom: -HEADER_BULGE`, así que el canto REAL del verde está ese tanto más
   * abajo de lo que dice la altura del header. Sin ella, el contenido sube de más y el título y el
   * precio terminan escondidos DETRÁS de la curva.
   */
  headerBulge: number;
  /**
   * El verde EXTRA que la pantalla le pide al header bajo la fila de botones.
   *
   * Entra en el cálculo porque es lo que separa el techo del scroll del canto de la tarjeta: cuanto
   * más verde haya ahí, menos hueco hay que reservarle a la foto dentro del flujo — y menos scroll
   * hace falta para plegarla.
   */
  belowRow: number;
  /**
   * Alto de la banda de PUNTOS, entre la tarjeta y el título. 0 si no hay carrusel.
   *
   * ⭐ Los puntos vivían dentro de la foto y se movieron al hueco: ahí dejaron de ser un adorno
   * flotante y pasaron a ocupar sitio en el flujo. Quien no los cuente le devuelve ese hueco al
   * título y lo sube por encima de donde debe quedarse.
   */
  dotsBand: number;
  /** El verde que asoma sobre la tarjeta en reposo — normalmente `PHOTO_GAP`. */
  photoGap: number;
  /** Alto de la tarjeta de la foto, que se deriva del ANCHO de la pantalla. */
  photoHeight: number;
}

/**
 * Cuánto scroll dura el plegado entero, en puntos. **Es también dónde aterriza el imán.**
 *
 * ⭐⭐ Termina cuando el canto inferior de la tarjeta llega al canto inferior de la cabecera
 * compacta, **PANZA INCLUIDA**. Y un solo número sirve para las dos cosas que hay que clavar,
 * porque el canto inferior de la tarjeta y el techo del contenido son **LA MISMA LÍNEA**: el hueco
 * que el flujo le reserva a la foto termina exactamente donde termina la foto. Así que al aterrizar,
 * la foto queda escondida detrás del verde Y el bloque del título se posa justo debajo de la curva,
 * con el aire que ya le pone su propio `pt-5`.
 *
 * ⚠️ **Restar la panza no es un detalle: es la diferencia entre que funcione y que no.** Sin ella
 * el recorrido se pasa 28pt, el imán los aplica de golpe al soltar, y el título y el precio
 * terminan ESCONDIDOS DETRÁS de la curva. Se entregó así una vez y el síntoma fue exactamente ése.
 *
 * El área segura NO entra: se cancela sola. El canto de la tarjeta vive en `safeTop + headerRow +
 * photoGap + photoHeight` y el del verde compacto en `safeTop + HEADER_REST + headerBulge`; al
 * restarlos, el `safeTop` desaparece. Por eso esta función no lo pide.
 *
 * El piso de 1 protege a las rampas: dividir por el recorrido está en el corazón de todas, y un 0
 * las volvería `NaN` — que en Reanimated no es un error, es una pantalla en blanco.
 */
export function collapseDistance(g: CollapseGeometry): number {
  "worklet";
  // El hueco que el flujo le reserva al BLOQUE de la galería —tarjeta MÁS puntos—, menos la panza y
  // menos el aire que el título quiere bajo la curva: eso es lo que el DEDO tiene que aportar. El
  // resto del viaje lo pone el header al encoger — ver `headerShrinkOf`.
  return Math.max(
    1,
    g.photoGap + g.photoHeight + g.dotsBand - g.belowRow - g.headerBulge - TITLE_CLEARANCE,
  );
}

/**
 * Cuánto SUBE el contenido de regalo, sin que el dedo lo pague: lo que el header encoge.
 *
 * ⭐⭐⭐ **El `ScrollView` es HERMANO del header, así que su techo baja con él.** Cuando el verde se
 * compacta, todo lo que hay dentro del scroll sube ese tanto ADEMÁS del scroll. Es el defecto más
 * caro de esta pantalla: calcular el plegado como si sólo lo moviera el dedo hace que el recorrido
 * se pase por exactamente este número, y el imán aplica el exceso de golpe al soltar — el título y
 * el precio terminan escondidos detrás de la curva.
 *
 * ⭐ **Cuánto VIAJA la tarjeta (`headerShrinkOf + collapseDistance`) y cuánto SCROLL hace falta
 * (`collapseDistance`) son dos números distintos.** Confundirlos es el defecto.
 *
 * Y por eso la tarjeta —que vive fuera del scroll— tiene que recibir las DOS causas: ver
 * `galleryLift`. Con una sola, ella y su propio hueco divergen.
 */
export function headerShrinkOf(g: CollapseGeometry): number {
  "worklet";
  return Math.max(0, g.headerRow + g.belowRow - HEADER_REST);
}

/** Un tramo del recorrido, en fracciones de `collapseDistance`. */
interface Window {
  from: number;
  to: number;
}

/**
 * Cuándo se desvanece la TARJETA.
 *
 * ⭐⭐ **La tarjeta NO se recorta contra ninguna línea.** Sale por el borde físico de la pantalla,
 * como cualquier cosa que se scrollea, conservando sus esquinas redondas hasta el final. Recortarla
 * contra un canto inventado la deja AMPUTADA —canto recto, esquinas cuadradas— y eso se ve
 * inmediatamente como un defecto. Se probó dos veces, en dos alturas distintas, y las dos se
 * rechazaron por lo mismo.
 *
 * ⭐ Aguanta ENTERA todo el tiempo que está dentro de la pantalla y sólo empieza a irse cuando su
 * canto superior ya ha salido por arriba: **primero el movimiento, después la desaparición**. Una
 * opacidad que cae desde el primer punto de scroll se lee como un elemento al que le bajan el
 * brillo; ésta se lee como una superficie que se va.
 *
 * ⭐ Y termina ANTES del final (`to < 1`): en el penúltimo fotograma de la referencia queda un
 * rastro tenue de la foto asomando por el notch, y en el último ya no hay nada. Si el desvanecido
 * acabara justo al final, ese rastro no habría llegado a verse desaparecer.
 */
export const PHOTO_FADE: Window = { from: 0.45, to: 0.92 };

/**
 * Cuándo se van las FLECHAS y los PUNTOS del carrusel.
 *
 * ⭐⭐ **Arranca en 0 y termina enseguida**, y esa prisa es deliberada: son CONTROLES, no contenido.
 * En cuanto el dedo dice «me voy hacia abajo» dejaron de tener sentido, y un control que sigue
 * puesto mientras la superficie que gobierna se está yendo invita a tocarlo justo cuando ya no va a
 * responder.
 *
 * ⭐ Por eso NO comparten el reloj de la tarjeta. La foto aguanta entera casi medio recorrido
 * —«primero el movimiento, después la desaparición»— y ellos tienen que haberse ido mucho antes; un
 * test sujeta que su tramo acabe antes de que el de la foto empiece siquiera.
 *
 * ⚠️ Corto, pero NO instantáneo. Un salto de 1 a 0 en un fotograma se lee como un fallo de render;
 * un tramo breve se lee como que se apartan.
 */
export const CONTROLS_FADE: Window = { from: 0, to: 0.08 };

/**
 * Cuándo se van los CONTROLES de la cabecera (volver · título · canasta).
 *
 * ⭐⭐ **Se van HACIA ARRIBA y fuera de la pantalla, no se quedan apagándose.** Es lo que muestra el
 * fotograma 3 de la referencia: el título y los dos botones aparecen CORTADOS por el borde superior,
 * con sólo su mitad inferior visible. Se llegó aquí después de tenerlos clavados apagándose despacio
 * y ver el resultado: la tarjeta subía ENTRE dos círculos verdes que seguían ahí, y eso se lee como
 * un elemento pegado encima de una cabecera que no se entera.
 *
 * ⚠️ **Contradice el brief escrito** («NO deben desplazarse junto con el contenido»), y la imagen
 * ganó — el usuario lo dirimió expresamente a favor de la imagen.
 *
 * ⭐ Terminan ANTES de que el canto superior de la tarjeta llegue al borde de la pantalla, y eso lo
 * sujeta un test: si coincidieran, se verían los dos amontonados arriba a medio irse.
 */
export const HEADER_CONTENT_FADE: Window = { from: 0.04, to: 0.22 };

/**
 * Cuándo encoge la CÁSCARA verde.
 *
 * Arranca después que la galería —si las dos salieran del mismo punto, todo se movería a la vez
 * desde el primer roce del dedo y se leería como una sacudida— y termina con el recorrido: el verde
 * es lo último que se acomoda.
 */
export const SHELL_COLLAPSE: Window = { from: 0.2, to: 1 };

/**
 * Cuándo asoma el TIRADOR de volver arriba.
 *
 * ⭐ Empieza donde acaba `PHOTO_FADE`, y esa dependencia es deliberada: no puede asomar mientras
 * quede tarjeta a la vista, porque sería ofrecer un atajo para volver arriba cuando todavía estás
 * arriba. Atado al desvanecido y no a un número suelto, alargar el plegado no lo descoloca.
 */
export const INDICATOR_REVEAL: Window = { from: PHOTO_FADE.to, to: 1 };

function windowProgress(scrollY: number, distance: number, w: Window): number {
  "worklet";
  return ramp(scrollY, distance * w.from, distance * w.to);
}

/** El plegado de la CÁSCARA de la cabecera, 0 → 1: cuánto encoge el verde. */
export function headerCollapse(scrollY: number, distance: number): number {
  "worklet";
  return windowProgress(scrollY, distance, SHELL_COLLAPSE);
}

/**
 * Cuánto sube la galería, en puntos. **Va PEGADA a su hueco, no rezagada.**
 *
 * ⭐⭐ Sin rezago a propósito, y llegar aquí costó varias rondas de la misma queja. Rezagarla daba
 * profundidad —un paralaje bonito— pero es **incompatible con «que la empujen»**: la tarjeta vive
 * fuera del scroll y su hueco reservado vive dentro, así que en cuanto van a velocidades distintas
 * DIVERGEN, y lo que diverge acaba solapando al nombre del producto. Afinar el rezago sólo mueve el
 * momento del solape; no lo evita.
 *
 * ⚠️ **`headerCollapse` tiene que estar declarado ANTES que esta función.** Un worklet que llama a
 * otro declarado más abajo revienta en el dispositivo con «undefined is not a function», y los
 * tests NO lo ven: en el arnés `"worklet"` es una cadena inerte y el hoisting de JS funciona. Ya
 * pasó una vez, en esta misma línea.
 */
export function galleryLift(scrollY: number, distance: number, headerShrink: number): number {
  "worklet";
  // ⭐⭐ LAS DOS CAUSAS. El dedo, y lo que el header encoge — que mueve el techo del scroll y con él
  // el hueco reservado a la foto. La tarjeta vive FUERA del scroll: si sólo recibiera el dedo, su
  // hueco subiría más rápido que ella y el nombre del producto acabaría leyéndose por debajo de la
  // foto. Con las dos, tarjeta y hueco son inseparables en todo el recorrido.
  const travelled =
    Math.max(0, scrollY) + headerShrink * headerCollapse(scrollY, distance);
  // Negar 0 da `-0`, que se propaga por las interpolaciones y hace que dos estados idénticos no
  // se comparen iguales. Cuesta una línea evitarlo y ahorra un «a veces sí y a veces no».
  return travelled === 0 ? 0 : -travelled;
}

/**
 * La opacidad de las FLECHAS y los PUNTOS, 1 → 0.
 *
 * Se multiplica con la de la tarjeta —viven dentro de su contenedor— así que sólo puede ADELANTAR
 * su desaparición, nunca retrasarla. Que es exactamente lo que hace falta.
 */
export function galleryControlsOpacity(scrollY: number, distance: number): number {
  "worklet";
  return 1 - windowProgress(scrollY, distance, CONTROLS_FADE);
}

/** La opacidad de la tarjeta, 1 → 0. Lineal: acompaña al desplazamiento, no compite con él. */
export function galleryOpacity(scrollY: number, distance: number): number {
  "worklet";
  return 1 - windowProgress(scrollY, distance, PHOTO_FADE);
}

/** Cuánto se han ido los controles de la cabecera, 0 → 1. 0 = enteros. */
export function headerContentFade(scrollY: number, distance: number): number {
  "worklet";
  return windowProgress(scrollY, distance, HEADER_CONTENT_FADE);
}

/** La aparición del tirador de volver arriba, 0 → 1. */
export function indicatorProgress(scrollY: number, distance: number): number {
  "worklet";
  return windowProgress(scrollY, distance, INDICATOR_REVEAL);
}

/**
 * Dónde se posa el tirador: SIGUIENDO el canto de la elipse mientras la cabecera se compacta.
 *
 * ⭐ Existe porque un `top` fijo no vale. La cabecera ENCOGE con el scroll, así que un número
 * calculado con su alto desplegado deja el tirador flotando a media pantalla, sobre el contenido —
 * que es justo donde apareció la primera vez. El tirador pertenece a la curva; si la curva se mueve,
 * él se mueve.
 */
export function indicatorTop(
  scrollY: number,
  distance: number,
  expandedBottom: number,
  collapsedBottom: number,
): number {
  "worklet";
  const t = headerCollapse(scrollY, distance);
  return expandedBottom + (collapsedBottom - expandedBottom) * t;
}

/**
 * Los puntos donde el scroll IMANTA, para `snapToOffsets` del `ScrollView`.
 *
 * ⭐⭐ **El imantado lo hace la PLATAFORMA, no nosotros.** La versión artesanal —escuchar
 * `onEndDrag`/`onMomentumEnd`, adivinar si había impulso y llamar a `scrollTo`— pelea contra el
 * motor de deceleración de iOS en vez de colaborar con él, y cada caso que se tapaba destapaba otro:
 *
 * 1. Con impulso, la inercia nativa y el `scrollTo` tiraban en sentidos opuestos: tirón seco a
 *    mitad del deslizamiento.
 * 2. `scrollTo` animado dispara su PROPIO `onMomentumEnd` → el imán se llamaba a sí mismo.
 * 3. Y no aterriza en el número exacto → el resto volvía a pedir imán: temblor sin fin.
 *
 * Es un problema conocido: `react-native-collapsible-tab-view` describe exactamente estos
 * «recursive triggering loops … competing scroll calls that battled each other» y su conclusión fue
 * la misma — sustituir el código propio por `snapToOffsets`.
 *
 * ⚠️ Y hay una razón más, específica de esta app: estamos en **Reanimated 4 + worklets sobre
 * Fabric**, donde `scrollTo` tiene issues abiertos de no funcionar (#8190) y de regresión de
 * rendimiento (#9000). **Si alguna vez hay que tocar el imán, NO se reimplementa a mano.**
 *
 * ⭐ El destino es el RECORRIDO DERIVADO, no un número escrito: es justo donde el plegado termina y
 * el bloque del título queda posado bajo la cabecera compacta. Por eso aterriza en el mismo sitio
 * en un SE y en un Pro Max, sin tocar un solo margen.
 */
export function snapOffsetsFor(distance: number): number[] {
  return [0, distance];
}
