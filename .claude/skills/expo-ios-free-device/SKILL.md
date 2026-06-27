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

**3. Toolchain must match the SDK (compile errors ≠ your code).**
- `'weak' must be a mutable variable` in `expo-modules-jsi` → your **Swift is too old** for the SDK
  (`weak let` needs Swift 6.3+). **Update Xcode**, then re-verify: `swift --version`.
- `iOS XX.X is not installed` → install the platform: `xcodebuild -downloadPlatform iOS`
  (or Xcode → Settings → Components). Needed for device builds, not just the simulator.

**4. Reach a local backend FROM the device — never `localhost`.**
`localhost` on the phone = the phone. Point the app at the **Mac's LAN IP** and bind the backend to
all interfaces. Expo inlines `EXPO_PUBLIC_*` into the **JS bundle at Metro time**, so changing it +
restarting Metro is enough — **no native rebuild**. Phone and Mac must share Wi-Fi.

**5. Each extra device must be registered.** A free profile only covers devices present when it was
made. For a second device (e.g. iPad), rebuild to it with `-allowProvisioningDeviceRegistration`
(regenerates the profile). Free certs/profiles **expire in 7 days** → rebuild to renew.

## Commands

```bash
# Confirm what's installed / signing state
xcodebuild -version && swift --version
xcrun xctrace list devices                       # device UDIDs (hardware UDID, not the coredevice UUID)
security find-identity -v -p codesigning         # 0 = no usable identity yet (do the dummy trick)
xcodebuild -downloadPlatform iOS                 # install missing iOS platform

# Build + free-sign + install to a connected device (UDID = hardware udid)
xcodebuild -workspace ios/<App>.xcworkspace -scheme <App> -configuration Debug \
  -destination "id=<UDID>" -allowProvisioningUpdates -allowProvisioningDeviceRegistration build
xcrun devicectl device install app --device <UDID> "<path>/<App>.app"

# Run the JS + reach a LAN backend (no native rebuild needed)
IP=$(ipconfig getifaddr en0)
# backend must bind 0.0.0.0, e.g.:  uvicorn app:app --host 0.0.0.0 --port 8005
EXPO_PUBLIC_API_URL="http://$IP:8005" npx expo start --dev-client
```

## Resources

- **Scripts**: [assets/dev-up.sh](assets/dev-up.sh) (LAN dev server bring-up, parameterized) and
  [assets/ios-free-build-install.sh](assets/ios-free-build-install.sh) (free build + install to a device).
- **Full case study + every error→fix we hit**: [references/troubleshooting.md](references/troubleshooting.md).
