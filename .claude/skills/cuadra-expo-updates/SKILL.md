---
name: cuadra-expo-updates
description: >
  How to handle "an update for expo is available" / outdated-package warnings from
  `expo start` or `dev-up.sh` in this pnpm monorepo — where to actually check versions
  (apps/mobile, NOT repo root), what's safe to auto-fix vs what needs a user go-ahead,
  and when a dev-client rebuild is required.
  Trigger: `expo start`/`./scripts/dev-up.sh` prints an Expo/package update notice, or
  before/after considering an Expo SDK bump in apps/mobile.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- `expo start` (or `dev-up.sh`, which wraps it) prints `An update for expo is available` /
  `N other packages may need updating`.
- Deciding whether to bump `expo-*` package versions, or the Expo SDK itself, in `apps/mobile`.

## Critical Patterns

**0. The flow is always: check → REPORT → wait for the user's go-ahead → apply → verify. Never
auto-apply, even a patch bump the report itself calls low-risk.** The user decides whether/when to
touch dependencies in THEIR app — that's the point of the report. Running `expo install --fix`
(or any version change) before they've said go is skipping the one step that's actually theirs to
make. This applies regardless of how low-risk step 2 below judges the change to be.

**1. Run the check from `apps/mobile`, NEVER the repo root.** This is a pnpm monorepo — `npx expo
install --check` from the repo root reads the ROOT workspace's `node_modules` and reports unrelated
noise (e.g. a root `typescript` version mismatch against an unrelated package's peer range). The
real, actionable list only shows up scoped to the app:
```bash
cd apps/mobile && npx expo install --check
```

**2. Report the risk level for what the check found, THEN stop and wait.** For each outdated
package (or the bump as a whole if it's one coherent SDK step), tell the user:
- **Patch, same SDK** (e.g. `56.0.12 → 56.0.13`, `56.2.11 → 56.2.12`): low risk — Expo's own semver
  discipline reserves native ABI changes for MINOR/SDK bumps, so these are almost always JS-only
  bug fixes. No dev-client rebuild expected.
- **MINOR/MAJOR SDK bump** (e.g. `56 → 57`): flag explicitly as needing more care — CAN change
  native module ABI, which the installed dev-client binary won't have until it's rebuilt (`eas
  build` / `expo run:ios`), not just JS-reloaded. Before even proposing this, read the SDK's
  release notes (`mcp__plugin_expo_expo__learn` / `read_documentation` if the Expo MCP is
  authorized, else the changelog at expo.dev) and call out anything relevant to this app's native
  deps specifically: `react-native-reanimated`, `react-native-svg`, `expo-glass-effect`,
  `@react-native-masked-view/masked-view`, `react-native-squircle-view`.
- Any peer-dependency warning that looks NEW (not one of the known-harmless ones in §4) — call it
  out rather than silently assuming it's fine.

Then stop. Report only — do not run `--fix` in the same turn.

**3. Only apply once the user says to.** Once they give the go-ahead:
```bash
cd apps/mobile && npx expo install --fix   # rewrites package.json to the expected versions
pnpm --filter @cuadra/mobile typecheck     # always verify after
```
`expo install --fix` runs `pnpm add <pkg>@<version>` itself (monorepo-aware — you'll see `../..`
progress lines, it operates from the workspace root), which also updates `pnpm-lock.yaml`
automatically. **No separate `pnpm install` step needed.** It may run in two passes (installs
`expo` first, re-checks, then installs whatever else was still behind) — that's normal, not a
failure.

**4. Peer-dependency warnings from `pnpm install` are usually NOT urgent.** Third-party packages
often lag Expo's release cadence and declare a peer range that looks wrong but still works fine
in practice. Known-harmless ones already confirmed in this repo, kept appearing across multiple
`expo install --fix` runs without ever causing an actual problem:
- `react-native-squircle-view` wants `react-native@^0.41.2`, repo has `0.85.3`.
- `@react-native/community-cli-plugin` wants `@react-native/metro-config@0.85.3`, repo has `0.86.0`.
- `@hey-api/openapi-ts` (in `packages/api-client`) wants `typescript@^5.x`, repo has `6.0.3`.
- `@expo/log-box` wants `@expo/dom-webview@^56.0.6`, repo momentarily had `56.0.5` mid-upgrade —
  this one specifically resolved itself on its own between the two `expo install --fix` passes.

Don't chase these reflexively — confirm the app still typechecks and runs; only investigate
further if something actually breaks.

**5. Always verify after ANY dependency change**, same gate as any other change in this repo:
`pnpm --filter @cuadra/mobile typecheck` + `pnpm --filter @cuadra/mobile test` (see
`cuadra-mobile-testing`). CI does NOT run vitest — this is a local-only check, don't skip it.

## Commands

```bash
cd apps/mobile && npx expo install --check   # what's outdated, scoped correctly
cd apps/mobile && npx expo install --fix     # auto-align to the installed SDK's expected versions
pnpm --filter @cuadra/mobile typecheck       # verify — the actual CI gate
pnpm --filter @cuadra/mobile test            # verify — not CI-gated, run locally
```

## Resources

- **Stack/structure**: `cuadra-mobile` skill.
- **Deeper SDK/release docs**: official Expo MCP (`mcp__plugin_expo_expo__learn`,
  `read_documentation`) when authorized — re-authorize via the user if it reports an expired token.
