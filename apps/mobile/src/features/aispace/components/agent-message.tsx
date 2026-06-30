import { Pressable, Text, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { StreamingText } from "./streaming-text";

// Render **bold** spans inside a line.
function inlineBold(line: string) {
  return line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <Text key={i} style={{ fontWeight: "800" }}>
        {part.slice(2, -2)}
      </Text>
    ) : (
      part
    ),
  );
}

// Coach-style reply (Img 21): a bold surprised opener on its own line (e.g. "**Wow!!! 🫣**") rendered
// as a big heading, then normal-text coaching lines. A whole-line **…** is the heading; inline **…**
// stays bold at body size. Used only when the message carries markdown — plain streamed replies keep
// the per-word fade.
function RichText({ text }: { text: string }) {
  return (
    <View>
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <View key={i} style={{ height: 6 }} />;
        if (/^\*\*[^*]+\*\*$/.test(trimmed)) {
          return (
            <Text key={i} className="mb-1 text-text" style={{ fontSize: 24, fontWeight: "800", lineHeight: 30 }}>
              {trimmed.slice(2, -2)}
            </Text>
          );
        }
        return (
          <Text key={i} className="text-lg leading-6 text-text">
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
export function AgentMessage({ text, href }: { text: string; href?: string }) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();

  if (href) {
    const linkColor = colorScheme === "dark" ? "#C2FB7E" : "#16A34A";
    const path = (href.startsWith("/") ? href : `/${href}`) as Href;
    return (
      <View className="w-full px-3 py-2">
        <Pressable accessibilityRole="link" onPress={() => router.push(path)}>
          <Text className="text-lg font-semibold leading-6 underline" style={{ color: linkColor }}>
            {text}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="w-full px-3 py-2">
      {text.includes("**") ? (
        <RichText text={text} />
      ) : (
        <StreamingText text={text} textClassName="text-lg leading-6 text-text" />
      )}
    </View>
  );
}
