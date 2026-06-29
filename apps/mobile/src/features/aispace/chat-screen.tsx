import { useCallback, useEffect, useRef } from "react";
import {
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
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
import { useDrawer } from "@/store/drawer-store";

import { AgentBubble } from "./components/agent-bubble";
import { ChatHeader } from "./components/chat-header";
import { ChatInputBar } from "./components/chat-input-bar";
import { ChatSessionsSidebar } from "./components/chat-sessions-sidebar";
import { ConfirmActionCard } from "./components/confirm-action-card";
import { UserBubble } from "./components/user-bubble";
import { ChatRole } from "./enums";
import { useChat } from "./use-chat";

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

  // Live chat — streams turns from the agent (SSE) and stages HITL writes (§7.4).
  const chat = useChat();

  // ── Sessions drawer ───────────────────────────────────────────────────────
  // Swipe the chat aside (or tap the header menu) to reveal the sessions sidebar. The chat card
  // slides ~80% to the right + scales down a touch; the sidebar parallaxes in behind it; the tab
  // bar slides down (handled in cuadra-tab-bar.tsx). All off the shared `drawerProgress` (0→1).
  const { progress: drawerProgress, open: drawerOpen, setOpen: setDrawerOpen } = useDrawer();
  const chatInputRef = useRef<TextInput>(null);
  const restoreKbRef = useRef(false);
  const OPEN_X = width * 0.8; // how far the chat slides → leaves a ~20% sliver (like the reference)
  const SIDEBAR_W = width * 0.82;
  const openXRef = useRef(OPEN_X);
  openXRef.current = OPEN_X;
  const dragStart = useRef(0);

  const trackDrag = (dx: number) => {
    drawerProgress.value = Math.min(1, Math.max(0, dragStart.current + dx / openXRef.current));
  };
  const settleDrag = (vx: number) => {
    const p = drawerProgress.value;
    setDrawerOpen(vx > 0.4 ? true : vx < -0.4 ? false : p > 0.5);
  };

  // Pan on the card itself. Uses the CAPTURE phase so it intercepts clearly-horizontal drags BEFORE
  // the inner ScrollView grabs them (bubble-phase PanResponder loses to a native ScrollView).
  // Vertical drags fail the check → scrolling still works.
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > Math.abs(g.dy) * 1.4 && Math.abs(g.dx) > 14,
      onPanResponderGrant: () => {
        dragStart.current = drawerProgress.value;
      },
      onPanResponderMove: (_, g) => trackDrag(g.dx),
      onPanResponderRelease: (_, g) => settleDrag(g.vx),
      onPanResponderTerminate: () => settleDrag(0),
    }),
  ).current;

  // LEFT-EDGE pan catcher — the card has a 10px side margin, so an edge swipe never reaches the card
  // pan above. This thin strip on the very left edge CLAIMS on touch start (nothing interactive sits
  // there) so a rightward edge-swipe always opens the drawer (ChatGPT/iOS drawer gesture), with no
  // competition from the ScrollView.
  const edgePanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = drawerProgress.value;
      },
      onPanResponderMove: (_, g) => trackDrag(g.dx),
      onPanResponderRelease: (_, g) => settleDrag(g.vx),
      onPanResponderTerminate: () => settleDrag(0),
    }),
  ).current;

  // Reset the drawer when the screen unmounts so the tab bar never stays hidden.
  useEffect(() => () => setDrawerOpen(false), [setDrawerOpen]);

  // Keyboard ↔ drawer: if you were typing and open the drawer, hide the keyboard; when you come back
  // (close the drawer or pick a session) restore the keyboard so you continue where you left off.
  useEffect(() => {
    if (drawerOpen) {
      restoreKbRef.current = chatInputRef.current?.isFocused() ?? false;
      if (restoreKbRef.current) Keyboard.dismiss();
    } else if (restoreKbRef.current) {
      restoreKbRef.current = false;
      const id = setTimeout(() => chatInputRef.current?.focus(), 280);
      return () => clearTimeout(id);
    }
  }, [drawerOpen]);

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
    const closedMargin = kbMargin > orbMargin ? kbMargin : orbMargin;
    const p = drawerProgress.value;
    // As the drawer opens, the card slides right AND grows DOWN into the (now hidden) navbar's
    // space — same progress, so it's one coordinated motion, not navbar-then-card.
    // NOTE: translateX ONLY — do NOT add a `scale` here. The card holds native iOS-26 GlassViews
    // (the card border + the header glass buttons); scaling a GlassView makes iOS stretch the
    // rasterised liquid-glass, which saturates the tint and shows a distorted texture during the
    // animation. Translation is safe; scaling is not.
    return {
      marginBottom: closedMargin + (navBottomPad - closedMargin) * p,
      transform: [{ translateX: p * OPEN_X }],
    };
  });

  // Sidebar: parallaxes in from the left and fades up. Opacity ramps faster than the slide so it's
  // already visible while the chat is still moving (appears WITH the navbar hiding, not after).
  const sidebarStyle = useAnimatedStyle(() => {
    const p = drawerProgress.value;
    return { opacity: Math.min(1, p * 1.8), transform: [{ translateX: (1 - p) * -28 }] };
  });

  return (
    // Tap anywhere outside the input (empty card areas) dismisses the keyboard on any device.
    // The ScrollView below uses keyboardShouldPersistTaps="handled" so taps on the message area
    // dismiss too, while the input's own Pressable keeps focusing on a single tap.
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView className="flex-1" edges={["top"]}>
      {/* Sessions sidebar — sits behind the card on the left, revealed as the chat slides away. */}
      <Animated.View
        pointerEvents={drawerOpen ? "auto" : "none"}
        style={[{ position: "absolute", left: 0, top: 0, bottom: 0, width: SIDEBAR_W }, sidebarStyle]}
      >
        <ChatSessionsSidebar />
      </Animated.View>

      {/* Shadow holder — no overflow:hidden on iOS or shadows are clipped. Horizontal pan here
          drives the drawer; the gesture only claims clearly-horizontal drags so vertical scroll
          still works. */}
      <Animated.View style={[styles.shadowWrap, shadowStyle]} {...panResponder.panHandlers}>
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
              {chat.messages.map((m) =>
                m.role === ChatRole.User ? (
                  <UserBubble key={m.id} text={m.text} />
                ) : (
                  <AgentBubble key={m.id} segments={[{ text: m.text }]} />
                ),
              )}
            </ScrollView>

            {/* HITL (§7.4): a staged write awaits confirmation before /chat/resume runs it. */}
            {chat.pending ? (
              <ConfirmActionCard
                summary={chat.pending.summary ?? ""}
                onConfirm={() => chat.confirm(true)}
                onCancel={() => chat.confirm(false)}
              />
            ) : null}

            <ChatInputBar inputRef={chatInputRef} onSend={chat.send} />

            {/* When the drawer is open the chat is just a sliver — tapping it closes the drawer. */}
            {drawerOpen ? (
              <Pressable
                accessibilityLabel="Cerrar sesiones"
                onPress={() => setDrawerOpen(false)}
                style={StyleSheet.absoluteFill}
              />
            ) : null}
          </View>
        </GlassSurface>
      </Animated.View>

      {/* Left-edge swipe zone (only while closed): a thin strip on the very edge that opens the
          drawer on a rightward edge-pan, since the card's 10px margin leaves the edge unreachable. */}
      {!drawerOpen ? (
        <View
          style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, zIndex: 30 }}
          {...edgePanResponder.panHandlers}
        />
      ) : null}
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
