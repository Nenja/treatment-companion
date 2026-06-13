# Treatment Companion — native app (Capacitor)

A thin native shell (iOS + Android) around the existing web app. The screens you
see in the app **are the live website** (`https://treatment-companion.vercel.app`)
running inside a native container. That means everyday content/logic changes ship
the instant you deploy the website — no app-store resubmission for normal updates.
The native shell exists to (1) put the app in the App Store and Play Store, and
(2) let you add genuinely native features over time (push reminders, biometric lock).

---

## Read this first — the real prerequisites

- **Android: build it on your Windows PC.** ✅ Fully supported.
- **iOS: needs a Mac.** ❌ You cannot build or submit an iOS app from Windows.
  Options: a Mac you can use, or a **cloud-Mac build service** (Codemagic, Ionic
  Appflow, Bitrise, Expo EAS) that builds and submits without you owning a Mac.
  → **Do Android first; tackle iOS once you have Mac access.**
- **Paid developer accounts:** Apple Developer Program **$99/year**; Google Play
  **$25 one-time**. For a clinic/company, an Apple **organisation** account is
  better than individual, but it needs a D-U-N-S number (can take a few days).
- **Health-app review:** both stores scrutinise health apps. Expect privacy/data
  forms and a reviewer demo login. The app's "no diagnosis / no dosing" stance
  helps, but it handles patient data — be ready to explain data handling and EU
  hosting (the Supabase EU region).
- **Apple's "minimum functionality" rule (4.2):** Apple can reject an app that is
  *only* a website wrapper. The cure is real native value — **push reminders**
  (Milestone 2). Google Play is more lenient. So the natural order is **Android
  now → iOS after native push exists**.

## Two decisions to make

1. **App ID** — currently a placeholder `dk.treatmentcompanion.app` in
   `capacitor.config.ts`. **It is permanent once published and can't be changed**,
   so set it to a reverse-DNS id you're happy with, ideally based on a domain you
   control. The same id is used on both stores.
2. **Name / icon / splash** — name is "Treatment Companion". You'll need a
   1024×1024 PNG icon and a splash image (Milestone 2; placeholders work until then).

---

## One-time setup on your PC (Windows, for Android)

1. **Node.js** — you already have it (the web app uses it).
2. **Android Studio** — install it (gives you the Android SDK + a phone emulator).
   On first launch, let it install the default SDK.
3. **Java JDK 17** — Android Studio usually bundles a compatible JDK; if a build
   complains about Java, install JDK 17 separately.

## Build & run on Android (Windows)

```bash
cd mobile
npm install
npx cap add android      # first time only — creates the android/ project
npx cap sync             # copies config + the offline fallback into the project
npx cap open android     # opens the project in Android Studio
```

Then in Android Studio: pick an emulator (or plug in a phone with USB debugging
on), press **Run** ▶. The app launches and loads the website. To make an
installable file for the Play Store later, use **Build → Generate Signed
Bundle / APK** (you'll create a signing key — Android Studio walks you through it).

## Build & run on iOS (Mac only)

```bash
cd mobile
npm install
npx cap add ios          # first time only — creates the ios/ project
npx cap sync
npx cap open ios         # opens the project in Xcode
```

Then in Xcode: select a simulator or device and press **Run** ▶. (Or point a
cloud-Mac service at this folder to build/submit without a physical Mac.)

---

## Make the camera work (the goal-video recorder)

The web app records video via the browser camera API. Inside the native shell
that needs an explicit native permission, or recording will silently fail.

**Android** — after `npx cap add android`, open
`android/app/src/main/AndroidManifest.xml` and add inside `<manifest>`:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

**iOS** — in Xcode, open `Info.plist` and add two entries with a short reason the
user will see:

```
NSCameraUsageDescription      = "Used to record a short movement video for your clinician."
NSMicrophoneUsageDescription  = "Used to record sound with your movement video."
```

The first time a patient records, the app will ask for permission. **Test this on
a real device** — it's the one feature that won't "just work" without the above.

## Things to test on a device (Milestone 1 acceptance)

- The app opens and loads the web app (not the "Connecting…" fallback).
- **Login works and stays logged in** after closing/reopening the app.
- Navigating around works; the Android **back button** behaves sensibly.
- **Camera recording** works after granting permission (see above).

---

## How updates work

- **Everyday changes** (any screen, text, logic, fixes): just deploy the website
  to Vercel as usual — the app shows them immediately, no resubmission.
- **Native changes** (push, app icon, permissions, the app name, the App ID):
  rebuild the app and resubmit to the store(s).

## Configuration (`capacitor.config.ts`)

- `appId` / `appName` — see decisions above.
- `server.url` — the website the app loads. While developing the shell you can
  point it at your PC's dev server (e.g. `http://192.168.1.50:3000`, and set
  `cleartext: true` temporarily) or a staging URL, then switch back to production
  for the store build. After any change here, run `npx cap sync`.

## Committing the native projects

`node_modules/` is git-ignored. Once you start customising the native projects
(the camera permissions above, push config, icons), **commit the `android/` and
`ios/` folders** so those customisations aren't lost — they're regenerated by
`cap add` only if absent.

## Note for Vercel

This `mobile/` folder is a separate project; Vercel only builds the Next.js root
and will ignore it. To keep Vercel's uploads lean you can add a line `mobile` to a
`.vercelignore` file at the repo root (optional).

---

## What's NOT done yet — Milestone 2

The shell gets you running and into Google Play. Before the App Store (and to make
the app genuinely useful), the next pieces are:

1. **Native push notifications** — check-in reminders via FCM (Android) + APNs
   (iOS), using `@capacitor/push-notifications`. This is the main native feature
   *and* what satisfies Apple's rule 4.2. It requires: a Firebase project (FCM), an
   Apple push key, storing each device's token against the user in Supabase, and a
   backend change so the existing `send-checkin-notifications` function sends native
   push (not just web push). Real work, but well-defined.
2. **App icon + splash screen** — real 1024×1024 icon and splash assets
   (`@capacitor/assets` generates all sizes from one image).
3. **Store listings** — screenshots, descriptions, privacy "nutrition labels"
   (declare health-data collection), a reviewer demo login.
4. **Optional:** biometric app-lock, deep links.

When you've confirmed Milestone 1 runs on an Android device, say so and we'll do
Milestone 2 — push is the natural next step.
