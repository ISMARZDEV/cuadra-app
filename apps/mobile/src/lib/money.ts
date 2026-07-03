// Minor-units → display formatting. Mirrors the backend's per-currency exponent table
// (apps/api/src/shared/money/__init__.py `_MINOR_EXPONENT`) — money NEVER lives as a float here
// either; every value in comes straight from the API's `*_minor` integer fields.
const MINOR_EXPONENT: Record<string, number> = {
  JPY: 0, KRW: 0, CLP: 0, VND: 0, ISK: 0, PYG: 0, XAF: 0, XOF: 0,
  RWF: 0, UGX: 0, GNF: 0, BIF: 0, DJF: 0, KMF: 0, XPF: 0,
  KWD: 3, BHD: 3, OMR: 3, TND: 3, JOD: 3, LYD: 3, IQD: 3,
};

function exponentFor(currencyCode: string): number {
  return MINOR_EXPONENT[currencyCode.toUpperCase()] ?? 2;
}

// `$1,350.00` / `-$1,350.00` (Figma style — a leading currency CODE, when shown at all, is a
// separate label the caller renders next to this, e.g. Daily Diary's "DOP" / "USD" pills).
export function formatMoney(minorUnits: number, currencyCode: string): string {
  const exponent = exponentFor(currencyCode);
  const major = minorUnits / 10 ** exponent;
  const formatted = Math.abs(major).toLocaleString("en-US", {
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  });
  return `${major < 0 ? "-" : ""}$${formatted}`;
}
