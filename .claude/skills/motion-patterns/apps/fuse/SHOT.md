# fuse — 60fps MCP + measured video

| | |
|---|---|
| **Source** | 60fps.design MCP (`source: "generated"`) **and** the clip, measured |
| **Shot** | `fuse-intro-value-prop-cycle-animation` |
| **Original URL** | https://60fps.design/shots/fuse-intro-value-prop-cycle-animation |
| **Clip** | `focus-slot-ticker.mp4` (2000x2000, 7.95 s, 60 fps) — inside the pattern folder |
| **Frames** | `<pattern>/frames/` |
| **Captured** | 2026-08-18 |

## Patterns distilled from this shot

- [`focus-slot-ticker`](./focus-slot-ticker/PATTERN.md)

## Evidence

Graded **`corroborated`**: one clip, but questions 1, 3 and 4 of the SKILL.md §5 checklist pass and
the answers are recorded in `PATTERN.md`.

⭐ `library.py triangulate fuse` suggested `confirmed` and it was **rejected**. Its overlap came
from `onboarding` — a product context, not a mechanism — and from generic verbs shared with a
bottom sheet and a tutorial. No other app in the library implements a focus slot; the nearest,
`brilliant/traveling-selection-indicator`, is the inverse (the indicator travels to the item rather
than the items travelling to the indicator). Ingesting another app's clip of the same mechanism as
a sibling here would make it `confirmed` honestly.

## Where the numbers came from

The reference's metadata, its generated Swift file and the video **all disagree**. The video wins;
the table is in `PATTERN.md`. Note also that the motion segmenter could not see this animation —
the moving text is a few dozen pixels inside a 2000 px frame — so everything was measured off a
whole-clip kymograph of the ticker band instead of the extracted windows.

> The clip is a REFERENCE for studying the motion. The code in `src/` is ours.
> Never ship the app's copy, brand or assets.
