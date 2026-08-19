# recollect — `recollect-splash`

| | |
|---|---|
| **Page** | https://60fps.design/shots/recollect-splash |
| **Clip** | `recollect-splash.mp4` (1.5 MB) — inside each pattern folder |
| **`source`** | `recipes` |
| **Trigger** | `system event` |
| **Captured** | 2026-08-18 |

## Patterns distilled from this shot

- [`splash-logo-settle`](./splash-logo-settle/PATTERN.md)

## Triangulation

Distinct apps solving the same thing (4 references):

- `lampa-splash` — https://60fps.design/shots/lampa-splash
- `veed-splash` — https://60fps.design/shots/veed-splash
- `peaks-splash` — https://60fps.design/shots/peaks-splash
- `clocks-splash-get-started` — https://60fps.design/shots/clocks-splash-get-started

## Notes

NOT a spring. Declares `blur`, and React Native has NO per-frame motion blur — ghost trails or Skia (this repo already ships Skia for the shimmer).

> The clip is a REFERENCE for studying the motion. The code in each pattern's `src/` is
> ours. Never ship the app's copy, brand or assets.
