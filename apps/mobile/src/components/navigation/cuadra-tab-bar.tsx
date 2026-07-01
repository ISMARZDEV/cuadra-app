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
  PanResponder,
  Pressable,
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
import { Icon } from "@/components/ui/icon";
import { OrbSphere } from "@/components/ui/orb-sphere";
import { t, type TranslationKey } from "@/i18n";
import { sounds } from "@/lib/sounds";
import { useChatExpandStore } from "@/store/chat-expand-store";
import { useDrawer } from "@/store/drawer-store";
import { useOrbStore } from "@/store/orb-store";

import { NAVBAR_CIRCLE, NAVBAR_VIEWBOX, NotchedGlass } from "./notched-glass";

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

// Per-route presentation. The center route (aispace — the literal `index.tsx` file, so it's HOME;
// see (tabs)/_layout.tsx) renders the brand logo instead of an icon, so it's not listed here.
const ROUTE_META: Record<string, { icon: LucideIcon; labelKey: TranslationKey; badge?: boolean }> = {
  news: { icon: Newspaper, labelKey: "tabs.news" },
  insights: { icon: ChartColumnIncreasing, labelKey: "tabs.insights", badge: true },
  save: { icon: BadgePercent, labelKey: "tabs.save" },
  config: { icon: Settings, labelKey: "tabs.config" },
};

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
    scale.value = withSpring(focused ? 1.25 : 1, {
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

// Cuadra tab bar — exact Figma silhouette: one smooth wave with a central dip concentric to the
// raised "iM" logo (AISpace). Geometry scales from the design viewBox so the curve stays faithful.
export function CuadraTabBar({ state, navigation }: CuadraTabBarProps) {
  const { colorScheme } = useColorScheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDark = colorScheme === "dark";

  const barWidth = Math.min(width - 24, 380);
  const scale = barWidth / NAVBAR_VIEWBOX.width; // viewBox→px (uniform)
  const navHeight = NAVBAR_VIEWBOX.height * scale; // full composition (bar body + dip headroom)
  // "iM" logo nests LOW inside the dip valley (viewBox units). The iridescent sphere (future)
  // appears above on press, concentric with the dip.
  const logoHeight = 30 * scale;
  const logoCenterY = 86 * scale; // cradled low inside the bar body (top sits at the dip line)

  // Iridescent Siri-style orb. Swipe UP on the empty notch space above the logo reveals it (+buzz);
  // press/hold the orb to make it wobble; swipe DOWN on the orb (or 8s idle) hides it. The "iM"
  // logo just navigates to chat. See orb-store for the full gesture model.
  const orbVisible = useOrbStore((s) => s.active);
  const showOrb = useOrbStore((s) => s.show);
  const hideOrb = useOrbStore((s) => s.hide);
  const bumpOrb = useOrbStore((s) => s.bump);
  const setPressing = useOrbStore((s) => s.setPressing);
  const orbSize = NAVBAR_CIRCLE.r * 2 * scale * 1.35; // oval width
  const orbTop = NAVBAR_CIRCLE.cy * scale - (orbSize * 0.86) / 2; // oval (h = w·0.86), centred on the dip

  const onPress = (routeName: string, routeKey: string, focused: boolean) => {
    const event = navigation.emit({ type: "tabPress", target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(routeName);
      sounds.nav();
    }
  };

  // TAP on the "iM" logo navigates to the AISpace chat (the orb tap does NOT navigate). AISpace is
  // the literal `index.tsx` route now (it's home — (tabs)/_layout.tsx), not a route named "aispace".
  const goToAispace = () => {
    const aispace = state.routes.find((r) => r.name === "index");
    if (aispace) onPress("index", aispace.key, state.routes[state.index]?.name === "index");
  };

  // Gesture thresholds: travel (px) and flick velocity (px/ms) above which a pan is a real swipe;
  // a release that stayed within TAP_SLOP counts as a tap. PanResponder (not RNGH) so it runs on
  // the current dev client with no extra native module / rebuild.
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

  // Swipe UP in the empty notch space above the logo → reveal the orb (bounces in, light haptic pop).
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

  // Orb: press/hold → wobble (visual, no haptic) + wave swell. Press + drag UP scrubs the (future)
  // wheel selector → a selection "tick" per step (Haptics.selectionAsync, the date-picker feel).
  // Swipe DOWN → hide. No navigation.
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

  // Renders a single tab item (icon + label + optional badge).
  const renderTabItem = (route: TabRoute) => {
    const index = state.routes.indexOf(route);
    const focused = state.index === index;
    const meta = ROUTE_META[route.name];
    if (!meta) return null;

    const iconColor = focused
      ? isDark ? "#C2FB7E" : "#6AC400"
      : isDark ? "#FFFFFF" : "#034842";
    const textColor = focused
      ? isDark ? "#E0FFBB" : "#034842"
      : isDark ? "#FFFFFF" : "#000000";

    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={t(meta.labelKey)}
        onPress={() => onPress(route.name, route.key, focused)}
        style={{ alignItems: "center", justifyContent: "center", gap: 3 }}
      >
        <View style={{ height: 30, alignItems: "center", justifyContent: "center" }}>
          <AnimatedTabIcon icon={meta.icon} color={iconColor} focused={focused} />
          {meta.badge ? (
            <View
              style={{ position: "absolute", top: -4, right: -4 }}
              className="h-2 w-2 rounded-full bg-[#FF2828]"
            />
          ) : null}
        </View>
        <Text style={{ color: textColor, fontSize: 11 }}>{t(meta.labelKey)}</Text>
      </Pressable>
    );
  };

  // Slide the whole bar DOWN + fade out while the AISpace sessions drawer is open (driven by the
  // shared drawer progress so it stays in sync with the chat sliding aside) OR while the chat is
  // expanded full-screen (chat-header.tsx's Maximize2/Minimize2 toggle, chat-screen.tsx animates
  // the card). Two independent triggers, same hide motion — max() so neither double-shifts the bar
  // if both were somehow true at once.
  const { progress: drawerProgress } = useDrawer();
  const chatExpanded = useChatExpandStore((s) => s.expanded);
  const expandProgress = useSharedValue(chatExpanded ? 1 : 0);
  useEffect(() => {
    expandProgress.value = withTiming(chatExpanded ? 1 : 0, { duration: 300 });
  }, [chatExpanded, expandProgress]);
  const drawerHideStyle = useAnimatedStyle(() => {
    const p = Math.max(drawerProgress.value, expandProgress.value);
    return {
      transform: [{ translateY: p * (navHeight + (insets.bottom || 0) + 40) }],
      opacity: 1 - p,
    };
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        {
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          paddingBottom: Math.max((insets.bottom || 12) - 16, 6) + 14,
        },
        drawerHideStyle,
      ]}
    >
      <View
        pointerEvents="box-none"
        style={{ width: barWidth, height: navHeight }}
      >
        {/* Glass bar — fills the exact silhouette; the top headroom (around the logo) is transparent.
            isInteractive: native iOS 26 touch response (glass lights up on tap). */}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            shadowColor: "#000",
            shadowOpacity: isDark ? 0.4 : 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
          }}
        >
          <NotchedGlass width={barWidth} isInteractive />
        </View>

        {/* Iridescent orb — springs up over the dip. Press/hold → wobble; swipe down hides it.
            Rendered BEFORE the tab items so it sits BEHIND them in z-order: the orb's ~96px frame
            slightly overlaps the inner edge of Insights/Save, and a top view that declines the
            responder does NOT let the touch fall through to the tabs underneath. Keeping the orb
            beneath the tabs lets Insights/Save stay fully tappable while the orb is active; the
            orb's own body (centred over the logo spacer) has no tab over it, so press/hold/swipe
            still work. Only interactive while visible so it never steals touches when hidden. */}
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

        {/* Tab items, laid out across the bar body (lower portion, below the hills).
            Three-section layout: left group (News+Insights), center logo spacer, right group (Save+Config).
            Each group uses space-around so items spread within their half. */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: navHeight * 0.54,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          {/* Left group: News + Insights */}
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
            {state.routes
              .filter((r) => r.name === "news" || r.name === "insights")
              .map((route) => renderTabItem(route))}
          </View>

          {/* Center spacer for the logo */}
          <View style={{ width: barWidth * 0.22 }} />

          {/* Right group: Save + Config */}
          <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
            {state.routes
              .filter((r) => r.name === "save" || r.name === "config")
              .map((route) => renderTabItem(route))}
          </View>
        </View>

        {/* Swipe-up catch zone — the empty notch space ABOVE the logo (where the orb appears).
            Active only while hidden; an upward drag here reveals the orb. Claims on upward drag
            only, so it never blocks taps. */}
        {/* Swipe-up zone: covers ONLY the center dip circle (exact diameter, no multiplier).
            The dip circle = 63 viewBox units ≈ 71px at max bar width, safely within the center
            slot (one slot = barWidth/5). Previously 55% of bar → blocked Insights and Save. */}
        <View
          pointerEvents={orbVisible ? "none" : "auto"}
          style={{
            position: "absolute",
            top: 0,
            alignSelf: "center",
            width: NAVBAR_CIRCLE.r * 2 * scale,
            height: logoCenterY - logoHeight / 2,
          }}
          {...revealResponder.panHandlers}
        />

        {/* Center "iM" logo — tap navigates to the AISpace chat (reveal lives in the notch zone above). */}
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
    </Animated.View>
  );
}
