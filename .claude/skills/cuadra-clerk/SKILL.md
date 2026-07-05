---
name: cuadra-clerk
description: >
  End-to-end integration of Clerk as Cuadra's real IdP across the whole stack — backend (FastAPI,
  RS256/JWKS verification + JIT user provisioning), web (@clerk/clerk-react + Vike SSR), and mobile
  (@clerk/expo + AuthView). Covers the doctrine (the IdP AUTHENTICATES only, RBAC/user stay OURS →
  near-zero lock-in), the dual-mode pattern (Clerk when the publishable key is set, dev-login
  fallback otherwise), the short-lived-token / async token-getter rule, the REQUIRED custom session
  claim (Clerk's token has no email), the dashboard/env setup (the publishable key encodes the
  issuer), and the HARD-won native gotchas — above all: after installing @clerk/expo you MUST run
  `expo prebuild --clean` before building, or pod install dies on the ClerkExpo SPM target. Composes
  with cuadra-api / cuadra-web / cuadra-mobile (app conventions) and cuadra-git-workflow.
  Trigger: Building, wiring, configuring, or DEBUGGING Clerk anywhere in Cuadra — the identity
  backend (verifier/JIT/config), the web or mobile login/provider/token wiring, the Clerk dashboard
  (methods, custom claim, keys), OR any Clerk error, ESPECIALLY the mobile
  "Unimplemented component: <ViewManagerAdapter_ClerkAuthView>" / `pod install` SPM failure
  (`undefined method 'package_product_dependencies' for nil`).
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

> **Your role:** an auth architect with 15+ years in identity, OAuth/OIDC, and multi-tenant fintech.
> Cuadra is a **regulated fintech** where **trust IS the product** — a broken login or a leaked
> session destroys it. You protect the doctrine below; when a shortcut would hard-couple us to the
> vendor, accept an unverified token, or break the dev-login fallback, you STOP.

> **Compose — don't duplicate.** Backend structure/TDD → `cuadra-api`; the web app (Vike/SSR/SEO) →
> `cuadra-web`; the Expo app → `cuadra-mobile`; branch/PR/CI → `cuadra-git-workflow`; native Expo
> update/build hygiene → `cuadra-expo-updates`. THIS skill owns the Clerk INTEGRATION end-to-end
> across those layers.

> **Research the state of the art FIRST (2025-2026).** Before changing a Clerk version, an SDK, or a
> security-sensitive flow, verify against the CURRENT official Clerk docs + the installed package's
> real exports/peer-deps (`node -e "require('.../package.json')"`) — do NOT trust a blog's version
> claim (we were burned once: an article said `@clerk/expo` v3 was `<56`, but the installed 3.6.5
> actually declares `expo >=53 <57` / `rn >=0.75`). Grounded decisions over confident guesses.

## When to Use

- Backend: the `identity` context's token verifier, JIT provisioning, auth config, or the
  `get_current_user_id` guard.
- Web: the Clerk provider/login/token wiring in `apps/web` (`features/save/hooks/*`, `LayoutDefault`).
- Mobile: the Clerk provider/login/token wiring in `apps/mobile` (`features/auth/*`, `app/_layout.tsx`).
- Dashboard / env: creating the Clerk app, keys, the custom session claim, enabling methods.
- **Any Clerk bug** — token 401s, SSR crashes, or the mobile native `AuthView` / `pod install` errors.

## Critical Patterns

### 1. The doctrine (SACRED — a violation is a P0)

1. **The IdP AUTHENTICATES; it NEVER authorizes.** Clerk issues the token + does social login. Our
   `identity.user` + RBAC (roles/capabilities/market-gating, schema `identity`) are the source of
   truth. We map Clerk's `sub` → our user via **`auth_identity(provider="clerk", subject=sub)`** →
   **near-zero lock-in** (swap IdP = change the issuer/JWKS + the front SDK; the user table stays).
2. **DUAL-MODE, always.** Clerk activates ONLY when the publishable key env is set; with no key the
   app falls back to **dev-login** (HS256, dev-only). This protects local dev, CI, and SSR (no key →
   `<ClerkProvider>` is never mounted). NEVER hard-require Clerk; NEVER delete the dev-login path.
