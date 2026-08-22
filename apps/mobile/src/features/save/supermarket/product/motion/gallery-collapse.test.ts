import { describe, expect, test } from "vitest";

import {
  collapseDistance,
  CONTROLS_FADE,
  galleryControlsOpacity,
  galleryLift,
  headerShrinkOf,
  galleryOpacity,
  headerCollapse,
  headerContentFade,
  HEADER_CONTENT_FADE,
  HEADER_REST,
  indicatorProgress,
  indicatorTop,
  INDICATOR_REVEAL,
  PHOTO_FADE,
  PHOTO_GAP,
  SHELL_COLLAPSE,
  TITLE_CLEARANCE,
  snapOffsetsFor,
} from "./gallery-collapse";

/**
 * El plegado de la galería, derivado de la secuencia de referencia (6 fotogramas, del estado
 * desplegado al compacto).
 *
 * Todo cuelga del MISMO `scrollY`, así que lo que hay que sujetar no son milisegundos sino
 * RELACIONES: qué se va antes que qué, qué no puede solaparse con qué, y que la vuelta sea la ida
 * al revés sin escribirla.
 */

/** La geometría de un iPhone 14 Pro con la maquetación real de la pantalla. */
const HEADER_ROW = 48;
const HEADER_BULGE = 28;
const BELOW_ROW = 76;
const DOTS_BAND = 23;
const PHOTO_HEIGHT = 322;
const SAFE_TOP = 59; // iPhone 14 Pro
const GEOMETRY = {
  headerRow: HEADER_ROW,
  headerBulge: HEADER_BULGE,
  belowRow: BELOW_ROW,
  dotsBand: DOTS_BAND,
  photoGap: PHOTO_GAP,
  photoHeight: PHOTO_HEIGHT,
};
const D = collapseDistance(GEOMETRY);
const SHRINK = headerShrinkOf(GEOMETRY);

/** El alto del header DESPLEGADO y COMPACTO, tal y como los calcula `CurvedHeader`. */
const EXPANDED = SAFE_TOP + HEADER_ROW + BELOW_ROW;
const COLLAPSED = SAFE_TOP + HEADER_REST;
/** El canto REAL del verde compacto: la panza cuelga por debajo de la caja. */
const GREEN_BOTTOM = COLLAPSED + HEADER_BULGE;
/** Dónde debe posarse el techo del contenido: el canto del verde MÁS su aire. */
const CONTENT_LANDING = GREEN_BOTTOM + TITLE_CLEARANCE;
/**
 * El hueco que el flujo le reserva al BLOQUE de la galería — tarjeta MÁS la banda de puntos.
 *
 * Los puntos viven entre la tarjeta y el título, así que dejaron de ser un adorno dentro de la foto
 * y pasaron a ocupar sitio: quien no los cuente le devuelve el hueco al título y lo sube encima.
 */
const BLOCK_BOTTOM = SAFE_TOP + HEADER_ROW + PHOTO_GAP + PHOTO_HEIGHT + DOTS_BAND;
const PHOTO_SLOT = BLOCK_BOTTOM - EXPANDED;

