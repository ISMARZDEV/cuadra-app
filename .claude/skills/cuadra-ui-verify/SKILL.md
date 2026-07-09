---
name: cuadra-ui-verify
description: >
  Self-verification protocol for ALL visual/UI work in cuadra-app: screenshot the real
  render and compare against the reference BEFORE telling the user it's done — the agent
  is the QA loop, never the user. Born from the 2026-07-09 friction audit: 80+
  single-attribute correction turns and ~110 interruptions happened because UI work was
  declared "listo" unverified.
  Trigger: after implementing or modifying ANY screen/component/style in apps/web or
  apps/mobile — and before the words "listo", "done", or "ya quedó" about visual work.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- You changed anything the user can SEE (layout, color, spacing, animation, icon, theme,
  i18n string) in apps/web or apps/mobile.
- A sub-agent batch that touched UI just reported "tests green" — tests green ≠ pixels right.
- You are about to reply "listo/done" describing visual work.

## Critical Patterns

1. **Never declare UI work done without looking at it.** Screenshot the real render and
   READ the image (the Read tool renders PNGs). If you can't capture a render, say so
   explicitly and mark the work as UNVERIFIED — never imply it looks right.
2. **Compare against the reference.** If the work comes from a Figma frame, pull the
   reference with the figma MCP `get_screenshot` and compare side by side. List every
   visible difference BEFORE the user has to.
3. **Batch visual tweaks.** When the user (or your own compare) reports N visual issues on
   the same screen, fix ALL co-located ones in ONE pass — never one attribute per round trip.
4. **Both themes, always.** Cuadra ships dark AND light. Verify both before done (theme
   toggle or `prefers-color-scheme`).
5. **i18n switch check.** If the change touches strings/locales, switch es→en→pt and back —
   the language-switch regression of 2026-07-01 was re-reported 3 times because each "fix"
   was never exercised.
6. **Admin routes need an authenticated smoke.** After work under `/admin`, load the actual
   route with a real Clerk session (see cuadra-save-admin: dev-login localStorage is
   unreachable SSR → 403). A 200 with rendered content is the pass, not compiled code.

## Commands

```bash
# Web (:3006) — screenshot the running page (headless)
npx playwright screenshot --viewport-size=1440,900 "http://localhost:3006/<route>" /tmp/ui-check.png
# (if playwright isn't available, fall back to: open the route and ask the user for a
#  screenshot ONLY as last resort — and say the work is unverified until then)

# iOS simulator — cheap screenshot of whatever is on screen
xcrun simctl io booted screenshot /tmp/sim-check.png

# Then ALWAYS read the capture (renders the image) and compare vs the Figma reference
# figma MCP: get_screenshot on the reference node
```

## Definition of Done (visual work)

- [ ] Screenshot of the real render captured and READ
- [ ] Compared vs Figma/reference; differences listed or none
- [ ] Dark + light verified
- [ ] i18n switch verified (if strings changed)
- [ ] Admin route smoke-tested authenticated (if under /admin)
- [ ] Only THEN report done — with the screenshot evidence in the reply
