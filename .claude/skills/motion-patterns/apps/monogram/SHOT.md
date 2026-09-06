# Monogram: Hold-To-Focus Reference

| Field | Record |
|---|---|
| Public shot | https://60fps.design/shots/monogram-tap-and-hold-mic-liquid-blur-pulse-interaction |
| Direct video | https://video.gumlet.io/66b49d08225b7b88f78b7b44/6a5e2980a151fd52183e4012/main.mp4 |
| Clip | `hold-to-focus-liquid-lens/hold-to-focus-liquid-lens.mp4`, 2160x2160, 60fps, 16.966667s |
| Method | Video-first, no MCP results or SwiftUI available |
| Studied | 2026-09-06 |
| Pattern | [hold-to-focus-liquid-lens](hold-to-focus-liquid-lens/PATTERN.md) |
| Raw record | [shot.json](shot.json), full descriptive schema and measurement uncertainty |

The public title describes a pulse, but is not proof of audio-reactivity or periodicity. The
recording shows a bowed card boundary and deformed glyphs, not simply a blur mask. The mic and
transcript remain sharp. The processing pill appears before the lens fully withdraws; dimming
continues afterwards. The later response UI is context, not a second distilled pattern.

## Measurements

- Ingested with `from-video.sh monogram hold-to-focus-liquid-lens <public-shot-url> 60`.
- 101 frames at 1080px in six detected windows. Source interval: 16.667ms, NOT 16ms.
- `frames/timeline_1fps.jpg` establishes sequence; `kymo_w2...png` was inspected but whole-frame
  horizontal projection cannot identify a curved vertical blur boundary or fit a spring.
- Cropped contact-sheet studies extend beyond detector tails: entry 3.8-4.6s at 20fps, withdrawal
  6.8-8.0s at 20fps, cadence 3.8-7.2s at 4fps. Crop in 1080px coordinates: `410:440:335:530`.
- Approximate main entry: 3950-4200ms (250ms); withdrawal: 7200-7550ms (350ms). Boundary uncertainty
  approximately 75ms. These are manual estimates, not frame-perfect contact timestamps.
- At nominal 4067ms, first card's bottom edge bows from about y628 at sides to y613 at center:
  approximately 15px, uncertainty 5px. These are recording pixels, not RN points.
- No resolvable overshoot peak, no unique damping/stiffness fit, no stable pulse period. Not seeing
  overshoot does NOT prove the original app did not use a spring.

The generated frame README rounds 1000/60 down to 16. Use `windowStart + (N-1)*1000/60` for nominal
sample times, with source/extraction rounding uncertainty of at least one frame.

## Evidence Review

`library.py triangulate monogram` suggested **confirmed**, based on Arc's `sequence` and Brilliant's
`audio preview`. Actual neighbors were read before grading:

| Neighbor | Shared idea | Why not independent confirmation |
|---|---|---|
| Arc `ghost-touch-walkthrough` | Sequence, fade | A scripted tutorial, not a real hold/focus lens |
| Brilliant `traveling-selection-indicator` | Audio-preview context | A moving selection highlight, no blur lens |
| Airbnb `pill-to-panel-expansion` | Context recedes with blur | Global recession plus expanding panel, not localized distortion |
| Uber `in-place-tab-crossfade` | Persistent chrome | Opacity-only tab swap, not capture feedback |
| Recollect `brand-mark-to-caret-morph` | Control changes identity | Does not corroborate the lens; no extra morph pattern needed |

Grade: **corroborated** for the abstract reusable hold-to-focus interaction using the five-question
checklist in PATTERN.md. The distinctive lens silhouette is still **single-source**, not a proven
cross-app convention. No claim of three apps using this lens.

## Reproducibility

`fetch-clips.sh` uses curl only, so `video_url` is the direct mp4, not the public HTML page.
The page extractor lists many related videos. The selected direct URL was SHA256-matched to the
ingested clip: `0bbe028c6a09b50ef258b2360657b8130f98fee9fd750e59c0a445a28badf972`.
Clips and frames remain gitignored. `refresh-frames.sh` can rebuild study frames from the clip.
No global pipeline scripts were changed.

## Verification Boundary

Typed standalone source and CanvasKit renders of the actual shader are verified. Native RN
composition, hold/cancel gestures, interruption timing and GPU frame budget are NOT visually verified.
A booted iPhone 17 simulator and Cuadra app were found, but that app has no standalone pattern host;
no app route, native build or integration was added. See PATTERN.md for exact remaining checks.
