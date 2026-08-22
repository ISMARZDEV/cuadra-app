import { Easing, type WithTimingConfig } from "react-native-reanimated";

// El MOVIMIENTO de esconder una barra de navegación, compartido por todas las que lo hacen.
//
// ⭐ Vive en su propio módulo y no como constante dentro de la barra de tabs porque ya son CUATRO
// los que tienen que ponerse de acuerdo: el cajón del chat, el chat expandido, el scroll de una
// rejilla y —ahora— el pie flotante del detalle de producto. Un número duplicado con un comentario
// que dice «acuérdate de cambiar el otro» ya está desincronizado; en este repo pasó, con un
// comentario que decía 320 donde el código usaba 520.
//
// Si el mismo gesto se sintiera distinto según de qué barra viniera, el usuario no lo leería como
// dos animaciones: lo leería como que la app va a saltos.

/**
 * Cuánto tarda una barra en irse.
 *
 * A 240 ms el recorrido no se leía y la barra parecía ESFUMARSE en vez de irse. A 300 ya se leía.
 * A 380 con la curva de abajo, el final se estira lo justo para que el ojo la acompañe hasta el
 * borde — que es lo que se percibe como fluidez: no la velocidad, sino cómo ATERRIZA.
 */
export const NAV_HIDE_MS = 380;

/**
 * La curva. «Emphasized» de Material 3, la misma que ya gobierna la coreografía del buscador.
 *
 * ⭐ Arranca decidida y ASIENTA muy despacio. Es lo contrario de la curva por defecto de
 * `withTiming` (`inOut(quad)`), que reparte la aceleración por igual y llega al destino todavía con
 * velocidad: eso se lee como un frenazo justo en el punto que más se mira, el final del recorrido.
 *
 * Ida y vuelta comparten curva a propósito. Lo que hace que volver se lea como «deshacer» no es
 * invertir la curva —el espejo matemático llegaría a destino a máxima velocidad— sino recorrer el
 * MISMO camino entre los mismos extremos en el mismo tiempo.
 */
export const NAV_HIDE_EASING = Easing.bezier(0.2, 0, 0, 1);

/** Lo que se le pasa a `withTiming` para esconder o traer una barra. */
export const NAV_HIDE_TIMING: WithTimingConfig = {
  duration: NAV_HIDE_MS,
  easing: NAV_HIDE_EASING,
};
