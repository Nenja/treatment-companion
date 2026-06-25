# iOS go-live — developer brief (Treatment Companion)

**Goal:** ship the iOS app to **TestFlight** for the pilot (not the public App Store — see §6).

**Read this first — the honest split.** The *app* is already iOS-ready: the
native shell loads the live web app (`server.url` in `capacitor.config.ts`), the
push layer is platform-agnostic (`lib/nativePush.ts` registers an FCM token; the
server sends via FCM HTTP v1 and **FCM relays to Apple's APNs**, so **no server
changes are needed for iOS** — see `PUSH_GOLIVE.md`). What remains is **accounts +
build pipeline + review**, almost none of which can be done from Windows or Linux.
Everything in this repo that *could* be pre-done is done (icon/splash sources,
config, this brief). The rest is below.

---

## Status snapshot

| | |
|---|---|
| App ID (permanent) | ✅ `dk.mprc.treatmentcompanion` (in `mobile/capacitor.config.ts`) |
| Android native platform | ✅ `mobile/android/` exists & builds |
| iOS native platform | ❌ `mobile/ios/` — generate with `cap add ios` **on the Mac/cloud env** |
| Push architecture | ✅ platform-agnostic; server unchanged for iOS |
| iOS push account wiring | ❌ APNs key + Firebase iOS app (see §3) |
| Icon / splash sources | ✅ `mobile/assets/{icon,splash,splash-dark}.png` |
| Cloud build + signing | ❌ pick a service, configure (see §4 + `codemagic.example.yaml`) |
| App Store Connect record + TestFlight | ❌ (see §5) |
| Privacy labels / DPO sign-off | ❌ runs in parallel (see §6) |

---

## §0  Decisions & prerequisites (START THESE NOW — they have lead time)

1. **Apple Developer Program** — $99/year. **Decision: organisation vs individual.**
   For an MPRC / Region H research app, enrol as an **organisation** (the app is
   institutional, not personal). Organisation enrolment needs:
   - a **D-U-N-S number** for the legal entity (free from Dun & Bradstreet; can
     take **days to a couple of weeks** to issue/verify — this is the critical path);
   - someone with legal authority to bind the entity.
   → *This is the single thing most likely to delay the pilot. Kick it off before
   any code work.*
2. **Choose a cloud-Mac build service.** No Mac required to build/sign/submit.
   Good fits for Capacitor:
   - **Capawesome Cloud** — purpose-built for Capacitor, automates signing, M-series.
   - **Codemagic** — general mobile CI, strong signing automation + TestFlight publish
     (example config provided: `codemagic.example.yaml`).
   - **Xcode Cloud** / **Bitrise** — also work.
   A local Mac is only needed for *interactive simulator debugging*, not for builds.

---

## §1  Generate the iOS platform (on the Mac / cloud build env)

```bash
cd mobile
npm ci
npx cap add ios            # creates mobile/ios/ (runs pod install — needs macOS)
npx cap sync ios
npm i -D @capacitor/assets
npx @capacitor/assets generate --ios   # expands mobile/assets/* into all iOS sizes
```

Commit the generated `mobile/ios/` folder once customised (Info.plist, capabilities)
so changes aren't lost. `node_modules/` stays git-ignored.

---

## §2  Native iOS config

In Xcode (or via the generated project files):

- **Display name:** Treatment Companion.
- **Info.plist usage strings** (the goal-video recorder uses the camera):
  ```
  NSCameraUsageDescription      = "Used to record a short movement video for your clinician."
  NSMicrophoneUsageDescription  = "Used to record sound with your movement video."
  ```
- **Capabilities** (Signing & Capabilities tab):
  - **Push Notifications**
  - **Background Modes → Remote notifications**

---

## §3  iOS push wiring (account work; code already done)

The server already sends to any device token via FCM and FCM relays to APNs, so
**only Apple/Firebase wiring is left** (full steps in `PUSH_GOLIVE.md`):

