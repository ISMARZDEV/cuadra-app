# Motion pattern catalog

Organised **by source app**. Each pattern folder is self-contained: reference clip, the doc, and our
code. Open a folder and you have everything.

```
apps/<app>/
├── SHOT.md                    what the shot is + triangulation
├── shot.json                  raw motion data + video_url
└── <pattern>/
    ├── <shot-slug>.mp4        the clip — gitignored, restore with ./fetch-clips.sh
    ├── PATTERN.md             the 15 fields
    └── src/                   our TypeScript
```

Clips and any extracted `frames/` are study material, not source, so they stay out of git.
`./fetch-clips.sh` re-downloads clips from the `video_url` in each `shot.json`.

New patterns can come from the 60fps MCP **or from any video you supply** — see §9 of the global
`60fps-to-reanimated` skill (`from-video.sh` + `measure-spring.py`).

## By app

| App | Shot | Pattern | Physics | Code |
|---|---|---|---|---|
| **abode** | `abode-invite-friends-pop-animation` | [`premium-bottom-sheet-spring`](apps/abode/premium-bottom-sheet-spring/PATTERN.md) | spring ζ0.72 · k195 | ✅ verified |
| **duolingo** | `duolingo-cards-spin-mascot-word-wizard-animation` | [`reward-recap-stagger`](apps/duolingo/reward-recap-stagger/PATTERN.md) | spring ζ0.50 · k195 | ✅ verified |
| **duolingo** | ↑ same shot | [`orbiting-satellites`](apps/duolingo/orbiting-satellites/PATTERN.md) | linear loop 8 s | ✅ verified |
| **arc-search** | `arc-search-add-widget-animation` | [`ghost-touch-walkthrough`](apps/arc-search/ghost-touch-walkthrough/PATTERN.md) | ease-out 450 ms | ✅ verified |
| **flighty** | `flighty-pricing` | [`snap-carousel-spring`](apps/flighty/snap-carousel-spring/PATTERN.md) | spring ζ0.72 · k632 | ✅ verified |
| **brilliant** | `brilliant-choose-voice-interaction` | [`traveling-selection-indicator`](apps/brilliant/traveling-selection-indicator/PATTERN.md) | spring ζ0.72 · k195 | ✅ verified |
| **recollect** | `recollect-splash` | [`splash-logo-settle`](apps/recollect/splash-logo-settle/PATTERN.md) | ease-in-out 700 ms | ✅ verified |
| **airbnb** | user clip (no MCP) | [`pill-to-panel-expansion`](apps/airbnb/pill-to-panel-expansion/PATTERN.md) | spring ζ0.86 / ζ1.0 | ✅ verified |
| **claude** | user clip (no MCP) | [`self-sizing-sheet`](apps/claude/self-sizing-sheet/PATTERN.md) | spring ζ1.0 · 220 ms | ✅ verified |
| **uber** | user clip (no MCP) | [`in-place-tab-crossfade`](apps/uber/in-place-tab-crossfade/PATTERN.md) | ease-out 280 ms, opacity only | ✅ verified |
| **x** | user clip (no MCP) | [`push-back-drawer-reveal`](apps/x/push-back-drawer-reveal/PATTERN.md) | spring ζ0.84 · k640, symmetric | ✅ verified |
| **recollect** | `recollect-logo-morph-to-features-animation` | [`brand-mark-to-caret-morph`](apps/recollect/brand-mark-to-caret-morph/PATTERN.md) | spring ζ1.00 · k2162, 135 ms | ✅ verified |
| **recollect** | ↑ same shot | [`category-batch-swap`](apps/recollect/category-batch-swap/PATTERN.md) | 2.4 s batch, 120 ms stagger, no scroll | ✅ verified |
| **recollect** | ↑ same shot | [`rolling-word-swap`](apps/recollect/rolling-word-swap/PATTERN.md) | ease-out 250 ms, never a spring | ✅ verified |
| **fuse** | `fuse-intro-value-prop-cycle-animation` | [`focus-slot-ticker`](apps/fuse/focus-slot-ticker/PATTERN.md) | spring ζ0.82 · k341, 1540 ms cadence | ✅ verified |
| **grocery-concept** | user clip (no MCP) | [`deliberate-return-sheet`](apps/grocery-concept/deliberate-return-sheet/PATTERN.md) | ease-out 150 ms in · ease-in 420 ms out, **no spring** | ✅ verified |
| **monogram** | `monogram-tap-and-hold-mic-liquid-blur-pulse-interaction` | [`hold-to-focus-liquid-lens`](apps/monogram/hold-to-focus-liquid-lens/PATTERN.md) | timing estimate 250 ms in / 350 ms out; localized distortion, no spring fit | Typechecked + shader rendered; native visual unverified |

