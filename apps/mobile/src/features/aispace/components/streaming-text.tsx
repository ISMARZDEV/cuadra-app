import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

interface StreamingTextProps {
  text: string;
  textClassName?: string;
  /** Per-word fade duration (ms). Soft by default for the Cleo/ChatGPT "writing" feel. */
  duration?: number;
}

// One word that fades + rises in once, on mount. Driven by useSharedValue + useAnimatedStyle +
// withTiming (the primitives that work reliably in this app) — NOT reanimated `entering` layout
// animations, which don't fire dependably on the New Architecture here.
function FadingWord({
  word,
  textClassName,
  duration,
}: {
  word: string;
  textClassName?: string;
  duration: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration });
  }, [progress, duration]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 6 }], // subtle rise into place
  }));

  return (
    <Animated.View style={style}>
      {/* selectable: long-press → copy. Each word is its own Text node (per-word fade — cuadra-mobile
          skill §6: wrapping Animated.View, NOT nested inline Text runs, is the only animation shape
          that reliably fires here), so native selection is scoped to ONE word per gesture — dragging
          across word boundaries doesn't extend the selection. Good enough to grab a specific word or
          amount; not a full-paragraph drag-select. */}
      <Text selectable className={textClassName}>{word}{" "}</Text>
    </Animated.View>
  );
}

// Streamed agent text with a soft per-WORD fade-in. As SSE tokens arrive the text grows; only the
// newly-added words mount (React reuses earlier words by key) → only they run their fade. Words are
// wrapping inline views so each can animate independently.
export function StreamingText({ text, textClassName, duration = 600 }: StreamingTextProps) {
  const lines = text.split("\n");
  return (
    <View>
      {lines.map((line, lineIndex) => (
        <View key={lineIndex} className="flex-row flex-wrap">
          {line.split(" ").map((word, wordIndex) => (
            <FadingWord
              key={`${lineIndex}-${wordIndex}`}
              word={word}
              textClassName={textClassName}
              duration={duration}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