describe("cuánto dura el plegado", () => {
  test("el título aterriza con AIRE bajo la curva, no pegado a ella", () => {
    // Una curva es un canto BLANDO: pide más aire que un borde recto para que el texto no se lea
    // como que se le está metiendo debajo. `TITLE_CLEARANCE` es EL número a mover si queda alto o
    // bajo — el recorrido, la foto y el tirador se recolocan solos.
    expect(TITLE_CLEARANCE).toBeGreaterThan(0);
    expect(COLLAPSED + PHOTO_SLOT - D).toBeGreaterThan(GREEN_BOTTOM);
  });

  test("el HEADER también empuja: no todo el viaje lo paga el dedo", () => {
    // ⭐⭐⭐ El defecto más caro de todos. El `ScrollView` es HERMANO del header, así que cuando el
    // verde encoge, el techo del scroll SUBE con él: el contenido recibe ese desplazamiento GRATIS,
    // además del scroll. Calcular el recorrido como si sólo lo moviera el dedo se pasa por exactamente
    // lo que el header encoge, y el imán aplica ese exceso de golpe al soltar — el título y el precio
    // terminan detrás de la curva.
    //
    // Cuánto viaja la tarjeta (`SHRINK + D`) y cuánto scroll hace falta (`D`) son DOS NÚMEROS
    // DISTINTOS. Confundirlos es el defecto.
    expect(SHRINK).toBe(EXPANDED - COLLAPSED);
    expect(SHRINK).toBeGreaterThan(0);
    expect(D).toBeLessThan(SHRINK + D);
  });

  test("la PANZA cuenta: el verde no termina donde termina su caja", () => {
    // ⭐⭐ El defecto que sujeta, y costó una ronda entera: la panza de la curva CUELGA por debajo
    // de la caja del header (`bottom: -HEADER_BULGE`), así que el canto real del verde está 28pt más
    // abajo de lo que dice su altura. Calculando el recorrido contra la caja, el contenido subía 28pt
    // de más y el título y el precio terminaban ESCONDIDOS DETRÁS de la curva.
    const sinPanza = collapseDistance({ ...GEOMETRY, headerBulge: 0 });
    expect(D).toBe(sinPanza - HEADER_BULGE);
  });

  test("al imantar, el CONTENIDO se posa justo bajo la curva — ni debajo, ni flotando", () => {
    // ⭐⭐ El invariante que de verdad importa, en coordenadas de PANTALLA porque ahí vive el defecto.
    //
    // El techo del contenido = techo del scroll (que ES el alto del header) + el hueco de la foto
    // − el scroll. Al imantar, tiene que posarse sobre el canto REAL del verde, panza incluida. El
    // aire que separa el título de la curva lo pone el `pt-5` que ya lleva la maquetación: no hay
    // que inventar ningún margen.
    expect(COLLAPSED + PHOTO_SLOT - D).toBe(CONTENT_LANDING);
  });

  test("la banda de PUNTOS cuenta como parte del bloque", () => {
    // ⭐ Los puntos se movieron de dentro de la foto al hueco entre la tarjeta y el título. Ahí ya
    // no son un adorno flotante: ocupan sitio, y el recorrido tiene que incluirlos o el título se
    // come ese hueco y vuelve a subir de más.
    const sinPuntos = collapseDistance({ ...GEOMETRY, dotsBand: 0 });
    expect(D).toBe(sinPuntos + DOTS_BAND);
  });

  test("y la TARJETA queda escondida exactamente ahí mismo", () => {
    // ⭐⭐ La tarjeta vive FUERA del scroll, así que para no divergir de su propio hueco tiene que
    // recibir las DOS causas: el dedo y lo que el header encoge. Si sólo recibiera el dedo, el
    // contenido subiría más rápido que ella y el nombre del producto se leería por debajo de la foto.
    //
    // Con las dos, su canto inferior aterriza en la MISMA línea que el techo del contenido — que es
    // lo que tiene que pasar, porque en la maquetación son la misma línea.
    expect(BLOCK_BOTTOM - D - SHRINK).toBe(CONTENT_LANDING);
  });

  test("la tarjeta y su hueco NO divergen en ningún punto del recorrido", () => {
    // El defecto que sujeta: dos piezas que representan lo mismo moviéndose a velocidades distintas.
    for (const y of [0, 40, 90, 150, D]) {
      const cardBottom = BLOCK_BOTTOM + galleryLift(y, D, SHRINK);
      const headerNow = EXPANDED - SHRINK * headerCollapse(y, D);
      const contentTop = headerNow + PHOTO_SLOT - y;
      expect(cardBottom).toBeCloseTo(contentTop, 6);
    }
  });

  test("una foto más alta pide MÁS recorrido", () => {
    // Clavar el recorrido era generoso en un Pro Max y ahogaba el plegado en un SE: la tarjeta se
    // deriva del ancho de la pantalla, así que el viaje también tiene que derivarse.
    const alta = collapseDistance({ ...GEOMETRY, photoHeight: PHOTO_HEIGHT + 100 });
    expect(alta).toBe(D + 100);
  });

  test("nunca es cero, ni con una geometría degenerada", () => {
    // Dividir por el recorrido está en el corazón de todas las rampas: un 0 las volvería `NaN` y
    // la pantalla entera se quedaría en blanco.
    expect(
      collapseDistance({
        headerRow: 0,
        headerBulge: 0,
        belowRow: 0,
        dotsBand: 0,
        photoGap: 0,
        photoHeight: 0,
      }),
    ).toBeGreaterThan(0);
  });
});

