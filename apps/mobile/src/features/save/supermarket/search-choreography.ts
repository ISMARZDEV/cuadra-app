// LOS TIEMPOS QUE TRES ARCHIVOS TIENEN QUE ACORDAR para que abrir y cerrar el buscador se lean
// como UN movimiento y no como tres animaciones sueltas.
//
// ⚠️ POR QUÉ EXISTE ESTE MÓDULO. Estos números vivían duplicados en `search-overlay` (la hoja) y en
// `home-screen` (la pantalla), con un comentario en cada sitio pidiendo que se cambiaran a la vez.
// No se cumplió: el comentario de `HEADER_AWAY_DELAY` seguía diciendo que la barra arranca con él
// —en 320— cuando hacía tiempo que arrancaba en `STAGE`, 520. Un número duplicado con una nota que
// dice «acuérdate» es un número que ya se desincronizó, sólo que todavía no lo sabes.
//
// La regla de dependencias se respeta igual, y por eso esto es un módulo y no un import cruzado:
// la hoja NO importa de la pantalla que la abre ni al revés. Las dos leen de aquí.

// ── ABRIR ─────────────────────────────────────────────────────────────────────
//
// El primer acto es del HEADER: las categorías se retiran una a una y la elipse sube tras ellas.
// Sólo cuando ese sitio queda libre sube la barra. Por eso la hoja ESPERA.

/** Cuándo empieza el header a apartarse. Las categorías ya se están yendo desde el toque. */
export const HEADER_AWAY_AT = 320;
/** Lo que tarda en apartarse. Es la pieza más grande de la pantalla: las cosas grandes tardan. */
export const HEADER_AWAY_MS = 450;
/**
 * Cuándo arranca TODO lo de la hoja al abrir: la barra sube y el telón se llena.
 *
 * 520 = lo que tarda la ÚLTIMA categoría en irse del todo. La elipse puede empezar antes (arriba)
 * porque las arrastra consigo; la barra no, que es la protagonista del segundo acto.
 */
export const STAGE = 520;

// ── CERRAR ────────────────────────────────────────────────────────────────────
//
// Todo se cuenta desde EL TOQUE DE LA X. Ése es el instante que el usuario provoca, y es el único
// que puede ordenar la vuelta.

/** Cuándo empieza a bajar la barra: cuando el cuerpo ya se fue y ella terminó de ensancharse. */
export const BAR_DOWN_AT = 380;
/** Lo que dura el viaje de la barra. EL MISMO en los dos sentidos: es el mismo camino. */
export const BAR_TRAVEL_MS = 380;
/** Cuándo se posa la barra. Es también cuando la hoja se desmonta y la home recupera su píldora. */
export const BAR_LANDS_AT = BAR_DOWN_AT + BAR_TRAVEL_MS;

/**
 * Cuándo empieza el header a volver: EXACTAMENTE cuando la barra empieza a bajar.
 *
 * ⚠️ AQUÍ ESTABA EL DEFECTO, y merece contarse porque la intención ya era correcta y aun así
 * salía mal. `HEADER_BACK_MS` valía 380 «para que aterricen juntos» —lo cual es cierto—, pero la
 * vuelta la disparaba `onClosed`, el aviso que la hoja manda cuando la barra YA ATERRIZÓ. La buena
 * duración colgada de la señal equivocada: el header arrancaba en 760, o sea justo cuando debía
 * estar posándose, y la pantalla pasaba 760ms SIN HEADER. Luego bajaba el verde solo, y sólo
 * entonces rebotaban las categorías: tres sucesos donde el usuario ve —y pide— uno.
 *
 * La vuelta se ordena desde EL TOQUE, que es el único instante que el usuario provoca. `onClosed`
 * sigue existiendo y sigue siendo el correcto para lo suyo: devolver la píldora de reposo, que no
 * puede reaparecer hasta que la copia que viaja esté encima.
 */
export const HEADER_BACK_AT = BAR_DOWN_AT;
/** Lo que tarda en volver. Igual al viaje de la barra, así que se posan en el mismo instante. */
export const HEADER_BACK_MS = BAR_TRAVEL_MS;
/**
 * Cuándo empiezan a rebotar las categorías sobre la elipse, al volver.
 *
 * EN PLENO VUELO, a media bajada — no cuando la elipse ya se posó. Rebotando encima de algo que
 * todavía baja, los círculos y el verde llegan como UNA cosa; esperando al aterrizaje se leen como
 * una animación aparte que empieza cuando la anterior acabó, y es lo que se sentía largo.
 */
export const POP_BACK_AT = 560;
