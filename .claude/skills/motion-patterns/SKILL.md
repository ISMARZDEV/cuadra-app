---
name: motion-patterns
description: >
  The distilled motion pattern library for this project: reusable animation patterns studied from
  real shipped iOS apps via 60fps.design and translated to Reanimated 4 + Gesture Handler + Expo +
  TypeScript. Organised BY SOURCE APP — each app folder holds its reference clip, the raw motion
  data, and one folder per pattern with our working `src/`. Covers bottom sheets, staggered reward
  recaps, orbiting loops, scripted tutorials, snap carousels, travelling selection indicators and
  splash handoffs, with the exact spring conversions already done.
  Trigger: building or tuning ANY animation in apps/mobile — before writing motion code, check
  whether a pattern here already covers it. Also when someone asks "how did app X do that", when a
  sheet/carousel/selector/splash feels wrong, or when converting iOS spring values to Reanimated.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
---

> Produced with the global `60fps-to-reanimated` skill (the METHOD). This skill is the LIBRARY.
> Composes with `cuadra-motion` (Reanimated mechanics + this repo's real defects) and
> `cuadra-ui-verify` (visual verification, which none of this replaces).

## When to Use

- Before writing any new animation in `apps/mobile` — check the catalog first.
- When a sheet, carousel, selector, recap or splash does not feel right.
- When you need a spring value converted from an iOS reference.
- When adding a NEW pattern (that is the method skill's job — see Commands).

## Layout

Organised by the app the motion was studied from. One shot can yield several unrelated patterns, so
they are siblings that share the one clip.

```
apps/<app>/
├── SHOT.md                    ← what the shot is, triangulation, notes
├── shot.json                  ← raw motion_params / animation / stagger_delay / source
└── <pattern-name>/
    ├── <shot-slug>.mp4        ← the clip, INSIDE the pattern. Watch it — keyframes are too coarse.
    ├── PATTERN.md             ← the 15 fields: physics, model, do/don't
    └── src/                   ← OUR TypeScript. Real files. Copy them, don't retype them.
```

⭐ **Every pattern folder is self-contained**: clip + doc + code together, so one folder is
everything you need. When a single shot yields several patterns each keeps its own copy of the clip
(Duolingo's 0.8 MB twice) — cheap, and worth it for self-containment.

⭐ **Clips and extracted frames are gitignored**; the docs and code are versioned. Each `shot.json`
records the `video_url`, so a fresh clone restores every clip with `./fetch-clips.sh`, and
`frames/` regenerates from the ffmpeg line in its own README. Without that URL the clips would be
unrecoverable — never add a clip without it.

⭐ **This library does not depend on the 60fps MCP.** Patterns can be added from ANY video:
`from-video.sh` ingests a URL or local file and extracts a 50 ms frame ladder, and
`measure-spring.py` derives real stiffness/damping from one overshoot. See §9 of the global
`60fps-to-reanimated` skill.

⭐ **The app folder is provenance; the pattern name is what it DOES**
(`traveling-selection-indicator`), never the app it came from. See [CATALOG.md](CATALOG.md) for the
index both ways.

## Critical Patterns

### The physics that repeats across the library

Seven patterns from six shots, and the numbers rhyme. Use these as priors before touching a dial:

- ⭐ **ζ ≈ 0.72 is the "premium" signature.** Sheet entry, carousel snap and travelling indicator all
  landed there independently, from three different apps.
- ⭐ **Stiffness is TEMPO, damping is CHARACTER.** Sheet (k195) and carousel (k632) share ζ 0.72 and
  feel like one product at two speeds. Sheet (ζ0.72) and reward cards (ζ0.50) share k195 and feel
  like two products at one speed.
- ⭐ **Transient motion springs; PERPETUAL motion is linear.** Any forever-loop needs
  `Easing.linear`, or the seam shows once per lap.
- ⭐ **Continuous VALUES never spring.** A counter that overshoots and comes back reads as a bug.
  `withTiming` for numbers, `withSpring` for geometry.
- ⭐ **One driver, N derivations.** In every pattern here exactly one shared value leads and the
  rest is `useDerivedValue` + `interpolate`.

### The conversion, when you need a new one

`ω₀ = 2π/response`; `stiffness = mass·ω₀²`; `damping = 2ζ·mass·ω₀`.
⭐ Pass `mass` explicitly — Reanimated 4 defaults to `4`, not `1`.
⭐ The exported type is `WithSpringConfig`; `SpringConfig` is internal and not exported.

## Commands

```bash
M=~/.claude/skills/60fps-to-reanimated/assets   # scripts auto-detect this project

# Add a NEW pattern (downloads the clip into the right app folder)
$M/scaffold.sh <app> <shot-slug> <pattern-name> <video-url> [triangulation-slugs...]

# Typecheck a pattern's src/ against apps/mobile — with a canary that must fail
$M/verify.sh <app> <pattern-name>
$M/verify.sh --all

# Watch a reference clip
open .claude/skills/motion-patterns/apps/<app>/<pattern>/<shot-slug>.mp4
```

## Resources

- **[CATALOG.md](CATALOG.md)** — every pattern, by pattern and by source app.
- **Method**: the global `60fps-to-reanimated` skill — how a new pattern gets distilled.