All seventeen entries ship `src/`. The Monogram entry was typechecked against the installed Expo
stack through a temporary adapter, with a canary that must fail; its native visual check remains open.
Run `~/.claude/skills/60fps-to-reanimated/assets/verify.sh --all` to re-check the library.

## By what you are building

| I need… | Pattern |
|---|---|
| a sheet that drags and dismisses | `premium-bottom-sheet-spring` |
| a results / score / streak screen | `reward-recap-stagger` |
| a number that counts up at 60fps | `reward-recap-stagger` |
| an ambient loop around a logo or mascot | `orbiting-satellites` |
| a "how to add our widget" tutorial | `ghost-touch-walkthrough` |
| a paywall or value-prop pager | `snap-carousel-spring` |
| a segmented control / tab bar / filter row | `traveling-selection-indicator` |
| a launch splash that hands off to content | `splash-logo-settle` |
| a compact control that grows into a panel | `pill-to-panel-expansion` |
| a sheet that resizes when its rows change | `self-sizing-sheet` |
| top-level tabs sharing one header | `in-place-tab-crossfade` |
| a navigation drawer / side menu | `push-back-drawer-reveal` |
| a filter panel that pushes results aside | `push-back-drawer-reveal` |
| a short list that presents itself one item at a time | `focus-slot-ticker` |
| an onboarding screen cycling value propositions | `focus-slot-ticker` |
| a logo/splash that hands off to a search field | `brand-mark-to-caret-morph` |
| an ambient grid that keeps changing on its own | `category-batch-swap` |
| a placeholder that cycles categories | `rolling-word-swap` |
| a tab switch that duplicates its chrome | `in-place-tab-crossfade` |
| a panel that clips, jumps or scrolls when a row appears | `self-sizing-sheet` |
| a search entry, filter bar or compose control | `pill-to-panel-expansion` |
| a hold-to-capture control that stays sharp over a curved blur lens | `hold-to-focus-liquid-lens` |

## Shared Principles

- ⭐ **ζ ≈ 0.72 is the "premium" signature** — reached independently by abode, flighty and brilliant.
- ⭐ **Stiffness is tempo, damping is character.** k195/ζ0.72 (sheet) vs k632/ζ0.72 (carousel) =
  one product at two speeds. k195/ζ0.72 vs k195/ζ0.50 (recap) = two products at one speed.
- ⭐ **Transient springs; perpetual is linear** — a forever-loop with easing shows its seam each lap.
- ⭐ **Continuous values never spring** — counters use `withTiming`; overshoot on a number is a bug.
- ⭐ **One driver, N derivations** — exactly one shared value leads in every pattern.
- ⭐ **ζ≈0.72 is the signature of things that ARRIVE.** Containers read as LAYOUT sit at ζ 0.86-1.0
  and must not overshoot — `pill-to-panel-expansion` and `self-sizing-sheet` both diverge the
  same way, so it is a sub-rule, not an exception.
- ⭐ **Exit speed follows what the exit MEANS.** The bottom sheet exits faster than it enters
  (a dismissal should obey); `pill-to-panel-expansion` exits 1.5x SLOWER (a return of context
  should not be rushed). Same principle, opposite outcome.

## Adding one

```bash
M=~/.claude/skills/60fps-to-reanimated/assets      # auto-detects this project
$M/scaffold.sh <app> <shot-slug> <pattern-name> <video-url> [triangulation-slugs...]
$M/verify.sh   <app> <pattern-name>                # or --all
```

The method lives in the global `60fps-to-reanimated` skill.
