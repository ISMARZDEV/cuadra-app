# claude — user-supplied clip

| | |
|---|---|
| **Source** | local file, no 60fps MCP |
| **Clip** | `Claude.mp4` (1620x2160, 8.106s, 60fps) — inside the pattern folder |
| **Frames** | `self-sizing-sheet/frames/` — 62 frames across 5 windows, 1080px |
| **Trigger** | `tap` |
| **Evidence** | `corroborated` |

## Patterns distilled from this shot

- [`self-sizing-sheet`](./self-sizing-sheet/PATTERN.md)

## Measured

| | |
|---|---|
| open: onset → settled | 1930 → 2150 ms = **220 ms** |
| overshoot | **none** — monotonic (Δ −56, −32, −8, −1, −1, 0) |
| resize events in the clip | **4** — the open plus three content changes, same curve |

⭐ The motion WINDOW was 867 ms; the sheet moves for 220 ms of it. The rest is press feedback and
the backdrop dim ramp. Never read a duration off a window.

## Evidence

`corroborated` from a single clip, and unusually strong for one: the same resize is observed four
separate times within the recording. Checklist answers at the end of PATTERN.md.

> The clip is a REFERENCE for studying the motion. The code in `src/` is ours.
> Never ship the app's copy, brand or assets.
