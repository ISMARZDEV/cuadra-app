import { useCallback, useEffect, useRef } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { useColorScheme } from "nativewind";

import { GlassSurface } from "@/components/ui/glass-surface";
import {
  NAVBAR_CIRCLE,
  NAVBAR_VIEWBOX,
} from "@/components/navigation/notched-glass";
import { useOrbStore } from "@/store/orb-store";

import { AgentBubble } from "./components/agent-bubble";
import { ChatHeader } from "./components/chat-header";
import { ChatInputBar } from "./components/chat-input-bar";
import { ReceiptAttachment } from "./components/receipt-attachment";
import { UserBubble } from "./components/user-bubble";
import { CHAT_THREAD } from "./mock";

// SVG gradient overlay — Figma "Siri AI" card: dark 85% at top → 18% at bottom.
function CardGradient({ isDark }: { isDark: boolean }) {
  const color = isDark ? "#000000" : "#ffffff";
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      preserveAspectRatio="none"
      pointerEvents="none"
    >
      <Defs>
        <LinearGradient id="chatCardGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity="1" />
          <Stop offset="0.27" stopColor={color} stopOpacity="0.84" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#chatCardGrad)" />
    </Svg>
  );
}

// Keyboard events — WillShow/Hide on iOS for smooth sync, Did on Android.
const KB_SHOW = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
const KB_HIDE = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

// AISpace chat screen — Figma "Aispace Chat" (node 178:5090).
//
// Bottom margin is animated between three states without squishing the card:
//   • Orb hidden  → card sits 18px above the bar body top.
//   • Orb active  → card rises to clear the orb sphere.
//   • Keyboard open → card rises to sit flush on the keyboard (fills all available space).
//
// We drive this manually via Keyboard.addListener instead of KeyboardAvoidingView so the
// card SLIDES UP intact rather than being squished from the bottom.
export function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";
  const orbActive = useOrbStore((s) => s.active);
  const scrollRef = useRef<ScrollView>(null);

  // ── Navbar geometry (mirrors cuadra-tab-bar.tsx) ──────────────────────────
  const barWidth = Math.min(width - 24, 380);
  const navScale = barWidth / NAVBAR_VIEWBOX.width;
  const navHeight = NAVBAR_VIEWBOX.height * navScale;
  const navBottomPad = Math.max((insets.bottom || 12) - 16, 6) + 14;

  // Orb hidden: card bottom sits 18px above the bar body top (gives a visible gap).
  const barBodyHeight = navHeight * 0.54;
  const marginHidden = navBottomPad + barBodyHeight + 18;

  // Orb active: card clears the orb sphere (which can stick above the composition).
  const orbOvalWidth = NAVBAR_CIRCLE.r * 2 * navScale * 1.35;
  const orbOvalHeight = orbOvalWidth * 0.86;
  const orbTopInComp = NAVBAR_CIRCLE.cy * navScale - orbOvalHeight / 2; // may be negative
  const marginActive = navBottomPad + navHeight - orbTopInComp + 14;

  // ── Animated values ───────────────────────────────────────────────────────
  const lift = useSharedValue(orbActive ? 1 : 0);
  const keyboardH = useSharedValue(0);

  // Natural ease-out curve — matches iOS system transitions (no bounce, no overshoot).
  const EASE_OUT = Easing.out(Easing.cubic);

  useEffect(() => {
    lift.value = withTiming(orbActive ? 1 : 0, {
      duration: 300,
      easing: EASE_OUT,
    });
  }, [orbActive, lift]);

  // Keep the latest message pinned to the bottom (WhatsApp/ChatGPT behaviour). Called on every
  // content/viewport change AND when the keyboard finishes animating, so the freshest messages
  // are never hidden behind the input as the scroll viewport shrinks.
  const scrollToBottom = useCallback((animated = false) => {
    scrollRef.current?.scrollToEnd({ animated });
  }, []);

  useEffect(() => {
    const onShow = Keyboard.addListener(KB_SHOW, (e) => {
      // iOS reports the keyboard's own animation duration in the event — use it so the card
      // slides up in perfect sync with the keyboard.
      const dur = e.duration > 0 ? e.duration : 250;
      keyboardH.value = withTiming(e.endCoordinates.height, {
        duration: dur,
        easing: EASE_OUT,
      });
      // Pin to the bottom RIGHT AFTER the viewport finishes shrinking (a single early scroll fires
      // before there's any scroll range and ends up a no-op, leaving recent messages hidden).
      // onLayout/onContentSizeChange handle the in-between frames; this settles the final position.
      setTimeout(() => scrollToBottom(true), dur + 20);
    });
    const onHide = Keyboard.addListener(KB_HIDE, (e) => {
      const dur = e.duration > 0 ? e.duration : 250;
      keyboardH.value = withTiming(0, { duration: dur, easing: EASE_OUT });
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [keyboardH, scrollToBottom]);

  // marginBottom = max(orb margin, keyboard height + gap).
  // When the keyboard is open it always wins; the gap keeps the card from sitting flush on the
  // keyboard (a small breathing space, like WhatsApp/iMessage).
  const KEYBOARD_GAP = 12;
  const shadowStyle = useAnimatedStyle(() => {
    const orbMargin = marginHidden + lift.value * (marginActive - marginHidden);
    const kbMargin = keyboardH.value > 0 ? keyboardH.value + KEYBOARD_GAP : 0;
    return { marginBottom: kbMargin > orbMargin ? kbMargin : orbMargin };
  });

  return (
    // Tap anywhere outside the input (empty card areas) dismisses the keyboard on any device.
    // The ScrollView below uses keyboardShouldPersistTaps="handled" so taps on the message area
    // dismiss too, while the input's own Pressable keeps focusing on a single tap.
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Shadow holder — no overflow:hidden on iOS or shadows are clipped. */}
      <Animated.View style={[styles.shadowWrap, shadowStyle]}>
        {/* Liquid Glass card with gradient border: iOS 26 → GlassView, older/Android → BlurView + SquircleView + gradient border. */}
        <GlassSurface
          style={[StyleSheet.absoluteFill, { borderRadius: 48 }]}
          intensity={5}
          borderWidth={5.5}
        >
          {/* Clips children to the 48px card radius. */}
          <View style={styles.cardClip}>
            {/* Gradient overlay — sits above blur, below content. */}
            <CardGradient isDark={isDark} />

            <ChatHeader />
            <ScrollView
              ref={scrollRef}
              className="flex-1"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              onScrollBeginDrag={Keyboard.dismiss}
              // Pin to the latest message: on mount, when the viewport resizes (keyboard open/close),
              // and whenever content grows (a message is sent) — so recent messages stay visible.
              onLayout={() => scrollToBottom(false)}
              onContentSizeChange={() => scrollToBottom(false)}
            >
              {CHAT_THREAD.map((item) => {
                switch (item.kind) {
                  case "agent":
                    return (
                      <AgentBubble
                        key={item.id}
                        title={item.title}
                        segments={item.segments}
                      />
                    );
                  case "user":
                    return <UserBubble key={item.id} text={item.text} />;
                  case "receipt":
                    return <ReceiptAttachment key={item.id} />;
                }
              })}
            </ScrollView>

            <ChatInputBar />
          </View>
        </GlassSurface>
      </Animated.View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    flex: 1,
    marginHorizontal: 10,
    marginTop: 4,
    borderRadius: 48,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 25,
    elevation: 10,
  },
  cardClip: {
    flex: 1,
    borderRadius: 48,
    overflow: "hidden",
  },
});
