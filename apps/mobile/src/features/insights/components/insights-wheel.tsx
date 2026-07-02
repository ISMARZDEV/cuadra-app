import * as Haptics from "expo-haptics";
import {
  ChartPie,
  CircleDollarSign,
  CircleFadingPlus,
  Siren,
  Star,
  TrendingUpDown,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, FeDropShadow, Filter, LinearGradient, Path, Stop } from "react-native-svg";

import { Icon } from "@/components/ui/icon";
import { ScallopFab } from "@/components/ui/scallop-fab";
import { t, useLang } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { AKSHAR_MEDIUM, AKSHAR_SEMIBOLD } from "@/theme/fonts";

import { MOCK_WHEEL_BANDS, MOCK_WHEEL_TREND_PERCENT } from "../dev-mock";
import type { InsightsWheelProps, WheelBand } from "../interfaces";
import { useDevMockStore } from "../use-dev-mock-store";
import { InsightsWheelTexture } from "./insights-wheel-texture";

// The Insights home "wheel" (insights-ui-navbar.md §1-2) — the persistent gauge PLUS its 7
// surrounding buttons (5 in a bottom arc + 2 side modal buttons), which live in the SAME
// coordinate space as the ring per the reference design, not a separate flat row. Reference:
// public/svg/wheel-reference-desing-{dark,light}.svg (traced exactly, see below) + the 4
// screenshots the user shared (empty/populated, both themes).
//
// The reference SVG's own canvas (351x345) already fits the ring + the icon fan with no
// clipping — reusing that exact aspect ratio here (not inventing new proportions) guarantees the
// same fit at any render width. The background glow blob, the muted track ring, and the thin
// inner gradient ring below are the reference's EXACT bezier paths embedded in an <Svg
// viewBox="0 0 351 345">, so they scale pixel-identically; only the 7 icon badges use this
// component's OWN polar math (a clean, evenly-spaced fan) instead of the reference's 4 irregular
// per-badge rotation matrices — visually equivalent, meaningfully more maintainable.
const REF_W = 351;
const REF_H = 345;
const SIZE = 360;
const SCALE = SIZE / REF_W;
const HEIGHT = REF_H * SCALE;

// Ring centerline, in MY scaled pixels — derived from the reference's inner-gradient-ring rect
// (x=48.63,y=44.82,w=253.09,rx=126.54 ⇒ center 175.17,171.36 ⇒ radius 126.54).
const RING_CENTER_X = 175.17 * SCALE;
const RING_CENTER_Y = 171.36 * SCALE;
const RING_RADIUS = 126.54 * SCALE; // thin lime accent ring (reference rect, stroke-width 3)
const RING_STROKE = 3 * SCALE;

// The THICK muted/colored band ring is a SEPARATE, larger ring in the reference — its own masked
// stroke path (wheel-reference-desing svg) with a centerline averaging ≈150.4 ref units from
// center (vs the accent ring's 126.54) and stroke-width="38.9171". Reusing RING_RADIUS/a 14px
// stroke here (as before) made the band ring both too small and 3x too thin vs the reference.
const TRACK_RADIUS = RING_RADIUS * 1.165;
const TRACK_STROKE = 10.92 * SCALE;

// Decorative trend squiggle radius — kept relative to the thin accent ring's interior, independent
// of TRACK_STROKE now that the band ring is much thicker.
const TREND_INNER_RADIUS = RING_RADIUS * 0.78;

// Gauge opens at the bottom — wide enough to clear the 7-icon fan below it (angle convention:
// 0°=3 o'clock, increasing clockwise since screen y grows downward).
const ARC_START_DEG = 168;
const ARC_END_DEG = 372; // 210° sweep

// Small angular OVERLAP between adjacent band segments — each subsequent category's rounded pill
// slightly overlaps (paints OVER, since it's drawn later) the end of the PREVIOUS one, so the
// earlier band visibly peeks out from behind it (Figma reference), rather than a clean gap or a
// flush edge-to-edge touch. Not applied to the very first band's own start (the round-capped tip
// marking the whole colored run's true start).
const BAND_OVERLAP_DEG = 5;

