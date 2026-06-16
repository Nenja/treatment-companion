# Cloud Android build — how to get the app on your phone

This replaces building in Android Studio. You push to GitHub (as you already
do); a clean machine in the cloud builds the Android app and produces an
installable file. **No Android Studio, SDK, JDK, or OneDrive involved — ever.**

> **You rarely need to run this.** The app loads the live website
> (`treatment-companion.vercel.app`), so normal web/app changes go live through
> Vercel instantly, exactly as before. You only rebuild the APK when something
> *native* changes — a new Capacitor plugin, an Android permission, or the app
> icon. Day to day, you can ignore this.

---

## One-time setup

1. Put these two files into your repo (via GitHub Desktop, same as always):
   - `android-build.yml` → into the **`.github/workflows/`** folder
     (the same folder that already has `ci.yml`).
   - the new **`mobile/package.json`** → replace your existing
     `mobile/package.json` (it just adds the push-notifications plugin).
   - (`CLOUD_BUILD.md` — this file — can go in `mobile/` for reference.)
2. Commit and push.

That's the whole setup. The build can now run.

---

## (Optional, for push notifications) add the Firebase secret

Skip this for now if you just want the app running — push can be switched on
later with no rebuild penalty. When you're ready:

1. Get your `google-services.json` (downloaded from the Firebase console — see
   `FIREBASE_SETUP.md`).
2. Turn it into one line of text. In **PowerShell** on Windows:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\google-services.json")) | Set-Clipboard
   ```
   (Adjust the path if the file is elsewhere.) This copies a long string to your
   clipboard.
3. In your GitHub repo: **Settings → Secrets and variables → Actions → New
   repository secret.** Name it exactly `GOOGLE_SERVICES_JSON`, paste the string
   as the value, save.

The next build will detect the secret and turn push on automatically. No secret =
the app still builds and runs, just without push.

---

## Running a build

1. On GitHub, open the **Actions** tab.
2. Click **Android build** in the left sidebar.
3. Click **Run workflow** (top right) → **Run workflow**.
4. Wait ~5–8 minutes. A green check = success.

(It also runs automatically whenever you push a change inside `mobile/`.)

---

## Getting the app onto your phone

**Easiest — straight from your phone:**
1. On GitHub, go to the repo's **Releases** (right-hand side of the main page),
   open **"Treatment Companion — Android (latest debug build)"**. The direct link
   is `https://github.com/Nenja/treatment-companion/releases/tag/android-latest`.
2. Open that page **on your phone's browser** and tap the `app-debug.apk` file.
3. It downloads; tap the downloaded file to install. The first time, Android will
   ask you to allow installing from your browser — allow it.

**Alternative — from your PC:** Actions tab → click the finished run → scroll to
**Artifacts** → download `treatment-companion-android-apk` (a zip) → unzip →
`app-debug.apk`. Then email it to yourself or drop it in Google Drive to open on
the phone.

> **Updating:** if installing a newer build fails with "App not installed" or a
> signature error, uninstall the old app first, then install. (Debug builds
> aren't signed with a stable key — fine for testing.)

---

## Later: iPhone

The same approach covers iOS — GitHub also offers **macOS** build machines, so
the iPhone app can be built in the cloud too (you do **not** need to own a Mac).
It additionally needs an Apple Developer account ($99/yr) and a signing
certificate. We'll set that up as a second workflow when you reach the iOS stage.