3. **Clerk tokens are SHORT-LIVED (~60s).** NEVER cache a Clerk token yourself. Register an **async
   token-getter** (`getToken`) into the SDK client and fetch a FRESH token PER request.
4. **Backend verifies RS256 via JWKS** — validate `iss` + `exp`/`nbf` + **`azp`** (authorized
   parties, anti-CSRF). HS256 is dev-login ONLY and is **rejected in prod** (the guard routes by the
   token's `alg`). Inject the `PyJWKClient` so it's testable without the network.
5. **The custom session claim is REQUIRED.** Clerk's default token has **NO email** (claims:
   `sub/iss/azp/sid/exp/nbf/iat`). Add a custom session token claim in the dashboard so the backend
   can provision the user. JIT name priority: `full_name → username → email local-part → "Usuario"`.

### 2. 🚨 The mobile native gotcha (this cost us an afternoon)

`@clerk/expo`'s `AuthView` is a **native SwiftUI component** shipped via **Swift Package Manager**.

- **"Unimplemented component: `<ViewManagerAdapter_ClerkAuthView>`"** = the Clerk native module is
  NOT in the running binary. AuthView needs a **development build** (NEVER Expo Go), and the current
  dev build predates the `@clerk/expo` install → **rebuild required**.
- **`pod install` dies with `undefined method 'package_product_dependencies' for nil`** (RN's
  `scripts/cocoapods/spm.rb`) = the `ios/` project is **STALE** — it was generated before
  `@clerk/expo`, so the `ClerkExpo` SPM target doesn't exist and RN's SPM helper hits a nil target.
  **This is NOT an RN 0.85 / SDK 56 incompatibility** (peer deps support it). **THE FIX:**

  ```bash
  cd apps/mobile
  npx expo prebuild --clean -p ios   # regenerate ios/ → integrates the ClerkExpo target
  npx expo run:ios                   # build + install on the simulator (free Apple ID signs it)
  ```

  `apps/mobile/ios/` is gitignored + fully prebuild-managed (config plugins in `app.json`), so a
  clean regen is SAFE and is the intended workflow. Confirm success in the log: `Build Succeeded` +
  `WARN Clerk: ...loaded with development keys`.
- Any native-dep install (`@clerk/expo`, `expo-web-browser`) needs a rebuild — the fix is the same.

### 3. Dashboard + env setup (the config the code needs)

- **The publishable key encodes the Frontend API URL (= issuer).** `pk_test_<base64>` → the base64
  decodes to `<frontend-api-domain>$`. Derive `CLERK_ISSUER` from it (no need to hunt the dashboard):
  ```bash
  printf '%s' "${KEY#pk_test_}" | base64 -d | tr -d '$'   # → rested-grouse-21.clerk.accounts.dev
  ```
- **Envs** (append to the gitignored `.env`; the publishable key is client-safe, the issuer is public):
  - `apps/web/.env`  → `VITE_CLERK_PUBLISHABLE_KEY=pk_...`
  - `apps/mobile/.env` → `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...`
  - `apps/api/.env`  → `CLERK_ISSUER=https://<domain>` + `CLERK_AUTHORIZED_PARTIES=http://localhost:3006,<app-origin>`
- **Custom session token claim** (Configure → Sessions → Customize session token):
  ```json
  { "email": "{{user.primary_email_address}}", "name": "{{user.full_name}}", "username": "{{user.username}}" }
  ```
  Set it BEFORE the first login — JIT provisioning captures email/name at CREATE and won't backfill.