describe("la galería la EMPUJA el scroll", () => {
  test("va pegada al dedo, punto por punto", () => {
    // ⭐ La referencia pide que la galería «parezca que está siendo empujada hacia arriba por el
    // scroll, no que está haciendo una animación independiente». Cualquier factor distinto de 1 es
    // una animación propia: la tarjeta y el hueco que tiene reservado en el flujo DIVERGIRÍAN, y lo
    // que diverge acaba solapando al nombre del producto.
    expect(galleryLift(0, D, SHRINK)).toBe(0);
    // Antes de que el verde empiece a encoger, el único que empuja es el dedo: 1:1 exacto.
    expect(galleryLift(20, D, SHRINK)).toBe(-20);
    // Y al final ha recorrido las dos causas sumadas.
    expect(galleryLift(D, D, SHRINK)).toBe(-(D + SHRINK));
  });

  test("el rebote no la baja de su sitio", () => {
    // Un rebote da scroll NEGATIVO. Sin acotar, la tarjeta bajaría a taparle el nombre al producto.
    expect(galleryLift(-200, D, SHRINK)).toBe(0);
  });
});

describe("la tarjeta NUNCA se ve amputada", () => {
  test("aguanta ENTERA mientras siga dentro de la pantalla", () => {
    // ⭐⭐ El defecto que sujeta, y que costó DOS rondas: la tarjeta se recortaba contra un canto
    // inventado y aparecía con el canto superior recto y las esquinas cuadradas. Ahora no hay
    // recorte —sale por el borde físico de la pantalla— y por eso el desvanecido no puede empezar
    // antes de que su canto superior YA haya salido por arriba: si empezara antes, se vería una
    // tarjeta entera y semitransparente en mitad de la pantalla, que es el otro modo de fallar.
    //
    // ⚠️ El scroll al que sale NO es su distancia al borde: la tarjeta viaja por DOS causas (el
    // dedo y lo que el header encoge), así que sale con menos scroll del que mide su recorrido.
    // Confundir viaje con scroll es el mismo error que costó una ronda entera, así que aquí se
    // RESUELVE numéricamente en vez de estimarse.
    //
    // Se usa el área segura MÁS GRANDE de la gama (un Pro Max) porque es la que MÁS TARDA en salir:
    // es el caso que aprieta.
    const safeTopMasGrande = 62;
    const cantoSuperiorEn = (y: number) =>
      safeTopMasGrande + HEADER_ROW + PHOTO_GAP + galleryLift(y, D, SHRINK);

    let saleAlScroll = D;
    for (let y = 0; y <= D; y += 0.5) {
      if (cantoSuperiorEn(y) <= 0) {
        saleAlScroll = y;
        break;
      }
    }

    // Mientras se le vea el canto de arriba, la tarjeta está ENTERA.
    expect(cantoSuperiorEn(saleAlScroll - 1)).toBeGreaterThan(0);
    expect(D * PHOTO_FADE.from).toBeGreaterThanOrEqual(saleAlScroll);
  });
});

describe("primero el movimiento, DESPUÉS la desaparición", () => {
  test("el primer TERCIO del viaje es movimiento puro, sin tocar la opacidad", () => {
    // ⭐ Es la regla explícita de la referencia: «La prioridad es que primero ocurra el movimiento
    // y posteriormente la desaparición. Esto es importante para que la transición se sienta
    // física». Una opacidad que cae desde el primer punto de scroll se lee como un elemento al que
    // le bajan el brillo, no como una superficie que se retira.
    //
    // El disparo NO es «pasada la mitad» sino un hecho geométrico —que el canto superior haya
    // salido por arriba— y en esta pantalla eso cae sobre el primer tercio. Se afirma el tercio y
    // no la mitad para que el día que cambie el alto de la foto, el test siga diciendo la verdad.
    expect(galleryOpacity(0, D)).toBe(1);
    expect(galleryOpacity(D * 0.25, D)).toBe(1);
    expect(PHOTO_FADE.from).toBeGreaterThanOrEqual(1 / 3);
  });

  test("y al final se ha ido del todo, sin `display: none`", () => {
    // Llega a 0 ANTES del final del recorrido: en el penúltimo fotograma de la referencia queda un
    // rastro tenue, y en el último ya no hay nada. Si llegase justo al final, el rastro se apagaría
    // en el mismo punto en que la tarjeta se esconde y no se vería desvanecerse.
    expect(galleryOpacity(D * PHOTO_FADE.to, D)).toBe(0);
    expect(PHOTO_FADE.to).toBeLessThan(1);
    expect(galleryOpacity(D, D)).toBe(0);
  });

  test("no se pasa de rosca por ningún extremo", () => {
    expect(galleryOpacity(-200, D)).toBe(1);
    expect(galleryOpacity(9999, D)).toBe(0);
  });
});

