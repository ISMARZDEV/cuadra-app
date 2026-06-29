import { Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

interface StreamingTextProps {
  text: string;
  textClassName?: string;
  /** Per-word fade duration (ms). Soft by default for the Cleo/ChatGPT "writing" feel. */
  duration?: number;
}

// Streamed agent text with a soft per-WORD fade-in. As SSE tokens arrive the text grows; only the
// newly-added words mount, so only they animate (earlier words stay put — React reuses them by
// key). Words are laid out as wrapping inline views: reanimated `entering` fires reliably on a
// mounting <Animated.View>, whereas animating nested inline <Text> runs does not on native.
export function StreamingText({ text, textClassName, duration = 400 }: StreamingTextProps) {
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((line, lineIndex) => (
        <View key={lineIndex} className="flex-row flex-wrap">
          {line.split(" ").map((word, wordIndex) => (
            <Animated.View key={`${lineIndex}-${wordIndex}`} entering={FadeIn.duration(duration)}>
              <Text className={textClassName}>{word}{" "}</Text>
            </Animated.View>
          ))}
        </View>
      ))}
    </View>
  );
}