- **Apple Sign In needs a PAID Apple Developer account** (same blocker as remote push) — defer it;
  Email + Google work in dev out of the box (Clerk's shared dev OAuth credentials).
- **NEVER run `clerk init` (the Clerk CLI).** It scaffolds a greenfield app and would clobber our
  hand-crafted dual-mode wiring (its own provider/env/middleware). We integrate manually. Only the
  publishable key + issuer are needed from Clerk.

### 4. Where the code lives

| Layer | Path | What |
|---|---|---|
| Backend verify | `apps/api/.../identity/infrastructure/clerk_token_verifier.py` | `ClerkTokenVerifier` (RS256/JWKS, azp) + `NullTokenVerifier` (when Clerk off) |
| Backend JIT | `.../identity/application/authentication.py` | `ResolveUserFromClaims` — maps `(clerk, sub)`→user or provisions |
| Backend guard | `apps/api/src/api/extensions/security.py` | `get_current_user_id` routes by `alg`: RS256→Clerk / HS256→dev-login (dev only) |
| Backend wiring | `apps/api/src/api/composition_root.py` | `get_clerk_verifier()` (Null when `!clerk_enabled` → no PyJWKClient with empty issuer) |
| Web | `apps/web/src/features/save/hooks/{clerk,clerk-auth-bridge,use-auth}.ts*` + `layouts/LayoutDefault.tsx` | `@clerk/clerk-react`, `<SignIn/>`, `<ClerkProvider>`, async `authHeaders()` |
| Mobile | `apps/mobile/src/features/auth/{clerk,clerk-auth-bridge,use-session,*-login-screen}.tsx` + `app/_layout.tsx` | `@clerk/expo`, `AuthView`, `<ClerkProvider tokenCache>`, `registerTokenGetter` |

**Real imports (verified against the packages):** web → `ClerkProvider · SignIn · SignedIn/SignedOut
· useAuth · useClerk` from `@clerk/clerk-react`. Mobile → `ClerkProvider · useAuth` from
`@clerk/expo`, `AuthView` from `@clerk/expo/native`, `tokenCache` from `@clerk/expo/token-cache`.

### 5. The token-getter bridge (both apps)

The SDK client pulls a FRESH token per request from a registered getter (dev = static; Clerk =
`getToken`). A `<ClerkAuthBridge/>` mounted under `<ClerkProvider>` registers it and clears it on
sign-out; a unified `useSession()`/`useAuth()` derives the gate status from Clerk in Clerk mode or
the dev store otherwise (the `CLERK_ENABLED` branch is a build-time constant → invariant hook order).

## Do / Don't

| ✅ Do | ❌ Don't |
|---|---|
| Map by Clerk `sub` via `auth_identity`; keep RBAC ours | Treat Clerk as the user/permission source of truth |
| Gate Clerk on the publishable key; keep dev-login | Hard-require Clerk / delete the dev-login fallback |
| Fetch a fresh token per request (async getter) | Cache a Clerk token (it expires in ~60s) |
| Verify RS256 + `iss`/`exp`/`nbf`/`azp` (JWKS) | Accept HS256 in prod / skip `azp` |
| `expo prebuild --clean` after installing a native dep | `expo run:ios` on a stale `ios/` (SPM nil-target crash) |
| Set the custom session claim before first login | Assume the token carries email (it doesn't by default) |
| Derive the issuer by decoding the publishable key | Hunt/guess the Frontend API URL |
| Integrate manually (our dual-mode) | Run `clerk init` (clobbers our wiring) |

## Commands

```bash
# Derive the backend issuer from the publishable key
printf '%s' "${PK#pk_test_}" | base64 -d | tr -d '$'
# Verify Clerk is live end-to-end
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/.well-known/jwks.json   # → 200
cd apps/api && uv run python -c "from src.config import settings; print(settings.clerk_enabled, settings.clerk_jwks_url)"
# Mobile: the ONLY reliable path after installing @clerk/expo
cd apps/mobile && npx expo prebuild --clean -p ios && npx expo run:ios
# Tests
cd apps/api && uv run pytest tests/identity          # verifier + JIT + guard
pnpm --filter @cuadra/web test && pnpm --filter @cuadra/mobile test   # bridge + useAuth/useSession + login switch
```

## Resources

- **App conventions**: `cuadra-api` · `cuadra-web` · `cuadra-mobile` · `cuadra-expo-updates`.
- **Pending / decisions**: `docs/pending/save-web-f1-pendientes.md` (§1.3 IdP), `docs/pending/save-alerts-remote-push.md` (paid Apple blocker).
- **Official docs** (verify current before changing versions): Clerk React, Clerk Expo, manual JWT verification, session tokens / custom claims.
