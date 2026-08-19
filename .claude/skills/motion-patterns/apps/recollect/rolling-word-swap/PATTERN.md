---
name: motion-rolling-word-swap
description: >
  Reusable motion pattern: one word inside a line of text is exchanged for the next by rolling
  vertically through a short band while crossfading — the surrounding text never moves. Cycles a
  placeholder through categories without the line reflowing or the caret jumping.
  Reanimated 4 + TypeScript.
  Trigger: cycling a search placeholder, rotating a value proposition or hero noun, an empty-state
  hint that suggests several things in turn — any single word that must change inside settled text.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
  method: 60fps-to-reanimated
  reference: recollect (60fps MCP shot + measured video)
  evidence: corroborated
---

> Distilled from the same shot as [`../brand-mark-to-caret-morph`](../brand-mark-to-caret-morph/PATTERN.md).
> **Working code in [`src/`](src/)** — typechecked against `apps/mobile`.

## Reference

| | |
|---|---|
| **Shot** | `recollect-logo-morph-to-features-animation` |
| **Measured** | word changes over **~250 ms** (8583 → 8833 ms), travelling through a ~54 px band |
| **Evidence** | `corroborated` |

### ⭐ It is not a typewriter

The MCP lists `typing` among the motion behaviors and its prose says *"typewriter-style text
updates keywords"*. Frame by frame there is **no character-by-character reveal at any point**: the
whole word rolls vertically and crossfades.

The distinction is not pedantic. A typewriter effect says *someone is typing this*; a roll says
*this is one field showing several options*. Only the second is true here, and only the second is
honest in a placeholder the user did not type.

## Description
The trailing word of a static line is replaced on a timer. It rolls up and out while its
replacement rolls up and in; the rest of the line is untouched.

## Use cases
1. **A search placeholder cycling categories** — the source case.
2. **A hero line whose noun rotates** ("build *apps* / *tools* / *teams*").
3. **An empty-state hint** suggesting several actions in turn.

## Trigger
`system event` — a timer.

## Initial state
`roll = 0`, first word mounted.

## Animated properties
| Property | Role |
|---|---|
| `roll` | PRIMARY, 0 → 1 per exchange |
| `translateY` · `opacity` | DERIVED, both keyed at `[0, 0.5, 1]` |

## Motion model
The word list is **React state**, not a shared value: it changes on a timer, not per frame, and the
worklet only ever reads a number.

⭐ This is the method's hardest-won implementation rule — **never capture a JS function or array in
a worklet**. A formatter or a word list passed into `useAnimatedProps` blows up at runtime.

The swap lands at the midpoint, while the outgoing word is fully transparent, so the change of text
is never visible.

## Spring/easing configuration

⭐ **Two clocks, deliberately separate.** The cycle is perpetual and is a plain `setInterval`; each
individual roll is a **transient that arrives** and gets `withTiming(250 ms, ease-out)`. Collapsing
them into one looping animation is what makes this read as a slot machine.

⭐ And no spring: this is text the user READS. The library's rule — *continuous values never
spring* — extends to words, because overshoot on a legible word reads as a wobble.

## Gesture behavior
N/A — it is ambient text.

## Entry / exit behavior
Symmetric by construction: every exchange is the same 250 ms roll.

## Implementation

### Ours — the files that ship
| File | What |
|---|---|
| [`src/motion/timings.ts`](src/motion/timings.ts) | measured roll + hold, and the not-a-typewriter finding |
| [`src/motion/use-rolling-word.ts`](src/motion/use-rolling-word.ts) | the cycle and the roll |

```bash
~/.claude/skills/60fps-to-reanimated/assets/verify.sh recollect rolling-word-swap
```

## Corroboration checklist (SKILL.md §5)

1. **Survives stripping the app?** ✅ *One word inside settled text is exchanged by rolling and
   crossfading.* Entirely mechanical.
2. **Physics inside the library's priors?** ✅ Strongly. `withTiming` for something the user reads,
   a transient that arrives given an ease-out, and the perpetual part kept on a separate plain
   timer — three independent library rules, all agreeing.
3. **Three different screens?** ✅ Search placeholder · rotating hero noun · empty-state hint.
4. **Parameterisation real?** ✅ The word list, the hold, the roll distance and duration.
5. **What would falsify it?** If shipped apps overwhelmingly crossfade the word in place with no
   vertical travel, then the roll is decoration rather than the pattern, and this becomes
   `single-source` with "crossfade" as the real mechanism. Check three apps with a cycling
   placeholder; if two crossfade without travel, demote.

**Passes 1, 3 and 4**, and question 2 corroborates it against three separate library rules. Graded
`corroborated`.
