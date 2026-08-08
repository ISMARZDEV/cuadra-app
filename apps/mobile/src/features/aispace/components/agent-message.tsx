import { Linking, Pressable, Text, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { CHAT_BODY, CHAT_STRONG } from "../chat-typography";
import { MessageActions } from "./message-actions";
import { StreamingText } from "./streaming-text";

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
              style={[CHAT_STRONG, { fontSize: 17, lineHeight: 22 }]}
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
              <Text className="text-lg leading-6 text-text" style={[CHAT_BODY, { width: 16 }]}>
                {"•"}
              </Text>
              <Text selectable className="flex-1 text-lg leading-6 text-text" style={CHAT_BODY}>
                {inlineBold(bullet[1])}
              </Text>
            </View>
          );
        }

        return (
          <Text key={i} selectable className="text-lg leading-6 text-text" style={CHAT_BODY}>
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
export function AgentMessage({
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
          <Text className="text-lg leading-6 underline" style={[CHAT_STRONG, { color: linkColor }]}>
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
      ) : (
        <StreamingText text={text} textClassName="text-lg leading-6 text-text" />
      )}
      {/* Sólo cuando el turno TERMINÓ: una fila de acciones asomando mientras el texto todavía
          crece empujaría el layout en cada token, y además ofrecería copiar media respuesta. */}
      {showActions ? <MessageActions text={text} /> : null}
    </View>
  );
}
