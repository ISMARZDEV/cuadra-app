/**
 * TODO — LOS TRES HUECOS DEL DISEÑO QUE TODAVÍA NO TIENEN DATO.
 *
 * Están TODOS aquí a propósito. El día que llegue el dato real se cambia UN archivo; repartidos por
 * la pantalla, un mock se queda para siempre porque nadie recuerda dónde estaban.
 *
 * Ninguno de estos valores puede acabar cerca de un PRECIO. La regla sagrada de Save es que todo
 * número de dinero viene de la base como entero y nadie lo inventa; esto son adornos del diseño
 * mientras su fuente existe, y ninguno alimenta un cálculo.
 */

/**
 * ⚠️ VALORACIÓN — pendiente de endpoint.
 *
 * No existe en el esquema ni en ninguna fuente de ingesta. Va fijo hasta que haya un endpoint que
 * lo sirva; entonces esto se borra y se lee del DTO.
 *
 * Decisión del usuario (2026-08-19): se pinta igual que el mock, mockeado, y se conecta después.
 */
export const MOCK_RATING = 4.5;

/**
 * ⚠️ ENTREGA RÁPIDA — no tenemos datos de logística.
 *
 * Las fuentes dan precio y disponibilidad, no plazos de entrega. La píldora se pinta para respetar
 * el diseño; cuando haya dato saldrá del proveedor, y entonces habrá que decidir qué se enseña para
 * las tiendas que no lo declaren (un hueco, no un «sí» por defecto).
 */
export const MOCK_FAST_DELIVERY = true;

/**
 * ⚠️ COOKING IDEA + NUTRITION VALUES — vendrán de NEWS.
 *
 * Son contenido editorial, no catálogo: el usuario confirmó que salen del vertical de News cuando
 * esté. Hasta entonces los acordeones se dibujan con su forma y un cuerpo de relleno.
 */
export const MOCK_ACCORDION_BODY =
  "Contenido pendiente. Esta sección se alimentará desde News cuando el vertical esté disponible.";

/**
 * ⚠️ LISTA DE COMPRAS — el pie NO hace nada todavía.
 *
 * El usuario pidió explícitamente que se pinte igual que el mock pero inerte, y que la lista de
 * compras sea LO ÚLTIMO que se construya, con indicaciones suyas. Mantener el botón vivo pero sin
 * destino sería peor que dejarlo inerte: prometería una acción que no ocurre.
 */
export const SHOPPING_LIST_IS_MOCK = true;
