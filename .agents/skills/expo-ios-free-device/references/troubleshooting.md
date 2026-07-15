# Free iOS physical-device builds — full case study (every error → fix)

Real log of getting an Expo SDK 56 app (with `@shopify/react-native-skia`) onto a physical
iPhone **and** iPad using a **free Apple ID**, on macOS + Xcode 26. Match an error below to its fix.
Ordered the way you actually hit them.

---

## 0. Decide the path first

- App uses a native module Expo Go lacks (Skia, etc.) → **Expo Go is out** (it ships a fixed module
  set; Skia needs a dev build). Don't downgrade the SDK hoping Expo Go will work — the native module
  is the blocker, not the SDK version.
- Free Apple ID + physical device → **local dev build** (this doc). Paid → EAS cloud is far smoother.
- Just want to see it → **simulator**: `npx expo run:ios` (no signing, no device).

## 1. Project setup for a dev build

- `npx expo install expo-dev-client`
- `eas.json` with a `development` profile (`developmentClient: true`, `distribution: internal`).
- `app.json`: set `ios.bundleIdentifier`, `android.package`, and `ios.supportsTablet: true` (iPad).
- gitignore the CNG output: `/ios/`, `/android/`, `.expo/`, `dist/`.

## 2. Signing — the wall and the way through

**Symptom:** `npx expo run:ios --device` → `CommandError: No code signing certificates are available to use.`
- Cause: no Apple ID in Xcode yet → no team → no cert.
- Check: `security find-identity -v -p codesigning` → `0 valid identities found`;
  `defaults read com.apple.dt.Xcode IDEProvisioningTeams` empty.
- Fix step 1: **Xcode → Settings → Accounts → + → Apple ID**. Creates the "Personal Team".

**Symptom:** Xcode GUI shows **"Failed to load container for document at url … <App>.xcodeproj"**;
project editor shows *Project Format: Empty Selection*; no Run/scheme controls in the toolbar.
- The Expo-generated project may refuse to load in the IDE even though the toolchain is fine
  (`plutil -lint project.pbxproj` = OK, `xcodebuild -list` / `-showBuildSettings` work).
- Tried and NOT enough: clearing DerivedData, `Saved Application State`, `xcuserdata`, force
  `open -a Xcode`. The GUI still wouldn't load it.
- **Don't fight the GUI.** Use the **dummy-project trick** to mint signing assets, then build via CLI.

**The dummy-project trick (mints cert + profile + registers device):**
1. Xcode → **File → New → Project → App**. Set **Bundle Identifier === your app's** (e.g.
   `com.you.app`), **Team = Personal Team**. A brand-new native project DOES load in the GUI.
2. Connect + unlock the device (Developer Mode ON), pick it as destination, press ▶ Run.
   Xcode creates: **Apple Development cert (with private key)** + an Xcode-managed provisioning
   profile for that bundle id + **registers the device**.
3. Verify: `security find-identity -v -p codesigning` now shows
   `Apple Development: you@…(XXXX) — 1 valid identities found`.

**Symptom:** CLI build → `error: No Account for Team "XXXXXXXXXX"` / `No profiles for '<bundle id>' were found`.
- Two causes, both real:
  - **Wrong Team ID.** The `(XXXXXXXXXX)` in the cert *name* is NOT the team id. Read the real one
    from the dummy project: `grep DEVELOPMENT_TEAM <dummy>/<App>.xcodeproj/project.pbxproj`.
    (In this case the cert name said `2CY6Y6CWXA` but the real team was `DF4622YDDJ`.)
  - **CLI can't mint free profiles.** `xcodebuild -allowProvisioningUpdates` errors "No Account for
    Team" for free teams. It only *reuses* a profile the GUI already made (step 2 above).
- Fix: set the **correct** `DEVELOPMENT_TEAM` in the app's pbxproj and use `CODE_SIGN_STYLE = Automatic`.

**Symptom:** `Provisioning profile "…" is Xcode managed, but signing settings require a manually managed profile.`
- You set `CODE_SIGN_STYLE = Manual`. The free profile is Xcode-managed → keep it **Automatic**.

**Result:** with correct team + Automatic + `-allowProvisioningUpdates`, signing passes
(`GatherProvisioningInputs` succeeds, no signing errors).

## 3. Compilation — toolchain mismatch (NOT your code)

