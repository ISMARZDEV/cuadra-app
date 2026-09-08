/**
 * LA PILA DE CAPAS DEL ARMAZÓN de la app (lo que se dibuja por encima de las pantallas).
 *
 * La lente líquida tiene que cubrir también la barra:
 * en Monogram los controles laterales se retiran dentro del contexto y sólo el micrófono activo
 * queda nítido. Cuadra vuelve a dibujar una copia nítida del orbe en el `foreground` de la lente;
 * el overlay usa `pointerEvents="none"`, así que el responder original conserva el gesto debajo.
 *
 * La capa vive en un módulo para que otros elementos del armazón puedan posicionarse respecto a
 * ella sin copiar números (ver `cuadra-motion` §5).
 */
export const SHELL_LAYER = {
  /** La lente líquida y su velo: por encima del contenido y de la barra… */
  lens: 10,
} as const;
