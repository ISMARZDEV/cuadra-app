import type { TextStyle } from "react-native";

/**
 * El chat —y SÓLO el chat— escribe con la fuente del SISTEMA: SF Pro en iOS, Roboto en Android.
 * El resto de la app sigue con Kantumruy. Es una excepción deliberada, no un cambio de marca: el
 * texto de un chat es PROSA LARGA que se lee en bloque, no etiquetas de UI. La fuente del sistema
 * está optimizada para eso, es la que el usuario ya lee en todo el teléfono, y es buena parte de
 * lo que hace que un chat «se sienta nativo».
 *
 * Se consigue **omitiendo `fontFamily`**, no nombrándola: RN cae a la del sistema. Escribir
 * "System" o "SF Pro" ataría el código a una plataforma y rompería en la otra.
 *
 * El peso va por `fontWeight`, que con la fuente del sistema SÍ resuelve. Con Kantumruy no se
 * podía: cada peso es un TTF aparte y RN no elige el archivo por número — por eso
 * `tailwind.config.js` expone una utilidad por cara (`font-sans-medium`…) en vez de los pesos
 * numéricos. Ese es exactamente el motivo por el que estos estilos existen como objetos y no como
 * clases de Tailwind: las clases de fuente del proyecto TODAS nombran una cara de Kantumruy.
 *
 * Alcance (el que fija el plan): burbuja del usuario, texto del agente, el campo del composer y la
 * línea de estado. NO los botones, la píldora, las tarjetas ni el resto de la UI.
 */
/**
 * Tamaño del cuerpo del chat. **Una sola fuente de verdad**: lo comparten las burbujas, el texto
 * del agente, el campo del composer (y su placeholder) y la línea de estado. Antes cada superficie
 * traía el suyo (18 por clase de Tailwind, 17 en el input) y "la tipografía del chat" no era UNA.
 *
 * 16/22 son los valores de la implementación de referencia (`markdownTokens` del demo).
 *
 * ⚠️ ALCANCE: sólo MENSAJES + COMPOSER. Las tarjetas (producto, canasta, quick-actions, dock,
 * estado vacío) quedan FUERA por decisión explícita — tienen su propia escala y su Kantumruy.
 */
export const CHAT_FONT_SIZE = 16;
export const CHAT_LINE_HEIGHT = 22;

export const CHAT_BODY: TextStyle = {
  fontSize: CHAT_FONT_SIZE,
  lineHeight: CHAT_LINE_HEIGHT,
  fontWeight: "500",
};

/** Énfasis dentro del chat: **negritas** y nombres de sección. Mismo cuerpo, más peso. */
export const CHAT_STRONG: TextStyle = {
  fontSize: CHAT_FONT_SIZE,
  lineHeight: CHAT_LINE_HEIGHT,
  fontWeight: "600",
};

/** El mismo peso del cuerpo, para quien necesita el número suelto (Skia lo pide así). */
export const CHAT_BODY_WEIGHT = "500" as const;
