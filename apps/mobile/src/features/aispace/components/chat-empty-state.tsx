import MaskedView from "@react-native-masked-view/masked-view";
import * as Haptics from "expo-haptics";
import {
  BanknoteArrowDown,
  BanknoteArrowUp,
  CirclePlus,
  Eye,
  PiggyBank,
  Scale,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { type ReactNode, useEffect, useState } from "react";
import { type LayoutChangeEvent, Pressable, Text, type TextStyle, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { Icon } from "@/components/ui/icon";
import { t, type TranslationKey, useLang } from "@/i18n";
import { sounds } from "@/lib/sounds";
import { palette } from "@/theme";
import { MONEY_ROLE_COLORS, type MoneyRole } from "@/theme/money-role-colors";

import type { ChatEmptyStateProps } from "../interfaces";

// Gradient text fill: dark right at the top-center of the line, fading lighter toward the LEFT,
// RIGHT, and bottom — i.e. a radial focused at the TOP-center (cy=0), not the geometric middle. A
// plain top-to-bottom linear only faded vertically and missed the side falloff (reference image).
// RadialGradient's default objectBoundingBox units stretch the "circle" to the box's own aspect
// ratio, so on a wide single line this naturally reaches the left/right edges too, not just down.
// RN Text can't take a CSS background-image, so this masks a gradient SVG with the text's own
// glyph shape (MaskedView) — the standard RN gradient-text recipe. `height` should roughly match
// the text's line-height (MaskedView doesn't auto-size to the mask's intrinsic size on Android).
function GradientText({
  children,
  textStyle,
  colors,
  height,
}: {
  children: string;
  textStyle: TextStyle;
  colors: readonly [string, string]; // [focal/top-center, edge]
  height: number;
}) {
  return (
    <MaskedView style={{ height }} maskElement={<Text style={textStyle}>{children}</Text>}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="greetingFade" cx="50%" cy="0%" r="115%">
            <Stop offset="0%" stopColor={colors[0]} />
            <Stop offset="100%" stopColor={colors[1]} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#greetingFade)" />
      </Svg>
    </MaskedView>
  );
}

// Entrance fade+rise, staggered by `delay`. Manual useSharedValue/useAnimatedStyle/withSpring on
// mount — NOT reanimated `entering` presets (cuadra-mobile skill §6: those don't fire reliably on
// the New Architecture here). Same recipe as streaming-text.tsx's FadingWord, proven in this app.
// `style` is merged in (not just wrapped) so a layout prop like `width: "48%"` on the child's own
// container (the 2-col widget grid) still applies to what flex-wrap actually measures.
// `start` gates the whole thing on an external signal (here: "the dock-to-top measurement is
// ready") instead of firing the instant this mounts — see ChatEmptyState's DOCK CHOREOGRAPHY note.
// SAME spring family as WaveIn/the dock below (only damping differs) — mixing a springy parent with
// a linearly-eased child (or vice versa) is what read as "not fluid": one spring vocabulary for the
// whole choreography feels like ONE motion, not several fighting each other.
function FadeInUp({
  delay = 0,
  start = true,
  style,
  children,
}: {
  delay?: number;
  start?: boolean;
  style?: object;
  children: ReactNode;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!start) return;
    progress.value = withDelay(delay, withSpring(1, { damping: 16, stiffness: 170, mass: 0.6 }));
  }, [progress, delay, start]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, progress.value)),
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// The "ola" (wave) entrance — a springy pop with a little overshoot, staggered by `delay`, same
// `start`-gating as FadeInUp. Used for the headline pieces (line 1 as ONE unit — see why below —
// and line 2's two word-groups), so they feel more alive/bouncy than the plain fade the subtitle
// and widgets use; that contrast is deliberate (headline = energetic, body = calm). Same spring
// FAMILY as the dock (below) and FadeInUp — just a touch livelier (lower damping) since these are
// small elements where a bit more bounce reads as playful, not janky.
function WaveIn({
  delay = 0,
  start = true,
  children,
}: {
  delay?: number;
  start?: boolean;
  children: ReactNode;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!start) return;
    progress.value = withDelay(delay, withSpring(1, { damping: 13, stiffness: 170, mass: 0.55 }));
  }, [progress, delay, start]);
  const style = useAnimatedStyle(() => ({
    // withSpring overshoots past 1 (the bounce) — clamp opacity so it never reads as flicker.
    opacity: Math.min(1, Math.max(0, progress.value * 1.25)),
    transform: [{ translateY: (1 - progress.value) * 16 }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

// TODO(chat-home-widgets): this is a FIXED 4-widget placeholder (Figma "What's up"). The real
// feature is a user-configurable CATALOG — the user picks which widgets show here (drag/select,
// like arranging home-screen widgets), capped at 4. Full plan + open questions:
// docs/sdd/chat-home-widgets.md. Do not add more fixed widgets here; extend the catalog instead.
interface Widget {
  id: MoneyRole;
  icon: LucideIcon;
  // Trailing badge — CirclePlus ("add/register a new one") by default; a READ widget (balance) uses
  // Eye ("view") instead, since nothing's being added.
  trailingIcon?: LucideIcon;
  labelKey: TranslationKey;
  promptKey: TranslationKey;
}

// Colors come from the shared MONEY_ROLE_COLORS (src/theme/money-role-colors.ts) — the exact
// Figma pair per money-color role, also used by Insights' Accounts card metric tiles, so the two
// features stay visually identical instead of duplicating hex literals.
const WIDGETS: Widget[] = [
  {
    id: "income",
    icon: BanknoteArrowDown,
    labelKey: "chat.emptyState.income.label",
    promptKey: "chat.emptyState.income.prompt",
  },
  {
    id: "expense",
    icon: BanknoteArrowUp,
    labelKey: "chat.emptyState.expense.label",
    promptKey: "chat.emptyState.expense.prompt",
  },
  {
    id: "savings",
    icon: PiggyBank,
    labelKey: "chat.emptyState.savings.label",
    promptKey: "chat.emptyState.savings.prompt",
  },
  {
    id: "balance",
    icon: Scale,
    trailingIcon: Eye,
    labelKey: "chat.emptyState.balance.label",
    promptKey: "chat.emptyState.balance.prompt",
  },
];

// The leading icon is the SAME size as the trailing CirclePlus badge — visual weight parity,
// neither reads as more important than the other.
const ICON_SIZE = 26;

function WidgetCard({ widget, onSelect }: { widget: Widget; onSelect: (prompt: string) => void }) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  // Theme-inverted (same pattern as dock-interaction-view's pillColors / GlassButton): dark theme
  // keeps the dark card + light accent; light theme SWAPS to a light card + the dark color as the
  // accent, so the pair never washes out against its own theme's background.
  const colors = MONEY_ROLE_COLORS[widget.id];
  const bg = isDark ? colors.dark : colors.light;
  const fg = isDark ? colors.light : colors.dark;
  const handlePress = () => {
    // Same "commit" cue as sending a message / picking a dock option (chat-input-bar.tsx,
    // dock-interaction-view.tsx) — this IS that same action, just via a widget instead of typing.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    sounds.send();
    onSelect(t(widget.promptKey));
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(widget.labelKey).replace("\n", " ")}
      onPress={handlePress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        backgroundColor: bg,
        borderRadius: 20,
        borderCurve: "continuous", // Apple squircle — the only way to get 100% continuous corners in RN
        paddingHorizontal: 14,
        paddingVertical: 14,
      }}
    >
      <Icon as={widget.icon} size={ICON_SIZE} color={fg} />
      <Text style={{ flex: 1, color: fg, fontSize: 12, fontWeight: "500", lineHeight: 13 }}>
        {t(widget.labelKey)}
      </Text>
      <Icon as={widget.trailingIcon ?? CirclePlus} size={ICON_SIZE} color={fg} />
    </Pressable>
  );
}

// DOCK CHOREOGRAPHY — the whole block mounts vertically CENTERED in the scroll viewport (like a
// splash/welcome), then rises to its permanent top-aligned resting spot as the headline waves in —
// one continuous "welcome, then let's work" motion, not two disjoint steps. Needs two measurements
// before it can play without a visible jump: the scroll viewport's height (measured in chat-screen
// and passed down as `viewportHeight`, since this component doesn't own the ScrollView) and this
// block's OWN natural height (measured here via onLayout). Until both are known, the block stays
// mounted-but-invisible (opacity 0) at its natural position — the instant repositioning to
// `centerOffset` happens WHILE still invisible, so nothing visibly jumps; only the subsequent
// center→top slide (opacity 0→1 together) is ever seen. Children's own wave/fade animations are
// gated on the SAME `ready` signal (via `start`) so they don't play out silently before the block
// is even visible — they start the moment the block starts rising, so it reads as one motion.
const DOCK_DURATION = 700;

// Line 2's two "words" (name, then the emoji+"!" cluster) pop in staggered, AFTER line 1 has mostly
// settled. Subtitle/widgets follow with the plain calmer fade, once line 2 has had time to land.
const LINE2_START = 420;
const LINE2_WORD_STAGGER = 130;
const SUBTITLE_START = 950;
const WIDGETS_START = 1050;
const WIDGET_STAGGER = 70;

// Chat's empty state (Figma "What's up") — shown before the first message. `viewportHeight` (the
// scroll viewport's measured height, from chat-screen.tsx) drives the center→top dock animation
// above; omit it (0) to skip the dock and just play the wave/fade in place (e.g. in isolation/tests).
// TODO(chat-home-widgets): `name` is hardcoded per the user's own instruction for this pass ("por
// ahora usa el mío, Ismael"). Wire to the real user's name (identity `getMe().name`, no mobile hook
// for it yet) once that's built — see docs/sdd/chat-home-widgets.md.
export function ChatEmptyState({ onSelect, viewportHeight = 0 }: ChatEmptyStateProps) {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const name = "Ismael"; // TODO(chat-home-widgets): replace with the real signed-in user's name.
  // `t()` reads a plain module-level var (src/i18n), not React state — a component only re-renders
  // (and re-evaluates its t() calls) when SOMETHING reactive it reads changes. This screen doesn't
  // remount on a language change (unlike the tab bar, which re-renders constantly from navigation
  // state), so without this it kept showing whatever language was active at ITS OWN mount — stale.
  // useLang() subscribes DIRECTLY to that module var (useSyncExternalStore, src/i18n) — an earlier
  // fix subscribed to the SEPARATE language-preference store instead (use-language-store.tsx),
  // which calls setLanguage() as a side effect; that indirection didn't reliably reproduce on
  // device (two systems that merely stay in sync vs. subscribing to the actual value read by t()).
  useLang();

  const [contentH, setContentH] = useState(0);
  const [ready, setReady] = useState(false);
  const dockOpacity = useSharedValue(0);
  const dockTranslateY = useSharedValue(0);

  const onContentLayout = (e: LayoutChangeEvent) => {
    if (contentH === 0) setContentH(e.nativeEvent.layout.height);
  };

  useEffect(() => {
    if (ready || contentH === 0) return; // wait for both measurements (viewportHeight may be 0 = "skip dock")
    setReady(true);
    const centerOffset = Math.max(0, (viewportHeight - contentH) / 2);
    dockTranslateY.value = centerOffset; // instant jump — still opacity 0, so invisible
    dockOpacity.value = withTiming(1, { duration: 320 });
    dockTranslateY.value = withTiming(0, { duration: DOCK_DURATION, easing: Easing.out(Easing.cubic) });
  }, [contentH, viewportHeight, ready, dockOpacity, dockTranslateY]);

  const dockStyle = useAnimatedStyle(() => ({
    opacity: dockOpacity.value,
    transform: [{ translateY: dockTranslateY.value }],
  }));

  return (
    <Animated.View onLayout={onContentLayout} style={[{ paddingHorizontal: 16, paddingVertical: 24 }, dockStyle]}>
      <WaveIn delay={0} start={ready}>
        {/* "Hey, What's up" is fixed English in every locale (design call, same as before) — line 1
            bold/36, line 2 medium/32 with the NAME in the lime accent (needs a nested Text for the
            mixed color within one line, same pattern as RichText's inline bold spans). Line 1 fades
            from dark at the top-center OUTWARD — left, right, AND down — to a lighter gray (reference
            image) — dark theme flips the focal color (white↔black), the gray edge stays the same.
            It's ONE wave unit (not per-letter): a per-letter wave would need its OWN gradient mask
            per letter, which breaks the single continuous gradient across the line — see GradientText. */}
        <GradientText
          height={44}
          textStyle={{ fontSize: 36, fontWeight: "800", lineHeight: 38, textAlign: "center" }}
          colors={isDark ? ["#FFFFFF", "#848484"] : ["#000000", "#848484"]}
        >
          {t("chat.emptyState.greetingLine1")}
        </GradientText>
      </WaveIn>
      <View className="mb-2 flex-row justify-center">
        <WaveIn delay={LINE2_START} start={ready}>
          <Text className="text-text" style={{ fontSize: 32, fontWeight: "500", lineHeight: 34, color: palette.accent }}>
            {name}
          </Text>
        </WaveIn>
        <WaveIn delay={LINE2_START + LINE2_WORD_STAGGER} start={ready}>
          <Text className="text-text" style={{ fontSize: 32, fontWeight: "500", lineHeight: 34 }}>
            {" "}😃💸👋!
          </Text>
        </WaveIn>
      </View>
      <FadeInUp delay={SUBTITLE_START} start={ready}>
        <Text className="mb-5 text-center text-lg text-text">{t("chat.emptyState.subtitle")}</Text>
      </FadeInUp>

      <View className="flex-row flex-wrap justify-between gap-y-3">
        {WIDGETS.map((widget, i) => (
          // Cascade — each card a beat after the last, so the grid reads as one wave, not a snap-in.
          // width:"48%" lives HERE (not on the Pressable inside) — flex-wrap measures this wrapper.
          <FadeInUp
            key={widget.id}
            delay={WIDGETS_START + i * WIDGET_STAGGER}
            start={ready}
            style={{ width: "48%" }}
          >
            <WidgetCard widget={widget} onSelect={onSelect} />
          </FadeInUp>
        ))}
      </View>
    </Animated.View>
  );
}
