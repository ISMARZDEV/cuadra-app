import type { MarkdownStyle } from "react-native-enriched-markdown";

import { CHAT_BODY } from "./chat-typography";

// Mismos hex que theme-provider.tsx define para `--color-text` — EnrichedMarkdownText es un
// componente nativo (Fabric), no lee las variables CSS de NativeWind, así que acá no alcanza con
// la clase `text-text`: hace falta el color resuelto.
const TEXT_LIGHT = "#111827";
const TEXT_DARK = "#F7FAF7";

// Estilo de párrafo para el ÚNICO elemento que este chat le pide al parser: prosa plana. `chat-
// typography.ts` sigue siendo la fuente de verdad del tamaño/peso — este mapa sólo la traduce al
// vocabulario de `MarkdownStyle` (colores en hex, no clases; `fontWeight` como string).
export function chatMarkdownStyle(isDark: boolean): MarkdownStyle {
  return {
    paragraph: {
      color: isDark ? TEXT_DARK : TEXT_LIGHT,
      fontSize: CHAT_BODY.fontSize,
      lineHeight: CHAT_BODY.lineHeight,
      fontWeight: String(CHAT_BODY.fontWeight),
    },
  };
}

// Caracteres con significado en CommonMark. Escapados TODOS, en cualquier posición: escapar uno
// que no estaba actuando como marca (p. ej. un "-" a mitad de frase) es un no-op visual, así que
// no hace falta distinguir "está al principio de línea" de "no lo está".
const MARKDOWN_SPECIAL = /[\\`*_{}[\]()#+\-.!>]/g;

// Este chat sólo le pasa al parser texto que YA decidimos que es prosa plana (`hasRichMarkup` dio
// false) — nunca markdown de verdad. Pero un parser de CommonMark de verdad no sabe eso: "1. compra
// arroz" es una lista numerada para él, "$10_000" lleva cursiva, un "#" a mitad de frase puede
// arrastrar interpretación según el contexto. Sin escapar, el texto renderizaría DISTINTO de cómo
// se veía con el `<Text>` plano que esto reemplaza — un caracter que el agente nunca quiso como
// marca cambiaría el layout. Escapar ANTES de mandarlo garantiza el mismo resultado visual de
// siempre, y ganamos la selección nativa real (UITextView) sin tocar cómo se ve nada.
export function escapeMarkdownText(text: string): string {
  return text.replace(MARKDOWN_SPECIAL, "\\$&");
}
