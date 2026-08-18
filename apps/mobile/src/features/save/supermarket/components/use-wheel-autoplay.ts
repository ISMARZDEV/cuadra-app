import { useEffect, useRef } from "react";

import { wheelAutoplayPlan } from "./wheel-autoplay-plan";

// LA RULETA GIRA SOLA al entrar en la pantalla: pasa las categorías DE UNA EN UNA, de izquierda a
// derecha, lo que dura UN PANTALLAZO — como si alguien la estuviera deslizando despacio.
//
// ⚠️ PARA QUÉ SIRVE ESTO, porque no es decoración: un carrusel que no se mueve NO SE LEE COMO
// DESLIZABLE. Las categorías están sobre un arco, sin flechas ni puntos de página, así que nada
// dice que haya más a los lados. Verla pasar de una en una lo enseña sin explicarlo, que es la
// misma razón por la que una lista rebota al llegar al tope.
//
// ⚠️ Y TIENE QUE VERSE EL CAMINO, no sólo el destino: un salto rápido hasta el final cumple la letra
// y no dice nada, porque lo que enseña que la rueda se desliza es el RECORRIDO. Ver el plan.
//
// ⚠️ Y LA REGLA QUE LO HACE ACEPTABLE: EN CUANTO EL DEDO TOCA, ESTO SE APAGA PARA SIEMPRE. Un
// carrusel que sigue moviéndose solo mientras lo manejas es de las cosas más molestas que hay en
// una interfaz: peleas contra él y pierdes. El movimiento automático es una PRESENTACIÓN, no un
// comportamiento; en cuanto hay intención del usuario, manda el usuario.

// (El RECORRIDO —adónde va y cuándo— vive en `wheel-autoplay-plan`. Acá sólo se ejecuta: qué es un
// buen barrido es una regla del producto, y separada se puede probar sin montar una pantalla.)

interface WheelAutoplayOptions {
  /**
   * Llevar la rueda a este desplazamiento, en puntos.
   *
   * ⚠️ ES UN CALLBACK Y NO UNA REFERENCIA A LA LISTA, y el cambio tiene motivo: este hook sabe
   * CUÁNDO hay que moverse, no CÓMO. El cómo —animado a mano para poder gobernar la velocidad, ver
   * `WHEEL_GLIDE_MS`— es del componente, que es quien tiene el valor compartido y el hilo de UI.
   * Con la referencia aquí dentro, la única forma de moverse era `scrollTo` nativo y su duración
   * fija.
   */
  glideTo: (x: number) => void;
  /** Ancho de una ranura, en puntos. */
  step: number;
  /** Desde qué ranura arranca. */
  from: number;
  /** Hasta dónde puede girar la rueda. */
  limit: number;
  /** False mientras no haya datos o la pantalla no esté lista: sin esto empezaría a girar en vacío. */
  enabled: boolean;
  /** «Reducir movimiento» no es «más despacio»: es NO moverse. */
  reduceMotion: boolean;
}

/**
 * Devuelve `stop`, que hay que llamar en cuanto el usuario toque la rueda.
 *
 * Se devuelve una función en vez de aceptar una bandera porque el corte tiene que ser INMEDIATO:
 * pasando estado, el paso en vuelo todavía saldría y el usuario sentiría un tirón contra su dedo.
 */
export function useWheelAutoplay({
  glideTo,
  step,
  from,
  limit,
  enabled,
  reduceMotion,
}: WheelAutoplayOptions): () => void {
  // `useRef` y no estado: pararlo NO tiene que redibujar nada, y encima el manejador del scroll lo
  // llama desde el hilo de UI en cada arrastre.
  const stopped = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  /**
   * ⚠️ EL CALLBACK SE GUARDA EN UN REF, y no es ceremonia: es lo que impide que el barrido se
   * REPROGRAME SOLO.
   *
   * `glideTo` se escribe en línea donde se usa, así que es una función NUEVA en cada render. Puesta
   * en las dependencias del efecto de abajo, cualquier repintado —una tecla, un dato que llega—
   * cancelaría los temporizadores y volvería a agendar el plan DESDE EL PRINCIPIO: la rueda se
   * quedaría reiniciando su presentación para siempre.
   *
   * Guardándolo aquí, el efecto depende sólo de lo que de verdad describe el recorrido, y el
   * temporizador llama igualmente a la versión más reciente.
   *
   * ⚠️ Y SE REFRESCA EN UN EFECTO, no en el cuerpo del render. Escribir un ref mientras se renderiza
   * es impuro —React puede descartar un render a medias y la escritura ya habría ocurrido—, y con
   * React Compiler encendido eso deja de ser teórico. Acá no cuesta nada evitarlo: `useRef` ya nace
   * con el primer valor, y el efecto sin lista de dependencias corre tras CADA commit, así que el
   * callback está al día mucho antes de que salte el primer temporizador (1800ms).
   *
   * (Distinto es el caso de los valores compartidos de `search-overlay`: ahí un efecto llega TARDE
   * a propósito —corre después de pintar— y por eso sí se escriben durante el render. La regla no
   * es «nunca en el render», es «sólo cuando el efecto llega tarde».)
   */
  const glide = useRef(glideTo);
  useEffect(() => {
    glide.current = glideTo;
  });

  useEffect(() => {
    if (!enabled || reduceMotion || stopped.current) return;

    // Los pasos se programan de UNA VEZ, cada uno con su retardo, en vez de encadenar un intervalo:
    // así al limpiar se cancelan todos juntos y no queda ninguno colgando.
    for (const { at, to } of wheelAutoplayPlan({ from, limit })) {
      timers.current.push(
        setTimeout(() => {
          if (stopped.current) return;
          glide.current(to * step);
        }, at),
      );
    }

    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      timers.current = [];
    };
    // (`glide` es un ref a propósito y NO va aquí — ver arriba.)
  }, [enabled, reduceMotion, from, limit, step]);

  return () => {
    stopped.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
}
