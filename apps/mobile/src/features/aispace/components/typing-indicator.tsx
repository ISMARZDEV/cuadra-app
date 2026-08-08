import { useEffect, useState } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import {
  MessageSquareText,
  PackageSearch,
  Search,
  Sparkles,
  Telescope,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";

import { Icon } from "@/components/ui/icon";
import { t, type TranslationKey, useLang } from "@/i18n";

import { ChatStatus } from "../enums";
import type { TypingIndicatorProps } from "../interfaces";
import { useStatusSequence } from "../use-status-sequence";
import { ShimmerText } from "./shimmer-text";

// Wait before showing, so the indicator's entrance lands just after the sent message's own
// entrance (user-bubble.tsx, spring). Only the RISING edge waits; hiding stays instant (below).
const ENTER_DELAY_MS = 450;

const LABEL_SIZE = 18; // matches the chat's `text-lg`, so the status reads as part of the thread
const ICON_SIZE = 17;

// Each status owns its icon and label. Sparkles is FILLED — it's the "the model itself is working"
// state, and a solid glyph reads as active next to the outline icons (which stand for work on
// something external: looking something up, checking it, reading it).
const STATUS_META: Record<
  ChatStatus,
  { icon: LucideIcon; labelKey: TranslationKey; filled: boolean }
> = {
  [ChatStatus.Thinking]: {
    icon: Sparkles,
    labelKey: "chat.status.thinking",
    filled: true,
  },
  [ChatStatus.Reasoning]: {
    icon: MessageSquareText,
    labelKey: "chat.status.reasoning",
    filled: false,
  },
  [ChatStatus.Searching]: {
    icon: Search,
    labelKey: "chat.status.searching",
    filled: false,
  },
  [ChatStatus.Validating]: {
    icon: Telescope,
    labelKey: "chat.status.validating",
    filled: false,
  },
  [ChatStatus.Analyzing]: {
    icon: PackageSearch,
    labelKey: "chat.status.analyzing",
    filled: false,
  },
};

// Status line shown while a turn is in flight but the agent hasn't produced anything yet (use-chat
// `isThinking`). An icon plus a label whose glyphs are swept by a bright band (shimmer-text.tsx).
// The whole group fades + scales in when it appears and fades out when it leaves — we keep it
// mounted for the fade-out (deferred unmount via setTimeout, NOT runOnJS) so BOTH transitions read
// smoothly and hand off to the first agent word.
export function TypingIndicator({
  visible,
  status = ChatStatus.Thinking,
  random,
}: TypingIndicatorProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  // Same muted tone the old three dots used, with the sweep landing near the chat's own text colour
  // — bright enough to read as a highlight, never brighter than the reply that follows it.
  const baseColor = isDark ? "#9CA3AF" : "#6B7280";
  const highlightColor = isDark ? "#F3F4F6" : "#111827";

  // `rendered` keeps the node alive through the exit fade after `visible` flips false.
  const [rendered, setRendered] = useState(visible);
  const enter = useSharedValue(visible ? 1 : 0);

  // Lo que se MUESTRA no es el estado crudo del backend: es el paso de la secuencia (Buscando… →
  // Validando… → Analizando…, o el vaivén Pensando…/Razonando…). Se congela cuando el indicador no
  // está en pantalla para no dejar timers corriendo detrás de nada.
  const step = useStatusSequence(status, rendered, random);
  const { icon, labelKey, filled } = STATUS_META[step];

  useEffect(() => {
    if (visible) {
      // Delayed on purpose (see ENTER_DELAY_MS) — if `visible` flips back to false before this
      // fires, the effect's cleanup below cancels it, so a reply that lands fast never flashes
      // the indicator at all.
      const id = setTimeout(() => {
        setRendered(true);
        enter.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.quad) });
      }, ENTER_DELAY_MS);
      return () => clearTimeout(id);
    }
    enter.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.quad) });
    const id = setTimeout(() => setRendered(false), 180);
    return () => clearTimeout(id);
  }, [visible, enter]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: enter.value,
    transform: [{ scale: 0.9 + enter.value * 0.1 }],
  }));

  if (!rendered) return null;

  return (
    <View className="w-full px-3 py-2">
      <Animated.View
        accessibilityLabel={t("chat.a11y.loading")}
        className="flex-row items-center"
        style={[{ gap: 6 }, containerStyle]}
      >
        <Icon as={icon} size={ICON_SIZE} color={baseColor} fill={filled ? baseColor : undefined} />
        <ShimmerText
          text={t(labelKey)}
          fontSize={LABEL_SIZE}
          baseColor={baseColor}
          highlightColor={highlightColor}
        />
      </Animated.View>
    </View>
  );
}
