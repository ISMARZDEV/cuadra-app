import { useEffect, useRef } from "react";
import {
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
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

  useEffect(() => {
    const onShow = Keyboard.addListener(KB_SHOW, (e) => {
      // iOS reports the keyboard's own animation duration in the event — use it so the card
      // slides up in perfect sync with the keyboard.
      const dur = e.duration > 0 ? e.duration : 250;
      keyboardH.value = withTiming(e.endCoordinates.height, {
        duration: dur,
        easing: EASE_OUT,
      });
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
    });
    const onHide = Keyboard.addListener(KB_HIDE, (e) => {
      const dur = e.duration > 0 ? e.duration : 250;
      keyboardH.value = withTiming(0, { duration: dur, easing: EASE_OUT });
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [keyboardH]);

  // marginBottom = max(orb margin, keyboard height).
  // When the keyboard is open it always wins because it's ~291 px vs ~100-165 px for the orb.
  const shadowStyle = useAnimatedStyle(() => {
    const orbMargin = marginHidden + lift.value * (marginActive - marginHidden);
    const kbMargin = keyboardH.value;
    return { marginBottom: kbMargin > orbMargin ? kbMargin : orbMargin };
  });

  return (
    <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Background color squares to test liquid glass blur effect */}
      <View
        style={{
          position: "absolute",
          top: 80,
          left: 20,
          width: 120,
          height: 120,
          backgroundColor: "#FF6B6B",
          borderRadius: 16,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 160,
          right: 30,
          width: 100,
          height: 100,
          backgroundColor: "#4ECDC4",
          borderRadius: 16,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 200,
          left: 40,
          width: 90,
          height: 90,
          backgroundColor: "#FFE66D",
          borderRadius: 16,
        }}
      />
      <View
        style={{
          position: "absolute",
          bottom: 280,
          right: 50,
          width: 110,
          height: 110,
          backgroundColor: "#95E1D3",
          borderRadius: 16,
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 300,
          left: "50%",
          width: 80,
          height: 80,
          backgroundColor: "#F38181",
          borderRadius: 16,
        }}
      />

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
