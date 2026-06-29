---
name: cuadra-design-system
description: >
  Cuadra's visual language for the Expo app — dark/light themes, green brand palette,
  card/FAB/tile/bubble components, and the signature screen patterns (Insights wheel,
  Daily Diary, News masonry, Chat, Save marketplace). Lucide icons. Gamified, warm, rounded.
  Trigger: Building or styling any screen/component in apps/mobile, or defining theme tokens.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Composes with the official Expo skills.** Use `building-native-ui` (styling, components,
> navigation, **animations**) + `expo-tailwind-setup` (NativeWind) for the HOW; this skill defines
> Cuadra's WHAT (palette, components, screen patterns). Charts (the wheel) & gamification motion:
> build with `building-native-ui` + `react-native-svg`/reanimated, styled per the tokens below;
> distill a `cuadra-mobile-charts` skill from the real wheel code once it exists.

## When to Use

- Styling a screen/component, choosing colors, spacing, radii, icons.
- Building one of the signature screens (Insights, Daily Diary, News, Chat, Save).
- Defining `tailwind.config.js` theme tokens.

## Critical Patterns

**1. Theme — dark + light, warm green (NOT cold fintech blue). Both first-class.**

| Token | Dark | Light |
|---|---|---|
| `bg` | near-black green-tinted `#0B1410` | off-white green-tinted `#F2F7F1` |
| `surface` (cards) | `#12201A` w/ 1px lime border | white w/ soft shadow + faint lime border |
| `primary` (brand) | `#16A34A` | `#16A34A` |
| `accent` (lime, CTAs/active) | `#A3E635` | `#A3E635` |
| `chip-dark` | deep green `#15302450` | deep green |
| `text` / `muted` | `#F7FAF7` / `#9CA3AF` | `#111827` / `#6B7280` |

- Money colors (metric tiles): income=blue, expenses=orange/red, savings=purple/pink, balance=green. Spent=red, positive=green.
- Radii: cards `rounded-3xl`, tiles/chips `rounded-2xl`, pills fully rounded. Generous padding, soft borders, subtle glow on dark.

**2. Core components (build these in `components/ui`, reuse everywhere).**

| Component | Notes |
|---|---|
| `Card` | rounded-3xl surface w/ border/shadow; the base of every block |
| `ScallopFab` | flower/scalloped circular FAB (the green "Add" + center tab logo) |
| `MetricTile` | colored tile: label + amount + lucide icon (Income/Expenses/Savings/Balance) |
| `MoneyText` | formats minor units w/ currency exponent; large integer + small decimals + sign color |
| `TxRow` | recent-transaction row: merchant icon, name, date, amount, chevron |
| `Chip` / `SegmentedTabs` | DOP/USD toggle, Hoy·Semana·Mes·Trimestre |
| `IconButton` | round lucide button (the wheel's satellite buttons) |
| `Bubble` | chat: agent (left, green accent bar) vs user (right, green bubble) |
| `Avatar`, `Gauge`/`ProgressRing` | profile pic; the budget arc + "+75%" + ⭐ gamification |

**3. Signature screens (compose from the components above).**

- **Insights (Home):** the **wheel** — circular gauge (Total Expense vs Budget, green→red arc w/ category markers) + center `ScallopFab` "Add" + 7 satellite `IconButton`s (wallet, reports/pie, budget/$, alerts/bell, ⊕ category, ☆ goals, metrics toggle). Below: carousel of cards — Accounts (4 `MetricTile` + Recent `TxRow`s), Spaces, Daily Diary (wallet stack + DOP/USD `SegmentedTabs` + Daily Target / You spent today + ring + ⭐).
- **News:** masonry feed of `Card`s — @handle + verified, title, body, ❤️ Likes, bookmark, expand. (Pinterest/X vibe.)
- **Chat (AISpace):** `Bubble` list + input pill ("Ask me Something…") with send + `+` (attach) + mic; menu/expand top. Receipt/image cards inline. **Feel = Cleo/ChatGPT:** agent replies stream with a soft **per-word fade-in** (`StreamingText`: each word `opacity 0→1` + 6px rise via `useSharedValue`+`withTiming`, NOT reanimated `entering`). Scroll is **top-aligned** with **elastic bounce** (`alwaysBounceVertical`) and **smart auto-follow** (only sticks to bottom if already there). A configurable **personality** (😐 Neutro / 🎉 Coach / 🔥 Roast) sets the agent's voice (Config → Personalidad). Engineering details + gotchas: `cuadra-mobile` §6.
- **Save:** Uber-Eats/Walmart marketplace — category chips, featured carousel, product cards, search pill. (Supermarkets / products / financial products.)
- **Tab bar:** News · Insights (red dot) · [center scallop `iAM` logo] · Save · Config, with a wavy notch around the center FAB.

**4. Gamification (Duolingo-style):** streaks, progress rings, ⭐ rewards, "+75%" badges, warm celebratory microcopy. Use for budget adherence & goals.

**5. i18n:** all visible copy via `src/i18n` (es/en/pt). No hardcoded user-facing strings.

## Commands

```bash
# Browse curated reference flows (Duolingo / Uber Eats / Walmart): mobbin.com
pnpm --filter @cuadra/mobile typecheck
```

## Resources

- **Engineering conventions**: load the `cuadra-mobile` skill (structure, NativeWind, data, auth).
- **Icons**: lucide.dev → `lucide-react-native`.
- **UI spec of record**: `docs/sdd/insights-ui-navbar.md` (the wheel, carousel, 7 buttons).
