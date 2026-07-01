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
import { Pressable, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";

import { Icon } from "@/components/ui/icon";
import { ScallopFab } from "@/components/ui/scallop-fab";
import { t, useLang } from "@/i18n";
import { formatMoney } from "@/lib/money";
import { AKSHAR_MEDIUM, AKSHAR_SEMIBOLD } from "@/theme/fonts";

import type { CategoryMarker, InsightsWheelProps, WheelBand } from "../interfaces";
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
const SIZE = 320;
const SCALE = SIZE / REF_W;
const HEIGHT = REF_H * SCALE;

// Ring centerline, in MY scaled pixels — derived from the reference's inner-gradient-ring rect
// (x=48.63,y=44.82,w=253.09,rx=126.54 ⇒ center 175.17,171.36 ⇒ radius 126.54).
const RING_CENTER_X = 175.17 * SCALE;
const RING_CENTER_Y = 171.36 * SCALE;
const RING_RADIUS = 126.54 * SCALE;
const RING_STROKE = 14;

// Gauge opens at the bottom — wide enough to clear the 7-icon fan below it (angle convention:
// 0°=3 o'clock, increasing clockwise since screen y grows downward).
const ARC_START_DEG = 165;
const ARC_END_DEG = 375; // 210° sweep

const DEFAULT_BANDS: WheelBand[] = [
  { colorHex: "#3DBE64", weight: 1 }, // green
  { colorHex: "#E8D44D", weight: 1 }, // yellow
  { colorHex: "#F2994A", weight: 1 }, // orange
  { colorHex: "#EB5757", weight: 1 }, // red
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

function trendPath(innerRadius: number): string {
  const box = innerRadius * 1.5;
  const originX = RING_CENTER_X - box / 2;
  const originY = RING_CENTER_Y - box / 2.6;
  return TREND_POINTS.map(([nx, ny], i) => {
    const x = originX + nx * box;
    const y = originY + ny * box * 0.6;
    return `${i === 0 ? "M" : "L"} ${x} ${y}`;
  }).join(" ");
}

function CategoryMarkerDot({ marker }: { marker: CategoryMarker }) {
  const { x, y } = polarPoint(RING_CENTER_X, RING_CENTER_Y, RING_RADIUS, marker.angleDeg);
  const badgeSize = 26;
  return (
    <View
      style={{
        position: "absolute",
        left: x - badgeSize / 2,
        top: y - badgeSize / 2,
        width: badgeSize,
        height: badgeSize,
        borderRadius: badgeSize / 2,
        backgroundColor: "white",
        borderWidth: 2,
        borderColor: marker.ringColor,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: 14 }}>{marker.emoji}</Text>
    </View>
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
const SATELLITE_SIZE = 42 * SCALE;
const SIDE_BUTTON_SIZE = 27.5 * SCALE;

function NavButton({ spec, isDark }: { spec: NavButtonSpec; isDark: boolean }) {
  const { x, y } = polarPoint(RING_CENTER_X, RING_CENTER_Y, FAN_RADIUS[spec.role], spec.angleDeg);
  // Side buttons: lime in BOTH themes. Home pill vs. the 4 satellites: theme-inverted PAIR — when
  // the pill is dark-green, satellites are lime, and vice versa (exact reference behavior).
  const bg =
    spec.role === "side" ? "#C2FB7E" : spec.role === "home" ? (isDark ? "#034842" : "#C2FB7E") : isDark ? "#C2FB7E" : "#034842";
  const fg = spec.role === "side" ? "#034842" : spec.role === "home" ? (isDark ? "#C2FB7E" : "#034842") : isDark ? "#034842" : "#C2FB7E";
  const isPill = spec.role === "home";
  const w = isPill ? HOME_PILL_W : spec.role === "satellite" ? SATELLITE_SIZE : SIDE_BUTTON_SIZE;
  const h = isPill ? HOME_PILL_H : w;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(spec.labelKey)}
      onPress={() => {}} // TODO(insights-mvp): only "home" is a real section this pass — see docs/sdd/insights-home-mvp.md
      style={{
        position: "absolute",
        left: x - w / 2,
        top: y - h / 2,
        width: w,
        height: h,
        borderRadius: h / 2,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon as={spec.icon} size={isPill ? 20 : spec.role === "side" ? 15 : 18} color={fg} />
    </Pressable>
  );
}

export function InsightsWheel({
  variant,
  totalExpenseMinor,
  budgetMinor,
  currency,
  trendPercent,
  bands = DEFAULT_BANDS,
  markers = [],
  onAddPress,
}: InsightsWheelProps) {
  useLang(); // re-render on a language change — t() alone reads a module var, invisible to React
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  const totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
  const sweep = ARC_END_DEG - ARC_START_DEG;
  let cursor = ARC_START_DEG;
  const bandArcs = bands.map((band) => {
    const bandSweep = (band.weight / totalWeight) * sweep;
    const start = cursor;
    const end = cursor + bandSweep;
    cursor = end;
    return { ...band, start, end };
  });

  return (
    <View style={{ width: SIZE, height: HEIGHT }}>
      {/* Drop-shadow caster — the reference's blob has a `feGaussianBlur` drop shadow (dy≈3.8,
          blur≈8, opacity 0.25 dark / 0.12 light) that reanimated-svg can't reproduce as an SVG
          filter cross-platform. A transparent, roughly-blob-sized rounded View casting a modern
          CSS boxShadow gets the same "lifted off the page" effect — critical in light mode, where
          the blob's own fill is flat white and otherwise invisible against a white background. */}
      <View
        style={{
          position: "absolute",
          left: RING_CENTER_X - RING_RADIUS - 15,
          top: RING_CENTER_Y - RING_RADIUS - 5,
          width: (RING_RADIUS + 15) * 2,
          height: (RING_RADIUS + 15) * 2,
          borderRadius: RING_RADIUS + 15,
          backgroundColor: "transparent",
          boxShadow: isDark ? "0px 6px 14px rgba(0,0,0,0.35)" : "0px 6px 14px rgba(0,0,0,0.14)",
        }}
      />
      <Svg width={SIZE} height={HEIGHT} viewBox={`0 0 ${REF_W} ${REF_H}`} style={{ position: "absolute" }}>
        <Defs>
          {/* Light: a soft lime top → white (the shadow keeps the white bottom from vanishing on a
              white page). Dark: near-black teal → deeper teal (the reference's own blob gradient). */}
          <LinearGradient id="wheelBlob" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isDark ? "#00160D" : "#DCF6B0"} />
            <Stop offset="0.534" stopColor={isDark ? "#012623" : "#FBFFF6"} />
            <Stop offset="0.976" stopColor={isDark ? "#014640" : "#FFFFFF"} />
          </LinearGradient>
        </Defs>
        <Path d={BLOB_PATH} fill="url(#wheelBlob)" />
      </Svg>

      <InsightsWheelTexture
        cx={RING_CENTER_X}
        cy={RING_CENTER_Y}
        radius={RING_RADIUS - RING_STROKE / 2 - 2}
        isDark={isDark}
      />

      <Svg width={SIZE} height={HEIGHT} style={{ position: "absolute" }}>
        {/* Muted background track — always visible, both variants. */}
        <Path
          d={arcPath(RING_CENTER_X, RING_CENTER_Y, RING_RADIUS, ARC_START_DEG, ARC_END_DEG)}
          stroke="#E1E3EA"
          strokeOpacity={isDark ? 0.25 : 0.6}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
        />
        {variant === "populated" &&
          bandArcs.map((band, i) => (
            <Path
              key={i}
              d={arcPath(RING_CENTER_X, RING_CENTER_Y, RING_RADIUS, band.start, band.end)}
              stroke={band.colorHex}
              strokeWidth={RING_STROKE}
              strokeLinecap={i === 0 || i === bandArcs.length - 1 ? "round" : "butt"}
              fill="none"
            />
          ))}
        {variant === "populated" && (
          <Path
            d={trendPath(RING_RADIUS - RING_STROKE * 2)}
            stroke="#3DBE64"
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        )}
        {/* Thin inner ring, fading from a lime top — the reference's exact gradient stroke. */}
        <Defs>
          <LinearGradient id="innerRingGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#C2FB7E" />
            <Stop offset={isDark ? "0.707" : "0.76"} stopColor={isDark ? "#C2FB7E" : "#FFFFFF"} stopOpacity={isDark ? 0 : 1} />
          </LinearGradient>
        </Defs>
        <Path
          d={arcPath(RING_CENTER_X, RING_CENTER_Y, RING_RADIUS - RING_STROKE / 2 - 2, 0, 359.9)}
          stroke="url(#innerRingGrad)"
          strokeWidth={1.5}
          fill="none"
        />
      </Svg>

      {variant === "populated" &&
        markers.map((marker) => <CategoryMarkerDot key={marker.id} marker={marker} />)}

      {variant === "empty" ? (
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: RING_CENTER_Y - RING_RADIUS * 0.55,
            alignItems: "center",
            paddingHorizontal: 32,
            gap: 14,
          }}
        >
          <Text className="text-center text-base text-text">{t("insights.wheel.emptyState")}</Text>
          <ScallopFab label={t("insights.wheel.addLabel")} onPress={onAddPress} />
          <Text className="text-accent" style={{ fontSize: 15, fontWeight: "700", marginTop: -6 }}>
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
          {trendPercent !== undefined && (
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
                {trendPercent >= 0 ? "+" : ""}
                {trendPercent}%
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
