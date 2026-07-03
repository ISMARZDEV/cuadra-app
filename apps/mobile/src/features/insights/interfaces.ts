// Insights feature interfaces (structure §3 → features/{…, interfaces}). Component props live
// here, not inline, so screens/components stay composition-only.

// One category's slice of the wheel's budget-consumption arc. `weight` is proportional — bands
// don't need to sum to any particular total, the wheel normalizes them across whatever portion of
// the arc is actually "spent" (see InsightsWheelProps). `emoji`/`ringColor` are optional: omit
// both for a plain color band with no badge (e.g. DEFAULT_BANDS' generic green→red gradient) —
// when `emoji` IS set, its badge is pinned at the END of THIS band's own arc segment (Figma: the
// badge marks where a category's spending stops, never centered inside its color).
export interface WheelBand {
  colorHex: string;
  weight: number;
  emoji?: string;
  ringColor?: string; // badge border — defaults to `colorHex` when `emoji` is set
  // The emoji badge IS a button (tap → that category's stats/details) — only meaningful when
  // `emoji` is also set; a plain color band with no badge has nothing to press.
  onPress?: () => void;
}

export interface InsightsWheelProps {
  variant: "empty" | "populated";
  totalExpenseMinor: number;
  budgetMinor: number;
  currency: string;
  trendPercent?: number; // the "+X%" pill — omit to hide it
  // The colored arc only fills up to `totalExpenseMinor / budgetMinor` of the full sweep (capped
  // at 100% — the ring closes completely only once spending reaches or exceeds the budget); the
  // rest of the sweep stays the plain muted track. `bands` defaults to 4 equal green/yellow/
  // orange/red bands with no badges.
  bands?: WheelBand[];
  onAddPress?: () => void;
}
