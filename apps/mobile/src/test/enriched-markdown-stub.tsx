import { Text } from "react-native";

// react-native-enriched-markdown → stub: su entry `main` re-exporta directo `./native/...` (un
// componente Fabric con código generado que vitest/esbuild no puede parsear — mismo motivo que los
// stubs de reanimated/legend-list-keyboard/keyboard-controller de este mismo archivo de config).
//
// Deshace `chat-markdown.ts#escapeMarkdownText` antes de pintar: sin esto, un texto con puntuación
// (p. ej. "Bravo.") llegaría acá ya escapado ("Bravo\.") y las aserciones de texto de los tests
// dejarían de encontrar el string original. Espeja lo que el `UITextView` real termina mostrando
// (los caracteres literales, nunca la barra de escape) — no es sólo una comodidad de test.
const UNESCAPE_RE = /\\([\\`*_{}[\]()#+\-.!>])/g;

export function EnrichedMarkdownText({ markdown }: { markdown: string }) {
  return <Text selectable>{markdown.replace(UNESCAPE_RE, "$1")}</Text>;
}
