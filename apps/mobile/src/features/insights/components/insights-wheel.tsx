import * as Haptics from "expo-haptics";
import {
  ChartPie,
  CircleDollarSign,
  CircleFadingPlus,
  Eye,
  Siren,
  Star,
  TrendingUpDown,
  WalletCards,
  type LucideIcon,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";
import { useEffect, useRef, useState } from "react";
import { PanResponder, Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  ClipPath,
  Defs,
  FeDropShadow,
  Filter,
  G,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";

import { Icon } from "@/components/ui/icon";
import { ScallopFab } from "@/components/ui/scallop-fab";
import { type Lang, t, useLang } from "@/i18n";
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

// Decorative trend squiggle — its OWN dedicated box, positioned/sized in absolute pixels (not
// derived from RING_RADIUS ratios split across two unrelated computations) so the pill/dot marker
// above it and the money-text block below it can never drift out of sync with where the squiggle
// actually renders — that mismatch (a hand-tuned `marginBottom` on the pill vs a hand-tuned `top`
// on the text block, neither aware of the squiggle's real bounds) is what caused the chart to
// crowd into "Gasto total" before. Sits in the ring's upper zone, well clear of the money text.
const TREND_BOX_TOP = RING_CENTER_Y - RING_RADIUS * 0.62;
// Wide enough that the drawn line/area (TREND_POINTS' actual x range is 0.08–0.92, not 0–1) still
// reaches slightly PAST the thin lime accent ring's own left/right edge on both sides — the chart
// starts and ends "behind" that ring (which paints on top, later in the same <Svg>), not short of
// it with a gap. 0.42 is (0.5 - 0.08) — the fraction of the box each edge point sits from center.
const TREND_BOX_W = RING_RADIUS * 2.5;
const TREND_BOX_H = RING_RADIUS * 0.46;
const TREND_ORIGIN_X = RING_CENTER_X - TREND_BOX_W / 2;
// DEFAULT index into TREND_POINTS marking the highlighted point — the peak the "+30%" pill, the
// date label, and the draggable dot marker are pinned to (Figma reference). The user can drag the
// dot to any of the 7 points (InsightsWheel's `selectedTrendIndex` state), which is why this is
// only the INITIAL value, not a fixed constant used directly at render time.
const TREND_HIGHLIGHT_INDEX = 4;

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

// A second, muted "echo" trace layered BEHIND the main line (Figma reference) — its own point set
// (not the same points offset/duplicated) so it visibly crosses the main line rather than reading
// as a flat parallel shadow.
// TODO(insights-mvp): purely decorative for now, no real meaning behind it — decide later whether
// to wire it to actual data once a history endpoint exists. Candidates discussed: last period's
// spend vs this period's, or an "ideal budget pace" line (how much you SHOULD have spent by now)
// vs actual — either would give real context ("you're spending faster than last month") instead
// of just decoration.
const TREND_ECHO_POINTS: readonly [number, number][] = [
  [0.08, 0.42], [0.22, 0.35], [0.36, 0.58], [0.5, 0.45], [0.64, 0.55], [0.78, 0.3], [0.92, 0.48],
];

// One date per TREND_POINTS entry (index 0 = oldest/leftmost, last = today/rightmost) — the
// draggable dot shows which day it's currently pinned to. Decorative squiggle, real dates: the
// user can drag along a real week even though there's no per-day series behind it yet.
function trendDates(): Date[] {
  const today = new Date();
  return TREND_POINTS.map((_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (TREND_POINTS.length - 1 - i));
    return d;
  });
}

// "06 de Jun, 2026" (es) / "Jun 06, 2026" (en) / "06 de Jun de 2026" (pt) — hand-built per language
// since none of the three read right from a single Intl.DateTimeFormat pattern.
function formatTrendDate(date: Date, lang: Lang): string {
  const day = date.toLocaleDateString(lang, { day: "2-digit" });
  const rawMonth = date.toLocaleDateString(lang, { month: "short" }).replace(".", "");
  const month = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);
  const year = date.getFullYear();
  if (lang === "en") return `${month} ${day}, ${year}`;
  if (lang === "pt") return `${day} de ${month} de ${year}`;
  return `${day} de ${month}, ${year}`;
}

function trendPoints(points: readonly [number, number][] = TREND_POINTS) {
  return points.map(([nx, ny]) => ({
    x: TREND_ORIGIN_X + nx * TREND_BOX_W,
    y: TREND_BOX_TOP + ny * TREND_BOX_H,
  }));
}

function trendLinePath(points: readonly [number, number][] = TREND_POINTS): string {
  return trendPoints(points)
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");
}

function trendAreaPath(): string {
  const pts = trendPoints();
  const bottomY = TREND_BOX_TOP + TREND_BOX_H;
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  return `${line} L ${pts[pts.length - 1].x} ${bottomY} L ${pts[0].x} ${bottomY} Z`;
}

