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
  version: "1.1"
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
7. **Fine detail ≠ eyeballing a small screenshot. INSPECT THE COMPUTED STYLE.** For icon
   color, stroke, a 1px border, a sub-pixel shift, or ANY "is it exactly color X?" question,
   a full-page PNG is too small to judge — you WILL call it wrong (2026-07-11: declared a
   menu icon "orange" twice while it rendered dark green). Instead: (a) `getComputedStyle`
   the exact element and compare the oklch/rgb value against the expected token, AND (b)
   zoom — `deviceScaleFactor: 3` + `element.screenshot()` on just that node. Gotcha that
   bit us: Lucide icons stroke with `currentColor`, so the color that paints is the
   `<path>`'s `color`, not the `<svg>`'s — inspect the path, not the wrapper.
8. **State-dependent styles must be DRIVEN, not assumed.** Hover/focus/selected/disabled
   styling only proves out if you put the element in that state first (`.hover()`,
   `.focus()`, toggle the data-attr) THEN capture/inspect. "It should turn X on hover" is a
   hypothesis until you see it.

## Commands

```bash
# Web (:3006) — quick one-shot screenshot of the running page (headless)
npx playwright screenshot --viewport-size=1440,900 "http://localhost:3006/<route>" /tmp/ui-check.png
# (if playwright isn't available, fall back to: open the route and ask the user for a
#  screenshot ONLY as last resort — and say the work is unverified until then)

# iOS simulator — cheap screenshot of whatever is on screen
xcrun simctl io booted screenshot /tmp/sim-check.png

# Then ALWAYS read the capture (renders the image) and compare vs the Figma reference
# figma MCP: get_screenshot on the reference node
```

### Web headless recipes (learned 2026-07-11)

- **Preview admin UI WITHOUT the Clerk SSR gate:** route `/ui-preview` (redirects to
  `/es/do/ui-preview`) renders the review-queue table/menus with mock data — ideal to
  verify admin components without a real session.
- **Dark theme is NOT `prefers-color-scheme`.** The app toggles a `.dark` class on `<html>`
  from `localStorage.theme === 'dark'` (see `theme-script.tsx`). The CLI
  `--color-scheme=dark` does NOTHING here. You must set localStorage before load.
- **Playwright is not a repo dep** — `npx playwright screenshot` downloads it on the fly.
  To *script* it (needed for dark theme, hover, zoom, computed styles), `require()` the
  npx-cached copy by absolute path (it's CommonJS, not ESM):

```js
// /tmp/verify.cjs  →  run with: node /tmp/verify.cjs
// find the path once: ls ~/.npm/_npx/*/node_modules/playwright/index.js
const { chromium } = require('/Users/<you>/.npm/_npx/<hash>/node_modules/playwright/index.js');
(async () => {
  const b = await chromium.launch();
  // deviceScaleFactor:3 → crisp zoom for fine-detail judgment
  const ctx = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 3 });
  const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem('theme','dark'); } catch(e){} }); // dark theme
  await p.goto('http://localhost:3006/es/do/ui-preview', { waitUntil: 'networkidle' });
  const item = p.getByRole('menuitem', { name: 'Editar' });
  await item.hover();                                  // DRIVE the state
  await item.screenshot({ path: '/tmp/zoom.png' });    // zoomed crop of just that node
  // INSPECT computed style — the source of truth for "is it color X?":
  const stroke = await item.evaluate((el) => getComputedStyle(el.querySelector('svg *')).stroke);
  console.log('path stroke =', stroke);                // compare vs expected oklch/rgb token
  await b.close();
})();
```

## Definition of Done (visual work)

- [ ] Screenshot of the real render captured and READ
- [ ] Compared vs Figma/reference; differences listed or none
- [ ] Dark + light verified
- [ ] Fine detail (icon color/stroke, borders, exact colors) confirmed via **computed style
      + zoom**, not a small full-page PNG
- [ ] State-dependent styling (hover/focus/selected) DRIVEN into that state before capture
- [ ] i18n switch verified (if strings changed)
- [ ] Admin route smoke-tested authenticated (if under /admin)
- [ ] Only THEN report done — with the screenshot/computed-value evidence in the reply
