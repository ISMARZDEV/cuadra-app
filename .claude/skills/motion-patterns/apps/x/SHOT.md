# x — manual reference

| | |
|---|---|
| **Source** | user-supplied video (no 60fps MCP) |
| **Original URL** | /Users/ismartz/Movies/X-Twiter.mp4 |
| **Clip** | `X-Twiter.mp4` (1620x2160, 4.116000s) — inside each pattern folder |
| **Frames** | `<pattern>/frames/` at **60fps** — re-extracted; 20fps left only 3-4 frames inside the open, too coarse to tell a bounce from a stop |
| **Captured** | 2026-08-18 |

## Patterns distilled from this shot

- [`push-back-drawer-reveal`](./push-back-drawer-reveal/PATTERN.md)

## Evidence

Graded **`corroborated`** — one user-supplied clip, which is the NORMAL case without the MCP.

`library.py triangulate x` reported no overlap and suggested `single-source`. That suggestion was
read and **not accepted**: it compares `interaction_pattern` verbs, and the library contains no
other drawer at all, so the silence is absence of evidence rather than evidence of idiosyncrasy.
SKILL.md §5's checklist decides, and questions 1, 3 and 4 pass — the stated floor. The full five
answers, including what would FALSIFY the grade, are in
[`push-back-drawer-reveal/PATTERN.md`](./push-back-drawer-reveal/PATTERN.md).

A clip of another app pushing its content aside the same way, ingested as a sibling here, would
take this to `confirmed`.

## What the clip contains

| Window | Span | Motion | |
|---|---|---|---|
| w1 | 517 → 1000 ms | 652 → 834 ms (**182 ms**) | screen slides aside, panel uncovered |
| w2 | 2617 → 3317 ms | 2767 → 2967 ms (**200 ms**) | screen returns |
| w3 | 3850 → 4067 ms | **none** | segmenter noise — luminance constant to 0.1/255 across all 14 frames |

Measured: ζ 0.84, ω₀ 25.3 → `{ mass: 1, stiffness: 640, damping: 42.5 }`, the same spring both ways.
