import { Pressable, Text, View } from "react-native";
import { type Href, useRouter } from "expo-router";
import { useColorScheme } from "nativewind";

import { StreamingText } from "./streaming-text";

// Live agent message — full-width, left-aligned reply whose words fade in softly as the SSE tokens
// stream (Cleo-style "writing" feel). When `href` is set the message is a tappable DEEP LINK instead
// (underlined lime, e.g. "Ver en Insight" → Insights, Img 11) — rendered statically, no per-word fade.
export function AgentMessage({ text, href }: { text: string; href?: string }) {
  const router = useRouter();
  const { colorScheme } = useColorScheme();

  if (href) {
    // Readable lime: brand lime on dark, deeper green on the off-white (pure lime washes out on light).
    const linkColor = colorScheme === "dark" ? "#C2FB7E" : "#16A34A";
    const path = (href.startsWith("/") ? href : `/${href}`) as Href;
    return (
      <View className="w-full px-3 py-2">
        <Pressable accessibilityRole="link" onPress={() => router.push(path)}>
          <Text
            className="text-lg font-semibold leading-6 underline"
            style={{ color: linkColor }}
          >
            {text}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="w-full px-3 py-2">
      <StreamingText text={text} textClassName="text-lg leading-6 text-text" />
    </View>
  );
}
