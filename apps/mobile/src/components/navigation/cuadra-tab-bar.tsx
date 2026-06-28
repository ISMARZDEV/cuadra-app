import * as Haptics from "expo-haptics";
import {
  BadgePercent,
  ChartColumnIncreasing,
  type LucideIcon,
  Newspaper,
  Settings,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useRef } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/ui/brand-logo";
import { GlassSurface, GlassSurfaceContainer } from "@/components/ui/glass-surface";
import { Icon } from "@/components/ui/icon";
import { OrbSphere } from "@/components/ui/orb-sphere";
import { t, type TranslationKey } from "@/i18n";
import { sounds } from "@/lib/sounds";
import { useOrbStore } from "@/store/orb-store";

import { NAVBAR_CIRCLE, NAVBAR_VIEWBOX } from "./notched-glass";

// Minimal shape of the props expo-router passes to a custom `tabBar` (avoids depending on
// @react-navigation/bottom-tabs types, which aren't hoisted in this pnpm workspace).
type TabRoute = { key: string; name: string };
type CuadraTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  navigation: {
    emit: (event: { type: "tabPress"; target?: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
};

type PressHandler = (routeName: string, routeKey: string, focused: boolean) => void;

// Per-route presentation. The center route (aispace) renders the brand logo instead of an icon.
const ROUTE_META: Record<string, { icon: LucideIcon; labelKey: TranslationKey; badge?: boolean }> = {
  index: { icon: Newspaper, labelKey: "tabs.news" },
  insights: { icon: ChartColumnIncreasing, labelKey: "tabs.insights", badge: true },
  save: { icon: BadgePercent, labelKey: "tabs.save" },
  config: { icon: Settings, labelKey: "tabs.config" },
};

// Which tabs live in each glass island (the center "aispace" logo sits in the gap between them).
const LEFT_ISLAND = ["index", "insights"] as const;
const RIGHT_ISLAND = ["save", "config"] as const;

const BUBBLE_SPRING = { damping: 17, stiffness: 220, mass: 0.8 } as const;

// Animated icon with spring scale bounce when focused.
function AnimatedTabIcon({
  icon: IconComponent,
  color,
  focused,
}: {
  icon: LucideIcon;
  color: string;
  focused: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withSpring(focused ? 1.22 : 1, {
      damping: 12,
      stiffness: 200,
      mass: 0.8,
    });
  }, [focused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Icon as={IconComponent} size={24} color={color} />
    </Animated.View>
  );
}

// A single tab (icon + label + optional badge). Reports its layout (x/width within the island)
// so the parent island can place the liquid-glass selection bubble exactly over it.
function TabButton({
  route,
  focused,
  isDark,
  onPress,
  onMeasure,
}: {
  route: TabRoute;
  focused: boolean;
  isDark: boolean;
  onPress: PressHandler;
  onMeasure: (x: number, width: number) => void;
}) {
  const meta = ROUTE_META[route.name];
  if (!meta) return null;

  const iconColor = focused
    ? isDark ? "#C2FB7E" : "#034842"
    : isDark ? "#6AC400" : "#5A6B60";
  const textColor = focused
    ? isDark ? "#FFFFFF" : "#034842"
    : isDark ? "#C9D3CC" : "#5A6B60";

  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      onLayout={(e: LayoutChangeEvent) =>
        onMeasure(e.nativeEvent.layout.x, e.nativeEvent.layout.width)
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={t(meta.labelKey)}
        onPress={() => onPress(route.name, route.key, focused)}
        style={{ alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 6 }}
      >
        <View style={{ height: 28, alignItems: "center", justifyContent: "center" }}>
          <AnimatedTabIcon icon={meta.icon} color={iconColor} focused={focused} />
          {meta.badge ? (
            <View
              style={{ position: "absolute", top: -4, right: -4 }}
              className="h-2 w-2 rounded-full bg-[#FF2828]"
            />
          ) : null}
        </View>
        <Text style={{ color: textColor, fontSize: 11, fontWeight: focused ? "600" : "400" }}>
          {t(meta.labelKey)}
        </Text>
      </Pressable>
    </View>
  );
}

// A glass "island" holding 2 tabs. The island base + the selection bubble are BOTH GlassViews
// inside a GlassContainer, so on iOS 26 they fuse with the native liquid-glass morph (instead of
// stacking into a muddy box). The bubble springs between the island's two tabs, and FADES in/out
// when focus enters/leaves the island — so jumping between islands shows no cross-gap slide.
function TabIsland({
  routes,
  focusedName,
  isDark,
  width,
  height,
  onPress,
}: {
  routes: TabRoute[];
  focusedName: string | undefined;
  isDark: boolean;
  width: number;
  height: number;
  onPress: PressHandler;
}) {
  const layouts = useRef<Record<string, { x: number; width: number }>>({});
  const visibleRef = useRef(false); // is the bubble currently shown in THIS island?
  const bubbleX = useSharedValue(0);
  const bubbleW = useSharedValue(0);
  const bubbleOpacity = useSharedValue(0);

  const radius = height / 2;
  const focusedHere = focusedName !== undefined && routes.some((r) => r.name === focusedName);

  // Place the bubble: slide within the island, but snap+fade when arriving from the other island.
  const place = (x: number, w: number) => {
    if (visibleRef.current) {
      bubbleX.value = withSpring(x, BUBBLE_SPRING);
      bubbleW.value = withSpring(w, BUBBLE_SPRING);
    } else {
      // Arriving from the other island — snap into position (no slide across the gap) then fade in.
      bubbleX.value = x;
      bubbleW.value = w;
      bubbleOpacity.value = withTiming(1, { duration: 200 });
      visibleRef.current = true;
    }
  };

  useEffect(() => {
    if (focusedHere && focusedName) {
      const l = layouts.current[focusedName];
      if (l) place(l.x, l.width);
    } else if (visibleRef.current) {
      bubbleOpacity.value = withTiming(0, { duration: 160 });
      visibleRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedHere, focusedName]);

  const bubbleStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: bubbleX.value + 6,
    width: Math.max(bubbleW.value - 12, 0),
    top: 6,
    bottom: 6,
    opacity: bubbleOpacity.value,
  }));

  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        shadowColor: "#000",
        shadowOpacity: isDark ? 0.35 : 0.12,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      }}
    >
      {/* Glass base + bubble fused via GlassContainer (iOS 26 liquid morph). */}
      <GlassSurfaceContainer spacing={14} style={StyleSheet.absoluteFill}>
        <GlassSurface style={{ flex: 1, borderRadius: radius }} />
        <Animated.View style={bubbleStyle} pointerEvents="none">
          <GlassSurface
            isInteractive
            tintColor={isDark ? "rgba(194,251,126,0.20)" : "rgba(106,196,0,0.18)"}
            style={{ flex: 1, borderRadius: radius - 6 }}
          />
        </Animated.View>
      </GlassSurfaceContainer>

      {/* Tab buttons overlaid on the glass. */}
      <View style={[StyleSheet.absoluteFill, { flexDirection: "row", alignItems: "center" }]}>
        {routes.map((route) => {
          const focused = route.name === focusedName;
          return (
            <TabButton
              key={route.key}
              route={route}
              focused={focused}
              isDark={isDark}
              onPress={onPress}
              onMeasure={(x, w) => {
                layouts.current[route.name] = { x, width: w };
                // First measure of the already-focused tab → show the bubble immediately.
                if (focused && !visibleRef.current) place(x, w);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

// Cuadra tab bar — two liquid-glass islands ([News · Insights] and [Save · Config]) with the raised
// "iM" logo (AISpace) floating in the gap between them. The iridescent Siri orb springs up over the
// logo. Geometry scales from the design viewBox so the composition stays faithful at any width.
export function CuadraTabBar({ state, navigation }: CuadraTabBarProps) {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDark = colorScheme === "dark";

  const barWidth = Math.min(width - 24, 380);
  const scale = barWidth / NAVBAR_VIEWBOX.width; // viewBox→px (uniform)
  const navHeight = NAVBAR_VIEWBOX.height * scale; // full composition (islands + orb headroom)

  // Two islands flanking a center gap that holds the "iM" logo.
  const centerGap = barWidth * 0.24;
  const islandWidth = (barWidth - centerGap) / 2;
  const islandHeight = Math.round(navHeight * 0.56);

  // "iM" logo, vertically centered with the island tabs; the orb springs up above it.
  const logoHeight = 32 * scale;
  const logoCenterY = navHeight - islandHeight / 2;

  // Iridescent Siri-style orb. Swipe UP on the empty space above the logo reveals it (+buzz);
  // press/hold the orb to make it wobble; swipe DOWN on the orb (or 8s idle) hides it. The "iM"
  // logo just navigates to chat. See orb-store for the full gesture model.
  const orbVisible = useOrbStore((s) => s.active);
  const showOrb = useOrbStore((s) => s.show);
  const hideOrb = useOrbStore((s) => s.hide);
  const bumpOrb = useOrbStore((s) => s.bump);
  const setPressing = useOrbStore((s) => s.setPressing);
  const orbSize = NAVBAR_CIRCLE.r * 2 * scale * 1.35; // oval width
  const orbTop = logoCenterY - logoHeight / 2 - orbSize * 0.86; // floats just above the logo

  const onPress: PressHandler = (routeName, routeKey, focused) => {
    const event = navigation.emit({ type: "tabPress", target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(routeName);
      sounds.nav();
    }
  };

  // TAP on the "iM" logo navigates to the AISpace chat (the orb tap does NOT navigate).
  const goToAispace = () => {
    const aispace = state.routes.find((r) => r.name === "aispace");
    if (aispace) onPress("aispace", aispace.key, state.routes[state.index]?.name === "aispace");
  };

  // Intro/close sound on every show/hide — covers swipe-up, swipe-down AND the 8s auto-hide
  // (which flips `active` from the store timer, not from a gesture).
  const prevVisibleRef = useRef(orbVisible);
  useEffect(() => {
    if (orbVisible === prevVisibleRef.current) return;
    prevVisibleRef.current = orbVisible;
    if (orbVisible) sounds.reveal();
    else sounds.close();
  }, [orbVisible]);

  const SWIPE_DY = 18;
  const SWIPE_VY = 0.5;
  const SELECT_STEP = 26; // px of upward drag per selection "tick" (the future wheel selector)

  // Swipe UP in the empty space above the logo → reveal the orb (bounces in, light haptic pop).
  // Claims ONLY on an upward drag, so plain taps pass through to what's underneath.
  const revealResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy < -8,
    onPanResponderRelease: (_, g) => {
      if (g.dy < -SWIPE_DY || g.vy < -SWIPE_VY) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        showOrb();
      }
    },
  });

  // Touches only count on the orb's actual body, not the rectangular frame — the corners are pure
  // glow/empty (the superellipse leaves them transparent), so touching the resplandor does nothing.
  const orbBox = useRef({ w: 0, h: 0 });
  const insideOrb = (evt: GestureResponderEvent) => {
    const { w, h } = orbBox.current;
    if (!w || !h) return true; // before first layout, don't block
    const nx = (evt.nativeEvent.locationX - w / 2) / (w / 2);
    const ny = (evt.nativeEvent.locationY - h / 2) / (h / 2);
    // Superellipse (N≈2.2) matching the glass body, trimmed to 0.9 to stay inside the rim.
    return Math.pow(Math.abs(nx), 2.2) + Math.pow(Math.abs(ny), 2.2) <= 0.9;
  };

  // Orb: press/hold → wobble (visual) + wave swell. Press + drag UP scrubs the (future) wheel
  // selector → a selection "tick" per step. Swipe DOWN → hide. No navigation.
  const stepRef = useRef(0);
  const orbResponder = PanResponder.create({
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
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid); // stronger, crisper tick
          sounds.tick();
        }
      }
    },
    onPanResponderRelease: (_, g) => {
      setPressing(false);
      if (g.dy > SWIPE_DY || g.vy > SWIPE_VY) hideOrb();
    },
    onPanResponderTerminate: () => setPressing(false),
  });

  const focusedName = state.routes[state.index]?.name;
  const leftRoutes = state.routes.filter((r) => LEFT_ISLAND.includes(r.name as never));
  const rightRoutes = state.routes.filter((r) => RIGHT_ISLAND.includes(r.name as never));

  // Height of the swipe-up catch zone above the logo (the empty space where the orb reveals).
  const swipeZoneHeight = Math.max(logoCenterY - logoHeight / 2, 0);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: "center",
        paddingBottom: Math.max((insets.bottom || 12) - 16, 6) + 14,
      }}
    >
      <View pointerEvents="box-none" style={{ width: barWidth, height: navHeight }}>
        {/* Two glass islands at the bottom; space-between leaves the center gap for the logo. */}
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: islandHeight,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <TabIsland
            routes={leftRoutes}
            focusedName={focusedName}
            isDark={isDark}
            width={islandWidth}
            height={islandHeight}
            onPress={onPress}
          />
          <TabIsland
            routes={rightRoutes}
            focusedName={focusedName}
            isDark={isDark}
            width={islandWidth}
            height={islandHeight}
            onPress={onPress}
          />
        </View>

        {/* Swipe-up catch zone — the empty space ABOVE the logo (where the orb appears). Active only
            while hidden; an upward drag here reveals the orb. Claims on upward drag only. */}
        <View
          pointerEvents={orbVisible ? "none" : "auto"}
          style={{
            position: "absolute",
            top: 0,
            alignSelf: "center",
            width: NAVBAR_CIRCLE.r * 2 * scale,
            height: swipeZoneHeight,
          }}
          {...revealResponder.panHandlers}
        />

        {/* Iridescent orb — springs up over the gap. Press/hold → wobble; swipe down hides it. Only
            interactive while visible so it never steals touches when hidden. */}
        <View
          pointerEvents={orbVisible ? "box-none" : "none"}
          style={{ position: "absolute", alignSelf: "center", top: orbTop }}
        >
          <View
            onLayout={(e) => {
              orbBox.current = {
                w: e.nativeEvent.layout.width,
                h: e.nativeEvent.layout.height,
              };
            }}
            {...orbResponder.panHandlers}
          >
            <OrbSphere size={orbSize} visible={orbVisible} />
          </View>
        </View>

        {/* Center "iM" logo — tap navigates to the AISpace chat (reveal lives in the zone above). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="AISpace"
          onPress={goToAispace}
          style={{
            position: "absolute",
            alignSelf: "center",
            top: logoCenterY - logoHeight / 2,
          }}
        >
          <BrandLogo height={logoHeight} />
        </Pressable>
      </View>
    </View>
  );
}
