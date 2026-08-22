# grocery-concept — manual reference

| | |
|---|---|
| **Source** | user-supplied video (no 60fps MCP) |
| **Original URL** | /Users/ismartz/Movies/Details Supermarket Save.mp4 |
| **Clip** | `Details Supermarket Save.mp4` (1068x2160, 18.111000s) — inside each pattern folder |
| **Frames** | `<pattern>/frames/` at 60fps |
| **Captured** | 2026-08-19 |

## Patterns distilled from this shot

- [`deliberate-return-sheet`](./deliberate-return-sheet/PATTERN.md)

## The five motion windows

Measured by `from-video.sh` at 60 fps. Only ONE is distilled so far — the rest are still in the clip
and a future session should not have to re-watch 18 s to find them.

| # | ms | live motion | what it is | distilled |
|---|---|---|---|---|
| w1 | 4083-4317 | 134 ms | the detail column reveals top-to-bottom by opacity: name → size → price → badges → rating → blurb | ✗ candidate: `cascading-detail-reveal` |
| w2 | 7317-7500 | 83 ms | the store picker rises (~150 ms measured) | ✓ `deliberate-return-sheet` |
| w3 | 9900-10467 | 467 ms | the picker leaves and hands the page back (~420 ms measured) | ✓ same |
| w4 | 12750-13050 | 200 ms | scroll — a gesture, not an animation | — |
| w5 | 17233-17767 | 434 ms | screen pop: the detail slides right, the list returns underneath | ✗ candidate |

⭐ **w5 is the open question of this shot.** At ~434 ms it agrees with w3's slow return, which either
means the design has a principle about handing context back, or that it has ONE slow preset applied
to everything. The two are indistinguishable from this clip alone, and that is why
`deliberate-return-sheet` stays `single-source`.

## Evidence

Graded `single-source` — one user-supplied clip, which is the NORMAL case without the MCP.
This does not block anything. Run the 5-question corroboration checklist in SKILL.md §5 and record
the answers in PATTERN.md; passing questions 1, 3 and 4 upgrades it to `corroborated`.
More clips of OTHER apps doing the same thing, ingested as siblings here, would make it
`confirmed`.

> The clip is a REFERENCE for studying the motion. The code in `src/` is ours.
> Never ship the app's copy, brand or assets.
