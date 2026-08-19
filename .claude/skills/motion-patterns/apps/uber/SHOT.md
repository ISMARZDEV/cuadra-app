# uber — user-supplied clip

| | |
|---|---|
| **Source** | local file, no 60fps MCP |
| **Clip** | `Uber.mp4` (1620x2160, 9.066s, 60fps) — inside the pattern folder |
| **Frames** | `in-place-tab-crossfade/frames/` — 59 frames across 6 windows, 1080px |
| **Trigger** | `tap` |
| **Evidence** | `corroborated` |

## Patterns distilled from this shot

- [`in-place-tab-crossfade`](./in-place-tab-crossfade/PATTERN.md)

## Measured

| | |
|---|---|
| body fade | **280 ms**, ease-out, opacity only |
| header morph | ~180 ms — settles before the body |
| horizontal travel | **0 px** |
| swaps observed | **2** (both directions, same timing) |

The clip also contains a push to a trip-planning screen (windows 1-3) that was not distilled —
it is a standard navigation push and adds nothing the library does not have.

## Evidence

`corroborated`: one clip, but the swap appears twice in both directions with identical timing.
Checklist answers at the end of PATTERN.md.

> The clip is a REFERENCE for studying the motion. The code in `src/` is ours.
> Never ship the app's copy, brand or assets.