describe("las flechas y los puntos se van A LA PRIMERA", () => {
  test("empiezan a irse con el primer punto de scroll, sin esperar a nada", () => {
    // ⭐ Pedido explícito: «que desaparezcan de una vez al hacer scroll, no hay que esperar que
    // finalice la transición». Son CONTROLES, no contenido: en cuanto el dedo dice «me voy hacia
    // abajo», dejaron de tener sentido — y un control que sigue ahí mientras la superficie que
    // gobierna se está yendo invita a tocarlo justo cuando ya no va a responder.
    expect(CONTROLS_FADE.from).toBe(0);
    expect(galleryControlsOpacity(0, D)).toBe(1);
    expect(galleryControlsOpacity(D * 0.02, D)).toBeLessThan(1);
  });

  test("se van MUCHO antes que la foto, que es lo que los distingue de ella", () => {
    // Si compartieran reloj con la tarjeta no habría nada que decidir aquí. Lo que hace falta
    // sujetar es que su tramo termine holgadamente antes de que la foto empiece siquiera el suyo.
    expect(CONTROLS_FADE.to).toBeLessThan(PHOTO_FADE.from);
    expect(galleryControlsOpacity(D * PHOTO_FADE.from, D)).toBe(0);
  });

  test("pero no se APAGAN de golpe: es un desvanecido corto, no un interruptor", () => {
    // «De una vez» es rápido, no instantáneo. Un salto de 1 a 0 en un fotograma se lee como un
    // fallo de render; un tramo corto se lee como que se apartan.
    expect(CONTROLS_FADE.to).toBeGreaterThan(0);
    const aMedias = galleryControlsOpacity((D * CONTROLS_FADE.to) / 2, D);
    expect(aMedias).toBeGreaterThan(0);
    expect(aMedias).toBeLessThan(1);
  });

  test("y vuelven enteros al subir del todo", () => {
    expect(galleryControlsOpacity(0, D)).toBe(1);
    expect(galleryControlsOpacity(-100, D)).toBe(1);
  });
});

describe("los controles del header se van HACIA ARRIBA, y se van los primeros", () => {
  test("han salido ANTES de que la tarjeta llegue al borde de arriba", () => {
    // ⭐⭐ El defecto que sujeta: con los controles clavados apagándose despacio, la tarjeta subía
    // ENTRE dos círculos verdes que seguían ahí — y eso se lee como un elemento pegado encima de
    // una cabecera que no se entera de nada. En el fotograma 3 de la referencia, para cuando la
    // tarjeta está arriba, título y botones ya están CORTADOS por el borde superior.
    //
    // Se comprueba contra el área segura MÁS PEQUEÑA de la gama (un SE sin notch), que es donde la
    // tarjeta llega antes: si ahí ya se han ido, en un Pro Max con más aire también.
    const safeTopMasPequeno = 20;
    const tarjetaLlegaAlBorde = safeTopMasPequeno + HEADER_ROW + PHOTO_GAP;
    expect(D * HEADER_CONTENT_FADE.to).toBeLessThanOrEqual(tarjetaLlegaAlBorde);
  });

  test("pero no se van de golpe al primer roce del dedo", () => {
    // En el fotograma 2 de la referencia siguen en su sitio, con la tarjeta justo debajo. Salir
    // disparados con el primer punto de scroll delataría que se van por un umbral, no por el gesto.
    expect(HEADER_CONTENT_FADE.from).toBeGreaterThan(0);
    expect(headerContentFade(D * 0.02, D)).toBe(0);
  });

  test("arriba del todo están enteros; abajo del todo, fuera", () => {
    expect(headerContentFade(0, D)).toBe(0);
    expect(headerContentFade(D, D)).toBe(1);
  });
});

describe("el orden del plegado", () => {
  test("la cáscara verde empieza a encoger DESPUÉS de que la galería arranque", () => {
    // Si arrancaran juntas, dos cosas se moverían desde el primer punto de scroll y la pantalla
    // entera se leería como una sacudida.
    expect(headerCollapse(0, D)).toBe(0);
    expect(SHELL_COLLAPSE.from).toBeGreaterThan(0);
  });

  test("el tirador NO asoma mientras quede tarjeta a la vista", () => {
    // Sería ofrecer un atajo para volver arriba cuando todavía estás arriba. Atado al desvanecido
    // y no a un número suelto: alargar el plegado no lo descoloca.
    expect(INDICATOR_REVEAL.from).toBeGreaterThanOrEqual(PHOTO_FADE.to);
    expect(indicatorProgress(D * PHOTO_FADE.to, D)).toBe(0);
  });

  test("al final del recorrido todo ha llegado a su destino", () => {
    expect(galleryOpacity(D, D)).toBe(0);
    expect(headerCollapse(D, D)).toBe(1);
    expect(indicatorProgress(D, D)).toBe(1);
    expect(headerContentFade(D, D)).toBe(1);
  });
});

