import {
  BadgePercent,
  ChartColumnIncreasing,
  type LucideIcon,
  Newspaper,
  Settings,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useRef } from "react";
import {
  type GestureResponderEvent,
  PanResponder,
  Pressable,
  Text,
  Vibration,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandLogo } from "@/components/ui/brand-logo";
import { Icon } from "@/components/ui/icon";
import { OrbSphere } from "@/components/ui/orb-sphere";
import { t, type TranslationKey } from "@/i18n";
import { useOrbStore } from "@/store/orb-store";
import { palette, theme } from "@/theme";

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

// Per-route presentation. The center route (aispace) renders the brand logo instead of an icon.
const ROUTE_META: Record<string, { icon: LucideIcon; labelKey: TranslationKey; badge?: boolean }> = {
  index: { icon: Newspaper, labelKey: "tabs.news" },
  insights: { icon: ChartColumnIncreasing, labelKey: "tabs.insights", badge: true },
  save: { icon: BadgePercent, labelKey: "tabs.save" },
  config: { icon: Settings, labelKey: "tabs.config" },
};

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

  // Iridescent Siri-style orb. Swipe UP on the "iM" logo reveals it; tap the orb to ripple it;
  // swipe DOWN on the orb (or 4s idle) hides it. See orb-store for the full gesture model.
  const orbVisible = useOrbStore((s) => s.active);
  const showOrb = useOrbStore((s) => s.show);
  const hideOrb = useOrbStore((s) => s.hide);
  const bumpOrb = useOrbStore((s) => s.bump);
  const orbSize = NAVBAR_CIRCLE.r * 2 * scale * 1.35; // oval width
  const orbTop = NAVBAR_CIRCLE.cy * scale - (orbSize * 0.86) / 2; // oval (h = w·0.86), centred on the dip

  const onPress = (routeName: string, routeKey: string, focused: boolean) => {
    const event = navigation.emit({ type: "tabPress", target: routeKey, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(routeName);
  };

  // TAP on the "iM" logo navigates to the AISpace chat (the orb tap does NOT navigate).
  const goToAispace = () => {
    const aispace = state.routes.find((r) => r.name === "aispace");
    if (aispace) onPress("aispace", aispace.key, state.routes[state.index]?.name === "aispace");
  };

  // Gesture thresholds: travel (px) and flick velocity (px/ms) above which a pan is a real swipe;
  // a release that stayed within TAP_SLOP counts as a tap. PanResponder (not RNGH) so it runs on
  // the current dev client with no extra native module / rebuild.
  const SWIPE_DY = 18;
  const SWIPE_VY = 0.5;
  const TAP_SLOP = 12;

  // "iM" logo: tap → chat; swipe up → reveal the orb (bounces in, buzzes once).
  const logoResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
    onPanResponderRelease: (_, g) => {
      if (g.dy < -SWIPE_DY || g.vy < -SWIPE_VY) {
        Vibration.vibrate(10);
        showOrb();
      } else if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
        goToAispace();
      }
    },
  });

  // Touches only count on the orb's actual body, not the rectangular frame — the corners are pure
  // glow/empty (the superellipse leaves them transparent), so tapping the resplandor must do nothing.
  const orbBox = useRef({ w: 0, h: 0 });
  const insideOrb = (evt: GestureResponderEvent) => {
    const { w, h } = orbBox.current;
    if (!w || !h) return true; // before first layout, don't block
    const nx = (evt.nativeEvent.locationX - w / 2) / (w / 2);
    const ny = (evt.nativeEvent.locationY - h / 2) / (h / 2);
    // Superellipse (N≈2.2) matching the glass body, trimmed to 0.9 to stay inside the rim.
    return Math.pow(Math.abs(nx), 2.2) + Math.pow(Math.abs(ny), 2.2) <= 0.9;
  };

  // Orb: tap → ripple + buzz (no navigation); swipe down → hide.
  const orbResponder = PanResponder.create({
    onStartShouldSetPanResponder: insideOrb,
    onMoveShouldSetPanResponder: (evt, g) => insideOrb(evt) && Math.abs(g.dy) > 6,
    onPanResponderRelease: (_, g) => {
      if (g.dy > SWIPE_DY || g.vy > SWIPE_VY) {
        hideOrb();
      } else if (Math.abs(g.dx) < TAP_SLOP && Math.abs(g.dy) < TAP_SLOP) {
        Vibration.vibrate(12);
        bumpOrb();
      }
    },
  });

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingBottom: Math.max((insets.bottom || 12) - 16, 6) }}
    >
      <View pointerEvents="box-none" style={{ width: barWidth, height: navHeight }}>
        {/* Glass bar — fills the exact silhouette; the top headroom (around the logo) is transparent. */}
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
          <NotchedGlass width={barWidth} />
        </View>

        {/* Tab items, laid out across the bar body (lower portion, below the hills). */}
        <View
          style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: navHeight * 0.54, flexDirection: "row", alignItems: "center" }}
        >
          {state.routes.map((route, index) => {
            const focused = state.index === index;

            if (route.name === "aispace") {
              // Center slot: spacer; the raised logo (below) is the actual touch target.
              return <View key={route.key} style={{ flex: 1 }} />;
            }

            const meta = ROUTE_META[route.name];
            if (!meta) return <View key={route.key} style={{ flex: 1 }} />;
            const color = focused ? palette.primary : theme[isDark ? "dark" : "light"].muted;

            return (
              <Pressable
                key={route.key}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={t(meta.labelKey)}
                onPress={() => onPress(route.name, route.key, focused)}
                style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 3 }}
              >
                <View>
                  <Icon as={meta.icon} size={24} color={color} />
                  {meta.badge ? (
                    <View
                      style={{ position: "absolute", top: -2, right: -4 }}
                      className="h-2 w-2 rounded-full bg-[#FF2828]"
                    />
                  ) : null}
                </View>
                <Text style={{ color, fontSize: 11 }}>{t(meta.labelKey)}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Iridescent orb — springs up over the dip. Tap ripples it; swipe down hides it. Only
            interactive while visible so it never steals touches from the logo underneath. */}
        <View
          pointerEvents={orbVisible ? "box-none" : "none"}
          style={{ position: "absolute", alignSelf: "center", top: orbTop }}
        >
          <View
            onLayout={(e) => {
              orbBox.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
            }}
            {...orbResponder.panHandlers}
          >
            <OrbSphere size={orbSize} visible={orbVisible} />
          </View>
        </View>

        {/* Center "iM" logo — sits concentric inside the dip. Tap → chat; swipe up → reveal the orb. */}
        <View
          accessibilityRole="button"
          accessibilityLabel="AISpace"
          style={{ position: "absolute", alignSelf: "center", top: logoCenterY - logoHeight / 2 }}
          {...logoResponder.panHandlers}
        >
          <BrandLogo height={logoHeight} />
        </View>
      </View>
    </View>
  );
}
