import { memo } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { EnrichedMarkdownText } from "react-native-enriched-markdown";

import { chatMarkdownStyle, escapeMarkdownText } from "../chat-markdown";
import { CHAT_BODY, CHAT_STRONG } from "../chat-typography";
import { MessageActions } from "./message-actions";
import { StreamingText } from "./streaming-text";

// El menú nativo de selección trae "Copy as Markdown" de fábrica — tiene sentido en un editor de
// markdown, no acá: este chat nunca le muestra al usuario la sintaxis cruda (es justo lo que
// `hasRichMarkup`/`RichText` evitan), así que ofrecer "copiar como markdown" sería exponer un
// concepto que el resto de la pantalla se esfuerza en ocultar.
const SELECTION_MENU = { copyAsMarkdown: { enabled: false }, copyImageUrl: { enabled: false } };

// Render **bold** spans inside a line.
function inlineBold(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <Text key={i} style={CHAT_STRONG}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

// La gramática que el agente puede escribir. Es MÍNIMA a propósito: cada marca nueva es una forma
// más de que el usuario vea sintaxis cruda si el render falla.
//
//   **Titular**   línea entera → el opener grande del coach de finanzas (Img 21)
//   ## Sección    línea entera → subtítulo de datos (el nombre de una tienda)
//   - item        viñeta
//   **inline**    negrita dentro de una línea
//
// Por qué `##` y no reusar `**Tienda**`: una línea entera en negrita YA significaba «titular a
// 24px». Reusarla para el nombre de una tienda haría que un mismo token nombrara dos cosas y
// ninguna quedaría bien — el nombre de la tienda saldría gigante, o el titular del coach chico.
const HEADLINE = /^\*\*[^*]+\*\*$/;
const SECTION = /^##\s+(.+)$/;
const BULLET = /^[-•]\s+(.+)$/;

export const hasRichMarkup = (text: string) =>
  text.includes("**") || /^##\s+/m.test(text) || /^[-•]\s+/m.test(text);

// Coach-style reply (Img 21): a bold surprised opener on its own line (e.g. "**Wow!!! 🫣**") rendered
// as a big heading, then normal-text coaching lines. Save's comparisons add `## store` sections and
// `- ` bullets so 3 stores × 4 figures stop arriving as one paragraph. Plain replies without any
// markup keep the per-word fade.
function RichText({ text }: { text: string }) {
  return (
    <View>
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 8 }} />;

        if (HEADLINE.test(trimmed)) {
          return (
            <Text
              key={i}
              selectable
              className="mb-1 text-text"
              style={[CHAT_STRONG, { fontSize: 24, lineHeight: 30 }]}
            >
              {trimmed.slice(2, -2)}
            </Text>
          );
        }

        const section = SECTION.exec(trimmed);
        if (section) {
          return (
            <Text
              key={i}
              selectable
              className="mb-0.5 mt-3 text-text"
              style={[CHAT_STRONG, { fontSize: 18, lineHeight: 24 }]}
            >
              {section[1]}
            </Text>
          );
        }

        const bullet = BULLET.exec(trimmed);
        if (bullet) {
          return (
            // Sangría colgante: la 2ª línea de una viñeta larga alinea con el texto, no con el punto.
            <View key={i} className="flex-row pr-2">
              <Text className="text-text" style={[CHAT_BODY, { width: 16 }]}>
                {"•"}
              </Text>
              <Text selectable className="flex-1 text-text" style={CHAT_BODY}>
                {inlineBold(bullet[1])}
              </Text>
            </View>
          );
        }

        return (
          <Text key={i} selectable className="text-text" style={CHAT_BODY}>
            {inlineBold(line)}
          </Text>
        );
      })}
    </View>
  );
}

// Live agent message — full-width, left-aligned reply. Plain replies fade in per word as the SSE
// tokens stream (Cleo "writing" feel). A reply with markdown (the finance coach reaction) renders
// rich: bold heading opener + normal coaching text. An `href` makes it a tappable deep link
// (underlined lime → Insights, Img 11).
// MEMOIZADO: es una fila de la lista del chat. Sin esto, cualquier re-render de `chat-screen`
// re-renderiza TODAS las filas de la conversación — el coste crece con el largo del historial.
function AgentMessageBase({
  text,
  href,
  showActions = false,
}: {
  text: string;
  href?: string;
  showActions?: boolean;
}) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();

  if (href) {
    const linkColor = colorScheme === "dark" ? "#C2FB7E" : "#16A34A";
    // Un mismo campo lleva DOS destinos distintos: "insights" es una ruta interna de expo-router,
    // pero un enlace de tienda de Save es http(s) y hay que SALIR al navegador. Sin distinguir,
    // `router.push("/https://sirena…")` no lleva a ninguna parte.
    const isExternal = /^https?:\/\//i.test(href);
    const open = isExternal
      ? () => void Linking.openURL(href)
      : () => router.push((href.startsWith("/") ? href : `/${href}`) as Href);
    return (
      <View className="w-full px-3 py-2">
        <Pressable accessibilityRole="link" onPress={open}>
          <Text className="underline" style={[CHAT_STRONG, { color: linkColor }]}>
            {text}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="w-full px-3 py-2">
      {hasRichMarkup(text) ? (
        <RichText text={text} />
      ) : showActions ? (
        // Terminó el streaming (misma señal que destapa la fila de acciones): pasar de las
        // palabras sueltas de StreamingText a `EnrichedMarkdownText`. Cada palabra en su propio
        // <Text> es lo que hace posible el fade, pero el `<Text selectable>` de RN —con una
        // palabra por nodo o con el párrafo entero en uno solo, da igual— vive sobre `UILabel`
        // en iOS, que SÓLO sabe "seleccionar todo": no hay arrastre para armar una frase (RN
        // #22458/#13938/#54686). `EnrichedMarkdownText` reemplaza ese motor por `UITextView`, que
        // sí lo soporta — confirmado contra su fuente (`EnrichedMarkdownText.mm` conforma
        // `UITextViewDelegate`) y contra el demo de referencia funcionando en el device.
        // `escapeMarkdownText`: este texto YA se decidió plano (`hasRichMarkup` dio false), pero
        // un parser de CommonMark de verdad no lo sabe — sin escapar, un "1. algo" se volvería
        // lista numerada y un "$10_000" ganaría cursiva. Escapado, se ve IDÉNTICO a como se veía
        // con el `<Text>` que reemplaza.
        <EnrichedMarkdownText
          markdown={escapeMarkdownText(text)}
          markdownStyle={chatMarkdownStyle(colorScheme === "dark")}
          selectionMenuConfig={SELECTION_MENU}
        />
      ) : (
        <StreamingText text={text} textClassName="text-text" />
      )}
      {/* Sólo cuando el turno TERMINÓ: una fila de acciones asomando mientras el texto todavía
          crece empujaría el layout en cada token, y además ofrecería copiar media respuesta. */}
      {showActions ? <MessageActions text={text} /> : null}
    </View>
  );
}
export const AgentMessage = memo(AgentMessageBase);