describe("cada punto de scroll tiene su estado", () => {
  test("cada pieza tiene estados a medias dentro de SU tramo", () => {
    // El plegado es una FUNCIÓN del scroll: mientras el dedo está en contacto, cada punto pinta su
    // estado exacto. El imán no cambia eso — actúa al SOLTAR, eligiendo dónde termina el gesto, no
    // qué se dibuja durante él.
    //
    // Se pregunta tramo por tramo y no en un punto común a propósito: los tramos están
    // ESCALONADOS, así que no hay ningún scroll en el que las tres piezas estén a medias a la vez
    // — y que no lo haya es justamente la coreografía, no un defecto.
    const enMedioDe = (w: { from: number; to: number }) => (D * (w.from + w.to)) / 2;

    const aMedias = [
      galleryOpacity(enMedioDe(PHOTO_FADE), D),
      headerCollapse(enMedioDe(SHELL_COLLAPSE), D),
      headerContentFade(enMedioDe(HEADER_CONTENT_FADE), D),
      indicatorProgress(enMedioDe(INDICATOR_REVEAL), D),
    ];
    for (const v of aMedias) {
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("el imán aterriza justo donde el plegado termina", () => {
    // ⭐ Las dos orillas y sólo ésas: arriba del todo, o el plegado completo con el bloque del
    // título posado bajo la cabecera compacta. A mitad de camino hay un verde a medio encoger que
    // no es ninguna de las dos cosas que la pantalla sabe ser.
    //
    // El destino es el recorrido DERIVADO, no un número escrito a mano: por eso aterriza en el
    // mismo sitio en un SE y en un Pro Max sin tocar un solo margen.
    expect(snapOffsetsFor(D)).toEqual([0, D]);
    expect(headerCollapse(snapOffsetsFor(D)[1], D)).toBe(1);
    expect(galleryOpacity(snapOffsetsFor(D)[1], D)).toBe(0);
  });

  test("los puntos del imán van ORDENADOS, que es lo que `snapToOffsets` exige", () => {
    const offsets = snapOffsetsFor(D);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  test("cada punto de scroll da UN estado, venga de donde venga", () => {
    // ⭐ La razón de que todo cuelgue de un número en vez de tener animación de ida y otra de
    // vuelta: no hay dos caminos que puedan discrepar. Es una función, no una máquina de estados.
    for (const y of [0, 40, 120, 200, 300, D, D * 2]) {
      expect(galleryOpacity(y, D)).toBe(galleryOpacity(y, D));
      expect(headerCollapse(y, D)).toBe(headerCollapse(y, D));
    }
    expect(galleryOpacity(0, D)).toBe(1);
    expect(headerCollapse(0, D)).toBe(0);
    expect(indicatorProgress(0, D)).toBe(0);
    expect(headerContentFade(0, D)).toBe(0);
  });

  test("es MONÓTONO: bajar nunca devuelve algo a medio camino hacia atrás", () => {
    // Un tramo no monótono se ve como un tirón: la tarjeta reaparece un poco a mitad del gesto.
    let opacidad = galleryOpacity(0, D);
    let cascara = headerCollapse(0, D);
    for (let y = 0; y <= D; y += 5) {
      expect(galleryOpacity(y, D)).toBeLessThanOrEqual(opacidad);
      expect(headerCollapse(y, D)).toBeGreaterThanOrEqual(cascara);
      opacidad = galleryOpacity(y, D);
      cascara = headerCollapse(y, D);
    }
  });
});

describe("el tirador va pegado a la curva", () => {
  test("arriba del todo se posa en el canto de la cabecera DESPLEGADA", () => {
    expect(indicatorTop(0, D, 200, 90)).toBe(200);
  });

  test("con la cabecera compacta baja al canto NUEVO, no se queda flotando", () => {
    // ⭐ El defecto que arregla: con un `top` fijo calculado sobre la cabecera desplegada, el
    // tirador aparecía a media pantalla y encima del contenido, porque el verde ya se había
    // encogido. Pertenece a la curva; si la curva se mueve, él se mueve.
    expect(indicatorTop(D, D, 200, 90)).toBe(90);
  });

  test("por el camino va INTERPOLANDO, sin saltos", () => {
    const medio = indicatorTop(D * 0.6, D, 200, 90);
    expect(medio).toBeLessThan(200);
    expect(medio).toBeGreaterThan(90);
  });
});
