/**
 * LA PILA DE CAPAS DEL ARMAZÓN de la app (lo que se dibuja por encima de las pantallas).
 *
 * Son dos números y viven juntos a propósito. La lente líquida es un hermano POSTERIOR a `<Tabs>`,
 * así que por orden de pintado taparía también la barra —y con ella el orbe, que es justo el
 * control que tiene que quedarse nítido y seguir recibiendo el dedo—. La barra se sube por encima
 * con `zIndex` y el problema desaparece.
 *
 * ⚠️ Escritos en un módulo compartido y NO duplicados con un comentario que diga «acuérdate»: un
 * número repetido en dos archivos ya está desincronizado (ver `cuadra-motion` §5, y la misma
 * lección aprendida en `save/supermarket/layers.ts`).
 */
export const SHELL_LAYER = {
  /** La lente líquida y su velo: por encima del contenido de las pantallas… */
  lens: 10,
  /** …y por debajo de la barra, que sostiene el orbe. */
  tabBar: 20,
} as const;
