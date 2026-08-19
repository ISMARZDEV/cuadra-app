# airbnb — user-supplied clip

| | |
|---|---|
| **Source** | local file, no 60fps MCP |
| **Clip** | `Airbnb.mp4` (2160x2160, 8.767s, 60fps) — inside the pattern folder |
| **Frames** | `pill-to-panel-expansion/frames/` — 1080px, motion windows only |
| **Trigger** | `tap` |
| **Evidence** | `corroborated` |

## Patterns distilled from this shot

- [`pill-to-panel-expansion`](./pill-to-panel-expansion/PATTERN.md)

## Measured

| Window | Duration |
|---|---|
| expand 3050-3467ms | **417 ms** |
| collapse 6367-7000ms | **633 ms** |

The collapse is 1.5x the expansion — the INVERSE of the bottom-sheet asymmetry. Reasoned in
PATTERN.md: a dismissal should obey fast, a return of context should not.

## Evidence

`corroborated` from a single clip: questions 1, 3 and 4 of the SKILL.md §5 checklist pass, question
2 is a documented divergence (zeta above the library signature, asymmetry inverted — both reasoned),
and question 5 names what would demote it. Full answers at the end of PATTERN.md.

> The clip is a REFERENCE for studying the motion. The code in `src/` is ours.
> Never ship the app's copy, brand or assets.
