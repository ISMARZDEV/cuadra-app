// Insights feature interfaces (structure §3 → features/{…, interfaces}). Component props live
// here, not inline, so screens/components stay composition-only.

// A small emoji badge pinned along the wheel's arc (top-spending categories, Figma 🎶/⛽️).
// `angleDeg` follows the SAME polar coordinate system as the arc bands (insights-wheel.tsx's
// polarPoint/arcPath helpers) — deferred data this pass (see docs/sdd/insights-home-mvp.md), but
// the prop shape is final so wiring real data later is a values-only change, not a code change.
export interface CategoryMarker {
  id: string;
  emoji: string;
  angleDeg: number;
  ringColor: string;
}

// One color band of the wheel's budget-consumption heatmap arc (green→yellow→orange→red).
// `weight` is proportional — bands don't need to sum to any particular total, the wheel
// normalizes them across its own start/end sweep.
export interface WheelBand {
  colorHex: string;
  weight: number;
}

export interface InsightsWheelProps {
  variant: "empty" | "populated";
  totalExpenseMinor: number;
  budgetMinor: number;
  currency: string;
  trendPercent?: number; // the "+X%" pill — omit to hide it
  bands?: WheelBand[]; // defaults to 4 equal green/yellow/orange/red bands
  markers?: CategoryMarker[]; // [] this pass — see docs/sdd/insights-home-mvp.md
  onAddPress?: () => void;
}
