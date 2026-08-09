import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { CHAT_BODY } from "../chat-typography";

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
    // `Easing.out`: la palabra aparece de inmediato y ASIENTA suave. La curva por defecto es
    // in-out, que arranca lenta — con los tokens llegando encima, eso dejaba muchas palabras a
    // medio camino a la vez y el párrafo se veía turbio en vez de escribiéndose.
    progress.value = withTiming(1, { duration, easing: Easing.out(Easing.quad) });
  }, [progress, duration]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    // Un desplazamiento MÍNIMO. Con 6px y varias palabras animando a la vez, la línea entera
    // parecía temblar; a 2px se percibe como que el texto se asienta, no como que salta.
    transform: [{ translateY: (1 - progress.value) * 2 }],
  }));

  return (
    <Animated.View style={style}>
      {/* selectable: long-press → copy. Each word is its own Text node (per-word fade — cuadra-mobile
          skill §6: wrapping Animated.View, NOT nested inline Text runs, is the only animation shape
          that reliably fires here), so native selection is scoped to ONE word per gesture — dragging
          across word boundaries doesn't extend the selection. Good enough to grab a specific word or
          amount; not a full-paragraph drag-select. */}
      <Text selectable className={textClassName ?? ""} style={CHAT_BODY}>{word}{" "}</Text>
    </Animated.View>
  );
}

// Streamed agent text with a soft per-WORD fade-in. As SSE tokens arrive the text grows; only the
// newly-added words mount (React reuses earlier words by key) → only they run their fade. Words are
// wrapping inline views so each can animate independently.
// 600ms era DEMASIADO para un stream: los tokens llegan cada pocas decenas de ms, así que había
// permanentemente una docena de palabras a medio fundir y el resultado se leía borroso. A 300 cada
// palabra termina antes de que lleguen las siguientes y se percibe una tras otra — escribiendo.
export function StreamingText({ text, textClassName, duration = 300 }: StreamingTextProps) {
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
