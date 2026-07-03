// Default period for `useMetrics()` — the Accounts card's own selectable period, currently
// always "this calendar month" (no period picker on card ① yet).
export function currentMonthRange(): { since: string; until: string } {
  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1);
  const until = new Date(now.getFullYear(), now.getMonth() + 1, 0); // last day of the month
  return { since: toIsoDate(since), until: toIsoDate(until) };
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