// Pastel palette — softer than the brand's vivid alert-style green→yellow→orange→red, but still
// rich/saturated enough to read clearly against the dark blob (not washed-out/pale).
const DEFAULT_BANDS: WheelBand[] = [
  { colorHex: "#6FD99A", weight: 1 }, // pastel green
  { colorHex: "#F5D76E", weight: 1 }, // pastel yellow
  { colorHex: "#F5A876", weight: 1 }, // pastel orange
  { colorHex: "#F08080", weight: 1 }, // pastel red
];

// Shared trig helper — also places category markers along the SAME arc (deferred data this
// pass, see docs/sdd/insights-home-mvp.md).
function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polarPoint(cx, cy, r, startDeg);
  const end = polarPoint(cx, cy, r, endDeg);
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// A gentle decorative squiggle inside the ring — normalized (0..1) points scaled to the inner
// circle, not a real data sparkline (the real per-day trend series doesn't exist yet).
const TREND_POINTS: readonly [number, number][] = [
  [0.08, 0.55], [0.22, 0.62], [0.36, 0.4], [0.5, 0.5], [0.64, 0.3], [0.78, 0.42], [0.92, 0.36],
];

function trendPoints(innerRadius: number) {
  const box = innerRadius * 1.5;
  const originX = RING_CENTER_X - box / 2;
  const originY = RING_CENTER_Y - box / 2.6;
  return TREND_POINTS.map(([nx, ny]) => ({
    x: originX + nx * box,
    y: originY + ny * box * 0.6,
  }));
}

function trendLinePath(innerRadius: number): string {
  return trendPoints(innerRadius)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

function trendAreaPath(innerRadius: number): string {
  const pts = trendPoints(innerRadius);
  const bottomY = RING_CENTER_Y + innerRadius * 0.5;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return `${line} L ${pts[pts.length - 1].x} ${bottomY} L ${pts[0].x} ${bottomY} Z`;
}

// Pinned at the END of its OWN band's arc segment (Figma: the badge marks where a category's
// spending stops, never centered inside its color) — angleDeg is that band's own computed `end`.
// It's a BUTTON (tap → that category's stats/details), same press-scale + haptic feel as
// NavButton/EditButton below, not a static dot. Hidden by default — `visible` (driven by the
// parent's tap-the-bar handler) reveals it with a left→right WAVE, staggered by `index` among the
// other visible badges; it fades back out (no stagger) once the parent's auto-hide timer fires.
function CategoryMarkerDot({
  angleDeg,
  emoji,
  ringColor,
  onPress,
  visible,
  index,
}: {
  angleDeg: number;
  emoji: string;
  ringColor: string;
  onPress?: () => void;
  visible: boolean;
  index: number;
}) {
  const { x, y } = polarPoint(RING_CENTER_X, RING_CENTER_Y, TRACK_RADIUS, angleDeg);
  const badgeSize = 34;

  const pressScale = useSharedValue(1);
  // Reanimated's `entering`/layout animations don't fire reliably on the New Architecture here
  // (cuadra-mobile skill §6) — drive the wave manually: a shared value flipped in a plain
  // useEffect on `visible` change, not a mount-transition preset.
  const appear = useSharedValue(0);
  useEffect(() => {
    appear.value = visible
      ? withDelay(index * 90, withSpring(1, { damping: 14, stiffness: 180 }))
      : withTiming(0, { duration: 150 });
  }, [visible, index, appear]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ scale: pressScale.value * (0.6 + appear.value * 0.4) }],
  }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.88, { damping: 15, stiffness: 320, mass: 0.6 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={emoji}
      pointerEvents={visible ? "auto" : "none"}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        {
          position: "absolute",
          left: x - badgeSize / 2,
          top: y - badgeSize / 2,
          width: badgeSize,
          height: badgeSize,
          borderRadius: badgeSize / 2,
          backgroundColor: "white",
          borderWidth: 2,
          borderColor: ringColor,
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      <Text style={{ fontSize: 18 }}>{emoji}</Text>
    </AnimatedPressable>
  );
}

