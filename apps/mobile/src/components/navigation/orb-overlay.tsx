import * as Haptics from "expo-haptics";
import { useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import {
  type GestureResponderEvent,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { OrbSphere } from "@/components/ui/orb-sphere";
import { sounds } from "@/lib/sounds";
import { useOrbStore } from "@/store/orb-store";

const SWIPE_DY = 18; // px of travel above which a pan counts as a real swipe
const SWIPE_VY = 0.5; // flick velocity (px/ms) shortcut for the same
const SELECT_STEP = 26; // px of upward drag per selection "tick" (future wheel selector)
const ORB_SIZE = 88;
const DOT_SIZE = 16;

// Floating Siri orb — a ROOT overlay rendered above the native tab bar (NativeTabs). It lives
// outside the navigator (not in a BottomAccessory) so it floats freely with NO native pill chrome
// and no height clipping. Only shown on the (tabs) screens. Gesture model (unchanged):
//   • resting          → a small green dot, centered above the bar
//   • swipe UP on dot  → reveal the orb (bounces in, + light haptic pop)
//   • press/hold orb   → wobble + wave swell; drag UP scrubs selection ticks
//   • swipe DOWN orb (or 8s idle from the store) → hide back to the dot
export function OrbOverlay() {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const orbVisible = useOrbStore((s) => s.active);
  const showOrb = useOrbStore((s) => s.show);
  const hideOrb = useOrbStore((s) => s.hide);
  const bumpOrb = useOrbStore((s) => s.bump);
  const setPressing = useOrbStore((s) => s.setPressing);

  // Intro/close sound on every show/hide (covers swipe-up, swipe-down AND the store's 8s auto-hide).
  const prevVisibleRef = useRef(orbVisible);
  useEffect(() => {
    if (orbVisible === prevVisibleRef.current) return;
    prevVisibleRef.current = orbVisible;
    if (orbVisible) sounds.reveal();
    else sounds.close();
  }, [orbVisible]);

  // Tab-selection sound — NativeTabs has no per-trigger onPress, so we watch the active (tabs)
  // route and play the nav sound on change (skipped on first mount).
  const activeTab = segments[1];
  const prevTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === prevTabRef.current) return;
    prevTabRef.current = activeTab;
    sounds.nav();
  }, [activeTab]);

  // Swipe UP on the dot reveals the orb. Claims on upward drag only, so taps pass through.
  const revealResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => g.dy < -8,
      onPanResponderRelease: (_, g) => {
        if (g.dy < -SWIPE_DY || g.vy < -SWIPE_VY) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          showOrb();
        }
      },
    }),
  ).current;

  // Touches only count on the orb's actual body (superellipse), not the transparent glow corners.
  const orbBox = useRef({ w: 0, h: 0 });
  const insideOrb = (evt: GestureResponderEvent) => {
    const { w, h } = orbBox.current;
    if (!w || !h) return true; // before first layout, don't block
    const nx = (evt.nativeEvent.locationX - w / 2) / (w / 2);
    const ny = (evt.nativeEvent.locationY - h / 2) / (h / 2);
    return Math.pow(Math.abs(nx), 2.2) + Math.pow(Math.abs(ny), 2.2) <= 0.9;
  };

  const stepRef = useRef(0);
  const orbResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: insideOrb,
      onMoveShouldSetPanResponder: (evt, g) => insideOrb(evt) && Math.abs(g.dy) > 6,
      onPanResponderGrant: () => {
        setPressing(true);
        bumpOrb();
        stepRef.current = 0;
      },
      onPanResponderMove: (_, g) => {
        const step = Math.floor(Math.max(0, -g.dy) / SELECT_STEP);
        if (step !== stepRef.current) {
          stepRef.current = step;
          if (step > 0) {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
            sounds.tick();
          }
        }
      },
      onPanResponderRelease: (_, g) => {
        setPressing(false);
        if (g.dy > SWIPE_DY || g.vy > SWIPE_VY) hideOrb();
      },
      onPanResponderTerminate: () => setPressing(false),
    }),
  ).current;

  // Only over the native tab bar (the (tabs) group).
  if (segments[0] !== "(tabs)") return null;

  // Sit just above the native tab bar, centered. The dot rests here; the orb grows upward from it.
  const bottom = insets.bottom + 64;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Insights notification dot — a small custom badge over the 2nd of 5 tabs. The native Badge
          renders an oversized, non-resizable circle, so we draw our own. Position is approximate to
          the native floating pill; nudge the left/bottom offsets if it drifts on a given device. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          bottom: insets.bottom + 46,
          left: width * 0.3 + 16,
          width: 11,
          height: 11,
          borderRadius: 5.5,
          backgroundColor: "#FF2828",
        }}
      />

      {/* Orb / resting dot — centered above the bar. */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom,
          height: ORB_SIZE,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
      {/* Orb — ALWAYS mounted so the spring "bounce" entrance plays when `visible` flips
          false→true (a fresh mount would start already-shown and skip the animation). */}
      <View
        pointerEvents={orbVisible ? "auto" : "none"}
        onLayout={(e) => {
          orbBox.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        }}
        {...orbResponder.panHandlers}
      >
        <OrbSphere size={ORB_SIZE} visible={orbVisible} />
      </View>

      {/* Resting state — the green "puntito", centered over the orb. Swipe up here to reveal. */}
      {!orbVisible ? (
        <View
          {...revealResponder.panHandlers}
          style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}
        >
          <View
            style={{
              width: DOT_SIZE,
              height: DOT_SIZE,
              borderRadius: DOT_SIZE / 2,
              backgroundColor: "#8BD633",
            }}
          />
        </View>
      ) : null}
      </View>
    </View>
  );
}