**Symptom:** build now actually compiles, then fails in `expo-modules-jsi`:
`error: 'weak' must be a mutable variable, because it may change at runtime` (×15, all `weak let`).
- `weak let` (Sendable-required) needs **Swift 6.3+**. Confirm: it failed on Swift 6.2.0 even with
  `-enable-upcoming-feature WeakLet`; a one-line test reproduces it:
  `printf 'final class R:Sendable{}\nfinal class C:Sendable{weak let r:R?=nil}\n' | xcrun swiftc -swift-version 6 -typecheck -`
- The package is correct (`Package.swift`: tools 6.2, `swiftLanguageModes:[.v6]`, podspec `swift_version 6.0`);
  the **compiler is too old**. No newer package patch existed (it was the latest).
- **Fix: update Xcode** (here 26.0.1 → 26.6, Swift 6.2.0 → 6.3.3). Re-test → `weak let` compiles.
- Hack alternative (only if you can't update Xcode): patch `weak let` → `nonisolated(unsafe) weak var`
  and persist with `patch-package`. Works but it's a workaround for an upstream version gap.

**Symptom:** after updating Xcode → `error: iOS 26.5 is not installed. Please download … from Xcode > Settings > Components.`
(`Unable to find a destination matching the provided destination specifier`).
- The newer Xcode needs its **iOS platform** installed (separate from the app). It's required for
  **device** builds too, not only the simulator.
- Fix: `xcodebuild -downloadPlatform iOS` (or Xcode → Settings → Components → iOS). ~8.5 GB.

## 4. Build + install

```bash
xcodebuild -workspace ios/<App>.xcworkspace -scheme <App> -configuration Debug \
  -destination "id=<UDID>" -allowProvisioningUpdates build       # → ** BUILD SUCCEEDED **
xcrun devicectl device install app --device <UDID> "<DerivedData>/…/<App>.app"
```
- Use `expo run:ios` only if you want it to also start Metro — but it re-runs `prebuild`, which
  **wipes** your `DEVELOPMENT_TEAM` injection. Building with `xcodebuild` directly avoids that.
- `codesign -dv <App>.app` should show your `TeamIdentifier`.

## 5. Reaching a local backend from the device

**Symptom:** app installs and opens, but login / API calls fail.
- The app's API URL is `http://localhost:PORT`. On the phone, **`localhost` is the phone**, not the Mac.
- Fixes (both needed):
  1. **Bind the backend to all interfaces**: `--host 0.0.0.0` (e.g. uvicorn/express), not 127.0.0.1.
  2. **Point the app at the Mac's LAN IP**: `IP=$(ipconfig getifaddr en0)`. Expo inlines
     `EXPO_PUBLIC_*` at **bundle time**, so:
     `EXPO_PUBLIC_API_URL="http://$IP:PORT" npx expo start --dev-client` — **no native rebuild**,
     just reload the app. (Shell env beats the `.env` value; dotenv doesn't override existing env.)
- Phone and Mac must be on the **same Wi-Fi**. If a dev-login accepts any email, it usually
  *get-or-creates* the user — any email works, no password.

## 6. A SECOND device (e.g. iPad)

**Symptom:** iPad install fails — its UDID isn't in the profile.
- Free profiles only include devices present when minted. Check the profile's `ProvisionedDevices`:
  `find ~/Library/{MobileDevice,Developer/Xcode/UserData}/Provisioning\ Profiles -name '*.mobileprovision'`
  then `security cms -D -i <f> | plutil -p -`.
- Fix: connect the iPad (USB, unlocked, Developer Mode ON) and rebuild to it with
  `-allowProvisioningDeviceRegistration` → registers the UDID + regenerates the profile, then install.

## 7. Expiry / next time

- Free certs & profiles **expire after 7 days** → rebuild (`xcodebuild … build`) to renew.
- For the daily loop you don't rebuild native: `dev-up.sh` (backend on LAN + Metro on LAN) and just
  reload the JS in the dev client.

---

### Gotchas worth remembering
- `security`/`ls` globbing on `~/Library/.../Provisioning Profiles/*.mobileprovision` fails under
  zsh "no matches" — use `find` instead.
- Two device IDs exist: the **hardware UDID** (`00008XXX-…`, used by xcodebuild/profiles) and the
  **coredevice UUID** (`xcrun devicectl list devices`). Provisioning uses the hardware UDID.
- Xcode `Saved Application State` restores a broken/error window on relaunch — delete
  `~/Library/Saved Application State/com.apple.dt.Xcode.savedState` to truly start fresh.