// The chart box is WIDER than the ring (TREND_BOX_W = 2.5×radius) so the LINE bleeds behind the
// thin lime ring at both edges — but that pushes the extreme vertices (index 0 and 6) OUTSIDE the
// ring circle. The line is clipped so those stubs vanish cleanly, but the interactive dot / tap
// targets are plain RN Views (unclipped), so they'd land outside the ring. Restrict all
// interaction (dot position, tappable vertices, drag-snap) to only the vertices actually INSIDE
// the ring (minus the dot's own radius as margin) so the dot can never sit on the ring or beyond.
const DOT_RADIUS = 9;
const INTERACTIVE_TREND_INDICES = trendPoints()
  .map((p, i) => ({ p, i }))
  .filter(({ p }) => Math.hypot(p.x - RING_CENTER_X, p.y - RING_CENTER_Y) <= RING_RADIUS - DOT_RADIUS - 4)
  .map(({ i }) => i);

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

// The eye button under the budget figure — same press-scale + haptic feel as the nav buttons.
// Lime on dark, dark-green on light.
function EyeButton({ isDark, onPress, label }: { isDark: boolean; onPress: () => void; label: string }) {
  const pressScale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: pressScale.value }] }));
  const onPressIn = () => {
    pressScale.value = withSpring(0.88, { damping: 15, stiffness: 320, mass: 0.6 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 11, stiffness: 220, mass: 0.7 });
  };
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      hitSlop={10}
      style={[{ marginTop: 8 }, animStyle]}
    >
      <Icon as={Eye} size={26} color={isDark ? "#C2FB7E" : "#034842"} strokeWidth={2.5} />
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
  const lang = useLang(); // re-render on language change AND the value itself, for the trend date label
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  // The trend dot is draggable along the 7 TREND_POINTS — dragging it updates the date label
  // above the "+30%" pill (formatTrendDate) to whichever day that point represents. A ref mirrors
  // the state so the PanResponder (created once via useRef) always reads the CURRENT index instead
  // of the one captured when it was first created (plain state would go stale in that closure).
  // Default to a vertex GUARANTEED to be inside the ring (TREND_HIGHLIGHT_INDEX may be an edge one
  // once the box is widened) — pick the interactive index nearest the original highlight.
  const initialTrendIndex = INTERACTIVE_TREND_INDICES.includes(TREND_HIGHLIGHT_INDEX)
    ? TREND_HIGHLIGHT_INDEX
    : (INTERACTIVE_TREND_INDICES[Math.floor(INTERACTIVE_TREND_INDICES.length / 2)] ?? 0);
  const [selectedTrendIndex, setSelectedTrendIndexState] = useState(initialTrendIndex);
  const selectedTrendIndexRef = useRef(initialTrendIndex);
  const setSelectedTrendIndex = (index: number) => {
    selectedTrendIndexRef.current = index;
    setSelectedTrendIndexState(index);
  };
  const dotDragStartX = useRef(0);
  const dotPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dotDragStartX.current = trendPoints()[selectedTrendIndexRef.current].x;
      },
      onPanResponderMove: (_, gesture) => {
        const draggedX = dotDragStartX.current + gesture.dx;
        const pts = trendPoints();
        // Only snap to vertices INSIDE the ring — never the clipped-off edge ones.
        let nearest = selectedTrendIndexRef.current;
        let minDist = Infinity;
        INTERACTIVE_TREND_INDICES.forEach((i) => {
          const dist = Math.abs(pts[i].x - draggedX);
          if (dist < minDist) {
            minDist = dist;
            nearest = i;
          }
        });
        if (nearest !== selectedTrendIndexRef.current) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSelectedTrendIndex(nearest);
        }
      },
    }),
  ).current;
  const trendDot = trendPoints()[selectedTrendIndex];
  // Trend line gradient: lime → current green → lime, with the GREEN centered on the dot's x — so
  // the "hot" color radiates out from wherever the dot currently sits and fades to lime toward
  // both ends. Recomputed each render as the dot moves. Uses userSpaceOnUse so x1/x2 are the
  // line's real pixel extent (first→last point) and the center offset is the dot's fraction along it.
  const trendLineStartX = trendPoints()[0].x;
  const trendLineEndX = trendPoints()[trendPoints().length - 1].x;
  const trendDotFrac = Math.min(
    0.85,
    Math.max(0.15, (trendDot.x - trendLineStartX) / (trendLineEndX - trendLineStartX)),
  );

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
              {/* Horizontal lime→green→lime along the line's real x-extent, green centered on the
                  dot (trendDotFrac) — moves with the dot. */}
              <LinearGradient
                id="trendLineGrad"
                gradientUnits="userSpaceOnUse"
                x1={trendLineStartX}
                y1="0"
                x2={trendLineEndX}
                y2="0"
              >
                <Stop offset="0" stopColor="#C2FB7E" />
                <Stop offset={trendDotFrac} stopColor="#3DBE64" />
                <Stop offset="1" stopColor="#C2FB7E" />
              </LinearGradient>
              {/* The chart's box is WIDER than the ring (TREND_BOX_W) on purpose — it should start
                  and end BEHIND the thin lime accent ring on both sides, not stop short of it with
                  a gap. Clip to that ring's own circle so the overflow disappears cleanly instead
                  of spilling past the ring into the background outside the blob. */}
              <ClipPath id="trendClip">
                <Circle cx={RING_CENTER_X} cy={RING_CENTER_Y} r={RING_RADIUS - 2} />
              </ClipPath>
            </Defs>
            <G clipPath="url(#trendClip)">
              {/* Muted echo trace, drawn FIRST (underneath) — theme-inverted so it always reads
                  against the blob (light/whitish on the dark blob, darker teal on the light one). */}
              <Path
                d={trendLinePath(TREND_ECHO_POINTS)}
                stroke={isDark ? "rgba(255,255,255,0.4)" : "rgba(3,72,66,0.22)"}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path
                d={trendAreaPath()}
                fill="url(#trendFillGrad)"
              />
              <Path
                d={trendLinePath()}
                stroke="url(#trendLineGrad)"
                strokeWidth={4.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </G>
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

      {/* Tappable hit area at each INTERACTIVE vertex (those inside the ring) — tapping one jumps
          the dot straight to it (in addition to dragging). Rendered BEFORE the dot so it's on top. */}
      {variant === "populated" &&
        INTERACTIVE_TREND_INDICES.map((i) => {
          const p = trendPoints()[i];
          return (
            <Pressable
              key={`trend-hit-${i}`}
              accessibilityRole="button"
              onPress={() => {
                if (i === selectedTrendIndexRef.current) return;
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedTrendIndex(i);
              }}
              style={{
                position: "absolute",
                left: p.x - 18,
                top: p.y - 18,
                width: 36,
                height: 36,
              }}
            />
          );
        })}

      {/* Draggable "today" dot — a plain RN View (not an SVG shape) so PanResponder works reliably,
          same pattern as CategoryMarkerDot/NavButton. Dragging it snaps to the nearest INTERACTIVE
          vertex and updates the date label pinned above the "+30%" pill below. Tapping any vertex
          (hit areas above) also jumps it there. */}
      {variant === "populated" && (
        <View
          {...dotPanResponder.panHandlers}
          style={{
            position: "absolute",
            left: trendDot.x - 18,
            top: trendDot.y - 18,
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <View
            style={{
              width: DOT_RADIUS * 2,
              height: DOT_RADIUS * 2,
              borderRadius: DOT_RADIUS,
              backgroundColor: "#FFFFFF",
              borderWidth: 2.5,
              borderColor: "#3DBE64",
            }}
          />
        </View>
      )}

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
        <>
          {/* FIXED position near the top of the chart box — the date + pill stay put even as the
              dot is dragged across vertices (only their text content changes, not their spot). */}
          {effectiveTrendPercent !== undefined && (
            <View
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: TREND_BOX_TOP - 33,
                alignItems: "center",
                gap: 4,
              }}
            >
              <Text className="text-muted" style={{ fontSize: 11, fontWeight: "600" }}>
                {formatTrendDate(trendDates()[selectedTrendIndex], lang)}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  // TODO(insights-mvp): open a modal listing every expense recorded on
                  // trendDates()[selectedTrendIndex] — the day-detail breakdown behind this pill.
                }}
                style={{
                  backgroundColor: "#C2FB7E",
                  borderRadius: 12,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ color: "#034842", fontSize: 11, fontWeight: "700" }}>
                  {effectiveTrendPercent >= 0 ? "+" : ""}
                  {effectiveTrendPercent}%
                </Text>
              </Pressable>
            </View>
          )}
          {/* The money text starts a fixed gap BELOW the chart's own bottom edge (TREND_BOX_TOP +
              TREND_BOX_H), so it can never crowd into the squiggle again regardless of how the
              chart's own box is retuned later. */}
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: TREND_BOX_TOP + TREND_BOX_H - 8,
              alignItems: "center",
            }}
          >
            <Text className="text-muted" style={{ fontSize: 18 }}>
              {t("insights.wheel.totalExpense")}
            </Text>
            <Text
              className="text-text"
              style={{ fontFamily: AKSHAR_SEMIBOLD, fontSize: 34, marginBottom: 6 }}
            >
              -{formatMoney(Math.abs(totalExpenseMinor), currency)}
            </Text>
            <Text className="text-muted" style={{ fontSize: 14 }}>
              {t("insights.wheel.budget")}
            </Text>
            <Text className="text-text" style={{ fontFamily: AKSHAR_MEDIUM, fontSize: 16 }}>
              {formatMoney(budgetMinor, currency)}
            </Text>
            {/* Eye button — animated + haptic. TODO(insights-mvp): navigate to a dedicated
                detail/overview screen (router.push), not an in-place toggle. */}
            <EyeButton
              isDark={isDark}
              label={t("insights.wheel.toggleVisibility")}
              onPress={() => {
                // TODO(insights-mvp): router.push to the details screen this eye opens.
              }}
            />
          </View>
        </>
      )}

      {NAV_BUTTONS.map((spec) => (
        <NavButton key={spec.id} spec={spec} isDark={isDark} />
      ))}
    </View>
  );
}
