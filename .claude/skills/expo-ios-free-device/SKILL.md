---
name: expo-ios-free-device
description: >
  Run an Expo / React Native app with native modules (Skia, Reanimated, gesture-handler, etc.)
  on a PHYSICAL iPhone/iPad using a FREE Apple ID (no paid Apple Developer Program), end to end:
  development build, free code-signing, multi-device registration, and reaching a local backend
  from the device. Trigger: when asked to run/install/test an Expo or RN app on a real iPhone or
  iPad, when "Expo Go" rejects the SDK or a native module, when signing fails ("no code signing
  certificates", "No Account for Team", "No profiles"), when a device build won't compile/load in
  Xcode, or when the app can't reach a `localhost` backend from the phone.
license: Apache-2.0
metadata:
  author: aispace
  version: "1.0"
---

## When to Use

- An Expo/RN app depends on a native module **not in Expo Go** (e.g. `@shopify/react-native-skia`)
  → Expo Go can't run it; you need a **development build** or EAS.
- You want to install on a **real iPhone/iPad** but have **only a free Apple ID** (no $99 program).
- Code-signing fails on the CLI, or Xcode won't load the Expo-generated project.
- The app loads but **can't reach your backend** (it points to `localhost`).

## Decision Tree — how to run it

| Situation | Path |
|---|---|
| No custom native modules (only JS + Expo Go modules) | **Expo Go**: `npx expo start` |
| Just need to SEE it working, any device | **iOS Simulator** (no signing): `npx expo run:ios` |
| Need a REAL device + have **paid** Apple Developer | **EAS cloud** (cleanest): `eas device:create` → `eas build -p ios --profile development` |
| Need a REAL device + **free** Apple ID only | **This skill** — free local dev build (below) |
| Native build keeps fighting the local Xcode | Fall back to **EAS cloud** (Expo's tested toolchain) |

## Critical Patterns

**1. Free code-signing — the "dummy project" trick (do ONCE per Mac/Apple ID).**
The CLI/`xcodebuild` CANNOT mint a free personal-team cert/profile (errors: *"No code signing
certificates"*, *"No Account for Team"*). Only the **Xcode GUI** can, and it often won't load an
Expo-generated project. Break the deadlock with a throwaway native app:
1. Xcode → Settings → **Accounts** → add your Apple ID (creates the "Personal Team").
2. **File → New → Project → App**, set the **Bundle Identifier IDENTICAL to your app's**, Team =
   Personal Team. Run it on the device (▶). This mints the **Apple Development cert (with private
   key)** + a **provisioning profile** for that bundle id + **registers the device**.
3. Read the **real Team ID** from that dummy project's `DEVELOPMENT_TEAM` build setting — it is
   **NOT** the `(XXXXXXXXXX)` shown in the cert's name. (Verify: `security find-identity -v -p codesigning`.)

**2. Sign the real app with the minted profile (automatic signing).**
In the app's `ios/<App>.xcodeproj/project.pbxproj`, the app target needs
`CODE_SIGN_STYLE = Automatic` + `DEVELOPMENT_TEAM = <real team id>`. Keep it **Automatic** (the
profile is Xcode-managed; Manual signing rejects a managed profile). Build with
`-allowProvisioningUpdates`. ⚠ `expo prebuild` regenerates `ios/` and wipes this — reinject after.
- **Paid-only entitlements block free signing.** If the app declares `aps-environment` (Push, added by
  `expo-notifications`) or `com.apple.developer.applesignin` (Apple Sign In, added by `@clerk/expo`), a
  FREE account can't provision them → `xcodebuild` **error 65** at the planning/signing step (*"Provisioning
  Profile … does not support the Push Notifications / Sign In with Apple capability"*). Both are already
  paid-blocked, so stripping them from the DEV build loses nothing. Fix: an **env-gated config plugin**
  (`apps/mobile/plugins/with-free-signing.js`, added LAST in `app.json` `plugins`) that deletes those
  entitlements ONLY when `EXPO_FREE_SIGNING=1` → prod (paid) keeps them. Build with `EXPO_FREE_SIGNING=1`.
  Hand-editing `ios/Cuadra/Cuadra.entitlements` does NOT survive a clean prebuild — use the plugin. (See `cuadra-clerk`.)

**3. Toolchain must match the SDK (compile errors ≠ your code).**
- `'weak' must be a mutable variable` in `expo-modules-jsi` → your **Swift is too old** for the SDK
  (`weak let` needs Swift 6.3+). **Update Xcode**, then re-verify: `swift --version`.
- `iOS XX.X is not installed` → install the platform: `xcodebuild -downloadPlatform iOS`
  (or Xcode → Settings → Components). Needed for device builds, not just the simulator.

**4. Reach a local backend FROM the device — never `localhost`.**
`localhost` on the phone = the phone. Point the app at the **Mac's LAN IP** and bind the backend to
all interfaces. Expo inlines `EXPO_PUBLIC_*` into the **JS bundle at Metro time**, so changing it +
restarting Metro is enough — **no native rebuild**. Phone and Mac must share Wi-Fi.
  **NEVER start Metro with a plain `npx expo start`** — it bakes `localhost` (from `.env`) into the bundle,
  so on a PHYSICAL device every backend call fails: symptom = chat *"No pude responder"* / *"Productos que
  sigues"* empty ON THE DEVICE but fine in the SIMULATOR (where `localhost` reaches the Mac). **ALWAYS use
  `./scripts/dev-up.sh`** — it detects the LAN IP, injects `EXPO_PUBLIC_API_URL`, binds the API to `0.0.0.0`,
  and runs Metro on **:8087**. Cuadra's `.env` is permission-protected (can't edit it) → the env override at
  Metro start (what dev-up.sh does) is the way, not a `.env` edit.

**5. A NEW device needs `-allowProvisioningDeviceRegistration` — and `expo run:ios` does NOT pass it.**
A free profile only covers devices present when it was made. `npx expo run:ios --device <new>` **FAILS**
on an unregistered device (*"provisioning profile doesn't include the currently selected device"*) because
it passes `-allowProvisioningUpdates` but NOT `-allowProvisioningDeviceRegistration`. Once a cert already
exists (the first device worked), you do NOT need the Xcode GUI — register + install the 2nd device
(e.g. iPad) fully by CLI via **`xcodebuild` directly with BOTH flags**, then `devicectl install` (see
Commands). Free certs/profiles **expire in 7 days** → rebuild to renew.

## Commands

```bash
# Confirm what's installed / signing state
xcodebuild -version && swift --version
xcrun xctrace list devices                       # device UDIDs (hardware UDID, not the coredevice UUID)
security find-identity -v -p codesigning         # 0 = no usable identity yet (do the dummy trick)
xcodebuild -downloadPlatform iOS                 # install missing iOS platform

# Build + free-sign + REGISTER + install to a device (works for a NEW device; UDID = hardware udid).
# EXPO_FREE_SIGNING=1 first only matters if you re-prebuild; xcodebuild uses the already-stripped entitlements.
xcodebuild -workspace ios/<App>.xcworkspace -scheme <App> -configuration Debug \
  -destination "id=<UDID>" -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
xcrun devicectl device install app --device <UDID> "<path>/<App>.app"

# Run the JS + reach a LAN backend (no native rebuild needed).
# BEST (Cuadra): one command — DB + API(0.0.0.0:8005) + Metro(:8087) all wired to the LAN IP:
./scripts/dev-up.sh                 # add --clear to reset Metro cache after a native/asset change
# Manual equivalent (NEVER a plain `expo start` — that bakes localhost):
IP=$(ipconfig getifaddr en0); EXPO_PUBLIC_API_URL="http://$IP:8005" npx expo start --dev-client --port 8087
```

## Resources

- **Scripts**: [assets/dev-up.sh](assets/dev-up.sh) (LAN dev server bring-up, parameterized) and
  [assets/ios-free-build-install.sh](assets/ios-free-build-install.sh) (free build + install to a device).
- **Full case study + every error→fix we hit**: [references/troubleshooting.md](references/troubleshooting.md).
