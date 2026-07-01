import type { CurrencyOptionMeta } from "./interfaces";

// The 5 active currencies (mirrors backend `ACTIVE_CURRENCIES`, shared/money) — extending that
// tuple + this list together is what "activates" a new currency end to end. Order matches the
// backend's currency_pick step / market→currency map.
export const CURRENCY_OPTIONS: CurrencyOptionMeta[] = [
  { code: "DOP", flag: "🇩🇴", labelKey: "currency.dop.label" },
  { code: "USD", flag: "🇺🇸", labelKey: "currency.usd.label" },
  { code: "COP", flag: "🇨🇴", labelKey: "currency.cop.label" },
  { code: "BRL", flag: "🇧🇷", labelKey: "currency.brl.label" },
  { code: "EUR", flag: "🇪🇺", labelKey: "currency.eur.label" },
];

export const MAX_EXTRA_CURRENCIES = 3;