// Reference background-blob path (public/svg/wheel-reference-desing-dark.svg, the drop-shadowed
// organic shape behind the ring) — identical outline in both themes, only the fill gradient
// differs (near-black teal in dark, flat white in light).
const BLOB_PATH =
  "M55.1852 243.254C63.5893 240.773 72.7435 243.484 78.285 250.283C101.186 278.431 136.073 296.41 175.169 296.41C214.266 296.41 250.117 277.926 273.003 249.119C278.514 242.182 287.76 239.379 296.256 241.891L310.645 246.133C318.054 248.323 325.938 244.617 328.984 237.511C338.154 216.178 343.037 192.548 342.501 167.724C340.557 78.0428 267.125 5.22309 177.45 4.01325C83.9796 2.7881 7.80688 78.2113 7.80688 171.445C7.80688 195.534 12.8891 218.429 22.0433 239.134C25.1509 246.164 32.9733 249.824 40.3364 247.649L55.1852 243.269V243.254Z";

// The 7 buttons, left → right, angle = 90° (straight down) ± 23° per step (matches the
// reference's own ~23° spacing between adjacent badges, derived from its rotation transforms).
// `role: "home"` = the wide pill (only functional button this pass); `"satellite"` = the 4
// circular badges; `"side"` = the 2 outer modal buttons (⊕/☆, always lime in both themes).
interface NavButtonSpec {
  id: string;
  icon: LucideIcon;
  angleDeg: number;
  role: "home" | "satellite" | "side";
  labelKey: Parameters<typeof t>[0];
}
// Angles measured directly off the reference SVG's button rects (their rotation transforms →
// button centers → angle from ring center): home 90° (straight down), satellites 115/137° left &
// 65/43° right, side buttons 158/22°.
const NAV_BUTTONS: NavButtonSpec[] = [
  { id: "new-category", icon: CircleFadingPlus, angleDeg: 158, role: "side", labelKey: "insights.nav.newCategory" },
  { id: "movements", icon: WalletCards, angleDeg: 137, role: "satellite", labelKey: "insights.nav.movements" },
  { id: "reports", icon: ChartPie, angleDeg: 115, role: "satellite", labelKey: "insights.nav.reports" },
  { id: "home", icon: TrendingUpDown, angleDeg: 90, role: "home", labelKey: "insights.nav.home" },
  { id: "budgets", icon: CircleDollarSign, angleDeg: 65, role: "satellite", labelKey: "insights.nav.budgets" },
  { id: "alerts", icon: Siren, angleDeg: 43, role: "satellite", labelKey: "insights.nav.alerts" },
  { id: "goals", icon: Star, angleDeg: 22, role: "side", labelKey: "insights.nav.goals" },
];
// Per-role fan radius (reference: the home pill sits lowest/furthest out, satellites a touch in,
// the two side buttons pulled in closest) — ×RING_RADIUS ratios derived from the reference rects.
const FAN_RADIUS: Record<NavButtonSpec["role"], number> = {
  home: RING_RADIUS * 1.241,
  satellite: RING_RADIUS * 1.201,
  side: RING_RADIUS * 1.166,
};
const HOME_PILL_W = 64.6 * SCALE;
const HOME_PILL_H = 34 * SCALE;
// Satellite buttons: pills traced from the reference SVG (45.9973×33.9504, rx=16.9752).
// Rotated to align tangent to the arc (angleDeg - 90°).
const SATELLITE_W = 45.9973 * SCALE;
const SATELLITE_H = 33.9504 * SCALE;
const SATELLITE_RX = 16.9752 * SCALE;
// Side buttons: rounded squares from reference (27.4868×27.4868, rx=13.7434) — near-circles.
const SIDE_BUTTON_SIZE = 27.4868 * SCALE;
const SIDE_BUTTON_RX = 13.7434 * SCALE;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NavButton({ spec, isDark }: { spec: NavButtonSpec; isDark: boolean }) {
  const { x, y } = polarPoint(RING_CENTER_X, RING_CENTER_Y, FAN_RADIUS[spec.role], spec.angleDeg);
  // Side buttons: lime in BOTH themes. Home pill vs. the 4 satellites: theme-inverted PAIR — when
  // the pill is dark-green, satellites are lime, and vice versa (exact reference behavior).
  const bg =
    spec.role === "side" ? "#C2FB7E" : spec.role === "home" ? (isDark ? "#034842" : "#C2FB7E") : isDark ? "#C2FB7E" : "#034842";
  const fg = spec.role === "side" ? "#034842" : spec.role === "home" ? (isDark ? "#C2FB7E" : "#034842") : isDark ? "#034842" : "#C2FB7E";
  const isPill = spec.role === "home";
  const isSatellite = spec.role === "satellite";

  // Satellite buttons: pills rotated tangent to the arc (angleDeg - 90°).
  // Side buttons: rounded squares (near-circles), no rotation needed.
  // Home pill: horizontal pill at the bottom, no rotation.
  const w = isPill ? HOME_PILL_W : isSatellite ? SATELLITE_W : SIDE_BUTTON_SIZE;
  const h = isPill ? HOME_PILL_H : isSatellite ? SATELLITE_H : SIDE_BUTTON_SIZE;
  const borderRadius = isPill ? HOME_PILL_H / 2 : isSatellite ? SATELLITE_RX : SIDE_BUTTON_RX;
  const rotation = isSatellite ? spec.angleDeg - 90 : 0;

  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation}deg` }, { scale: pressScale.value }],
  }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.88, { damping: 15, stiffness: 320, mass: 0.6 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={t(spec.labelKey)}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      style={[
        {
          position: "absolute",
          left: x - w / 2,
          top: y - h / 2,
          width: w,
          height: h,
          borderRadius,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
        },
        animStyle,
      ]}
    >
      <Icon as={spec.icon} size={isPill ? 24 : spec.role === "side" ? 18 : 22} color={fg} strokeWidth={2.5} />
    </AnimatedPressable>
  );
}

export function InsightsWheel({
  variant,
  totalExpenseMinor,
  budgetMinor,
  currency,
  trendPercent,
  bands,
  onAddPress,
}: InsightsWheelProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  // Category bands/trend have no backend endpoint yet (interfaces.ts: "deferred data this
  // pass") — fall back to the dev-only mock preview when it's switched on, so this card
  // shows something richer than DEFAULT_BANDS while iterating on the design. Real data (once it
  // exists) is passed explicitly as a prop and always wins over the mock.
  const mockPreview = useDevMockStore((s) => s.enabled);
  const effectiveBands = bands ?? (mockPreview ? MOCK_WHEEL_BANDS : DEFAULT_BANDS);
  const effectiveTrendPercent = trendPercent ?? (mockPreview ? MOCK_WHEEL_TREND_PERCENT : undefined);

  // The colored arc is a gauge of budget CONSUMPTION, not a pie chart of the bands themselves — it
  // only fills up to totalExpense/budget of the full sweep (capped at 100%: the ring closes
  // completely only once spending reaches or exceeds the budget). The rest of the sweep stays the
  // plain muted track underneath (rendered separately, full width, always).
  const spentRatio = budgetMinor > 0 ? Math.min(Math.max(totalExpenseMinor / budgetMinor, 0), 1) : 0;
  const totalWeight = effectiveBands.reduce((sum, b) => sum + b.weight, 0);
  const sweep = (ARC_END_DEG - ARC_START_DEG) * spentRatio;
  let cursor = ARC_START_DEG;
  const bandArcs = effectiveBands.map((band, i) => {
    const bandSweep = totalWeight > 0 ? (band.weight / totalWeight) * sweep : 0;
    const start = cursor;
    const end = cursor + bandSweep;
    cursor = end;
    // Visual (rendered/badge) end — extended FORWARD into the NEXT band for every band but the
    // last, so THIS (earlier) band's round cap overlaps and paints over that next band's start —
    // the band closer to the '+' button always sits on top at a junction, never the other way.
    // `visualStart` stays the true boundary; it's the PREVIOUS band that overlaps onto it.
    const isLast = i === effectiveBands.length - 1;
    const visualStart = start;
    const visualEnd = isLast ? end : end + BAND_OVERLAP_DEG;
    return { ...band, start, end, visualStart, visualEnd };
  });

  // Category badges are hidden by default — tapping the ring's bar reveals them (a left→right
  // wave, staggered per-badge in CategoryMarkerDot), auto-hides them again after a few seconds,
  // AND tapping the bar again while they're showing hides them immediately (a toggle, not just a
  // re-trigger) — rather than always showing (keeps the ring clean until the user wants detail).
  const [showCategories, setShowCategories] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  const handleBarPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    if (showCategories) {
      // Already showing — tapping the bar again is a toggle-off, not a re-trigger.
      setShowCategories(false);
      return;
    }
    setShowCategories(true);
    hideTimer.current = setTimeout(() => setShowCategories(false), 20000);
  };

  return (
    <View style={{ width: SIZE, height: HEIGHT }}>

        <Svg width={SIZE} height={HEIGHT} viewBox={`0 0 ${REF_W} ${REF_H}`} style={{ position: "absolute" }}>
          <Defs>
            <Filter id="blobShadow" x="-20%" y="-25%" width="140%" height="140%">
            <FeDropShadow
              dx="0"
              dy={2 * SCALE}
              stdDeviation={5 * SCALE}
              floodColor="#000000"
              floodOpacity={isDark ? 0.35 : 0.16}
            />
            </Filter>
            {/* Light: a soft lime top → white (the shadow keeps the white bottom from vanishing on a
                white page). Dark: near-black teal → deeper teal (the reference's own blob gradient). */}
            <LinearGradient id="wheelBlob" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={isDark ? "#00160D" : "#FBFFF6"} />
              <Stop offset="0.6" stopColor={isDark ? "#012623" : "#FBFFF6"} />
              <Stop offset="0.95" stopColor={isDark ? "#014640" : "#FFFFFF"} />
            </LinearGradient>
          </Defs>
          <Path d={BLOB_PATH} fill="url(#wheelBlob)" filter="url(#blobShadow)" />
        </Svg>

      <InsightsWheelTexture
        cx={RING_CENTER_X}
        cy={RING_CENTER_Y}
        radius={RING_RADIUS - 6}
        isDark={isDark}
      />

      <Svg width={SIZE} height={HEIGHT} style={{ position: "absolute" }}>
        
        {/* Muted background track — always visible, both variants. Tapping the bar (this track OR
            any colored band below) reveals the category badges. */}
        <Path
          d={arcPath(RING_CENTER_X, RING_CENTER_Y, TRACK_RADIUS, ARC_START_DEG, ARC_END_DEG)}
          stroke="#E1E3EA"
          strokeOpacity={isDark ? 0.25 : 0.6}
          strokeWidth={TRACK_STROKE}
          strokeLinecap="round"
          fill="none"
          onPress={handleBarPress}
        />
        {/* Each band is its own rounded "pill". Painted in REVERSE array order (last band first,
            first band last) so the band closer to the '+' button is always the TOP-most at a
            junction — its visualEnd (extended forward by BAND_OVERLAP_DEG) paints over the START
            of the next one, which sits underneath. */}
        {variant === "populated" &&
          [...bandArcs].reverse().map((band, reversedI) => (
            <Path
              key={bandArcs.length - 1 - reversedI}
              d={arcPath(RING_CENTER_X, RING_CENTER_Y, TRACK_RADIUS, band.visualStart, band.visualEnd)}
              stroke={band.colorHex}
              strokeWidth={TRACK_STROKE}
              strokeLinecap="round"
              fill="none"
              onPress={handleBarPress}
            />
          ))}
        {variant === "populated" && (
          <>
            <Defs>
              <LinearGradient id="trendFillGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#3DBE64" stopOpacity="0.35" />
                <Stop offset="1" stopColor="#3DBE64" stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path
              d={trendAreaPath(TREND_INNER_RADIUS)}
              fill="url(#trendFillGrad)"
            />
            <Path
              d={trendLinePath(TREND_INNER_RADIUS)}
              stroke="#3DBE64"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </>
        )}
        {/* Thin inner ring, fading from a lime top — the reference's exact gradient stroke (~2.7dp scaled). */}
        <Defs>
          <LinearGradient id="innerRingGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C2FB7E" />
            <Stop offset={isDark ? "0.707" : "0.76"} stopColor={isDark ? "#C2FB7E" : "#FFFFFF"} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path
          d={arcPath(RING_CENTER_X, RING_CENTER_Y, RING_RADIUS, 0, 359.9)}
          stroke="url(#innerRingGrad)"
          strokeWidth={RING_STROKE}
          fill="none"
        />
      </Svg>

      {variant === "populated" &&
        bandArcs
          .filter((band): band is typeof band & { emoji: string } => Boolean(band.emoji))
          .map((band, i) => (
            <CategoryMarkerDot
              key={`${band.emoji}-${i}`}
              angleDeg={band.visualEnd}
              emoji={band.emoji}
              ringColor={band.ringColor ?? band.colorHex}
              onPress={band.onPress}
              visible={showCategories}
              index={i}
            />
          ))}

      {variant === "empty" ? (
        <View
          style={{
            position: "absolute",
            left: RING_CENTER_X - RING_RADIUS,
            right: RING_CENTER_X - RING_RADIUS,
            top: RING_CENTER_Y - 55,
            alignItems: "center",
            gap: 14,
          }}
        >
          <Text
            className="text-center text-text"
            style={{ fontSize: 14, fontWeight: "700", width: 200, lineHeight: 18 }}
          >
            {t("insights.wheel.emptyState")}
          </Text>
          <ScallopFab label={t("insights.wheel.addLabel")} onPress={onAddPress} />
          <Text className="text-text" style={{ fontSize: 15, fontWeight: "700", marginTop: -14 }}>
            {t("insights.wheel.addLabel")}
          </Text>
        </View>
      ) : (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: RING_CENTER_Y - 44,
            alignItems: "center",
          }}
        >
          {effectiveTrendPercent !== undefined && (
            <View
              style={{
                backgroundColor: "#C2FB7E",
                borderRadius: 12,
                paddingHorizontal: 10,
                paddingVertical: 4,
                marginBottom: 44,
              }}
            >
              <Text style={{ color: "#034842", fontSize: 11, fontWeight: "700" }}>
                {effectiveTrendPercent >= 0 ? "+" : ""}
                {effectiveTrendPercent}%
              </Text>
            </View>
          )}
          <Text className="text-muted" style={{ fontSize: 16 }}>
            {t("insights.wheel.totalExpense")}
          </Text>
          <Text
            className="text-text"
            style={{ fontFamily: AKSHAR_SEMIBOLD, fontSize: 30, marginBottom: 6 }}
          >
            -{formatMoney(Math.abs(totalExpenseMinor), currency)}
          </Text>
          <Text className="text-muted" style={{ fontSize: 12 }}>
            {t("insights.wheel.budget")}
          </Text>
          <Text className="text-text" style={{ fontFamily: AKSHAR_MEDIUM, fontSize: 16 }}>
            {formatMoney(budgetMinor, currency)}
          </Text>
        </View>
      )}

      {NAV_BUTTONS.map((spec) => (
        <NavButton key={spec.id} spec={spec} isDark={isDark} />
      ))}
    </View>
  );
}