1. Apple Developer → **Keys** → create an **APNs Auth Key** (`.p8`). Note the Key ID + Team ID.
2. Firebase (the *same* project as Android) → add an **iOS app** with bundle id
   `dk.mprc.treatmentcompanion` → download **`GoogleService-Info.plist`** into the iOS project.
3. Firebase → **Project settings → Cloud Messaging → Apple app config** → upload the `.p8` (+ Key ID, Team ID).
4. `@capacitor/push-notifications` is already in `mobile/package.json` and the
   registration code (`lib/nativePush.ts`, `NativePushRegistrar`) already runs in the shell.
5. **Test on a real iPhone** (push does not work in the simulator): sign in →
   permission prompt → trigger a check-in reminder → confirm it arrives **with the
   app closed**.

> Keep push payloads clinically empty (they already are — "Your weekly check-in is
> ready"). No patient data in notifications. See §6.

---

## §4  Cloud build + signing

- Connect the chosen service to this GitHub repo.
- Provide signing via an **App Store Connect API key** (the service stores it; it
  fetches/creates the certificate + provisioning profile automatically — no manual
  keychain juggling, no Mac needed).
- **Xcode 26+ is mandatory:** since **2026-04-28** Apple rejects submissions built
  with older SDKs. Managed services default to a current Xcode — confirm it's 26+.
- Starting point: `codemagic.example.yaml` (copy to repo root as `codemagic.yaml`,
  fill placeholders). Adapt or replace if using Capawesome/Appflow.

---

## §5  App Store Connect + TestFlight (pilot distribution)

1. Create the app record (bundle id `dk.mprc.treatmentcompanion`).
2. Fill **App Privacy ("nutrition labels")** — declare health-related data
   collection; must match the DPIA / privacy notice (see §6).
3. Provide a **reviewer demo login** (a seeded test account) — reviewers must be
   able to get past auth.
4. Upload the build (the cloud service can publish straight to TestFlight).
5. Add **external testers** (up to 10,000) by email/public link; builds last **90
   days**, renewable. Beta review is typically 1–2 days.

---

## §6  Privacy / regulatory (parallel; owner: Nikolaj + DPO)

- **App Privacy labels** must match the DPIA and privacy notice.
- **Apple / APNs as a sub-processor:** push transits Apple's APNs. Because payloads
  carry no clinical content, exposure is minimal — but add Apple to the
  sub-processor mapping for completeness.
- **Health-app review scrutiny:** be ready to explain data handling and EU hosting
  (Supabase EU region) and the "no diagnosis / no dosing" stance.

---

## §7  The wrapper / public-App-Store caveat

The iOS app loads a remote URL (`server.url`). Apple's **Guideline 4.2 (minimum
functionality)** can reject pure website wrappers from the *public* App Store. Your
native push + offline fallback strengthen the case, but it's a real risk.
**For the pilot, distribute via TestFlight only** — beta review is lighter and this
sidesteps 4.2 entirely. Decide the public-store posture *after* the pilot.

---

## §8  Device acceptance tests (before inviting patients)

- App opens and loads the web app (not the "Connecting…" fallback).
- **Login persists** across close/reopen.
- **Push arrives with the app fully closed** (real device).
- **Camera recording** works after granting permission.
- Notification tap deep-links into the check-in screen.

---

## What only the Mac / your accounts can do (irreducible)

- `cap add ios` + `pod install` + the signed build → **macOS/cloud build service**.
- APNs key, certificate, provisioning profile, App Store Connect record → **your Apple account**.
- Firebase iOS app + `GoogleService-Info.plist` + APNs upload → **your Firebase project**.
- Privacy-label content + DPO sign-off → **you + DPO**.

**Realistic calendar time to patients-on-TestFlight: ~2–4 weeks**, dominated by
Apple organisation enrolment (§0) and DPO sign-off — *not* by engineering
(~3–5 focused dev-days once accounts exist).
