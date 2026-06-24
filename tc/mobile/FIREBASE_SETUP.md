# Push notifications — Firebase / FCM setup (Android)

This wires Firebase Cloud Messaging into the Android build so the phone can mint
a push token. The web side is already done: `lib/nativePush.ts` +
`components/feedback/NativePushRegistrar.tsx` (shipped in cockpit-98) request
notification permission inside the native app, register for a token, and store
it via the `register_device_push_token` RPC (migration 0102). This guide only
covers the Firebase + Gradle wiring that lets Android produce that token.

> **iOS is deferred.** It can't be built on Windows (needs a Mac + an Apple Push
> key/APNs). Set the project up now; add the iOS app to the same Firebase
> project later when a Mac is available.

App ID (must match everywhere, permanent): **`dk.mprc.treatmentcompanion`**

---

## Part A — Firebase Console (~5 min)

1. Go to <https://console.firebase.google.com> and sign in with the account that
   should **own** this (ideally an MPRC-owned Google account — this is permanent
   infrastructure, not a personal project).
2. **Create a project** → name it e.g. `Treatment Companion`. You can **turn off
   Google Analytics** (not needed for push; keeps it simpler).
3. On the project overview, click the **Android** icon ("Add app" → Android).
4. **Android package name:** enter exactly `dk.mprc.treatmentcompanion`
   (case-sensitive; it **cannot be changed** for this app once registered).
5. App nickname: optional. **Debug signing certificate SHA-1: leave blank** —
   not required for push notifications.
6. Click **Register app**, then **Download `google-services.json`**.
7. You can **ignore** the Gradle snippets Firebase then shows on screen — Capacitor's
   plugin pulls in the Firebase SDK; you only need the file + the two lines in Part B.
   Click **Next → Continue to console**.

---

## Part B — wire it into the Android build (in the `mobile/` folder)

1. **Install the push plugin** (terminal, inside `mobile/`):
   ```
   npm install @capacitor/push-notifications@^8.0.0
   ```
   (`^8` matches the Capacitor 8 core already in use. Commit the changed
   `package.json` / `package-lock.json`.)

2. **Place `google-services.json`** at:
   ```
   mobile/android/app/google-services.json
   ```
   (the `app` folder — next to its `build.gradle`.)

3. **Gradle: nothing to edit** — Capacitor 8.4 already wires it.
   - `mobile/android/build.gradle` already contains
     `classpath 'com.google.gms:google-services:4.4.4'` in its `buildscript`
     dependencies block.
   - `mobile/android/app/build.gradle` already ends with a `try { … }` block that
     applies the `com.google.gms.google-services` plugin **automatically as soon
     as `google-services.json` is present** in `android/app/`.

   So placing the file in step 2 is what activates everything — there is no line
   to add. (If you ever fully re-run `cap add android`, these come back
   regenerated; `cap sync` leaves them alone.)

4. **Sync + run** (inside `mobile/`):
   ```
   npx cap sync
   npx cap open android
   ```
   Then Run ▶ in Android Studio.

> `cap sync` does **not** overwrite your Gradle edits, so they persist. Only a
> fresh `cap add android` would regenerate them (along with re-applying the
> proguard fix). Committing the `android/` folder avoids that entirely.

---

## Part C — verify the whole chain

1. On the phone, **log in as a patient** (the token only registers for a
   logged-in user — that's `NativePushRegistrar` firing).
2. On first launch, **Android 13+ shows a notification-permission prompt** → Allow.
3. In the Supabase **SQL Editor**:
   ```sql
   select profile_id, platform, locale, created_at
   from device_push_token
   order by created_at desc;
   ```
   A row with `platform = android` means the chain works end-to-end:
   Firebase minted a token → the plugin caught it → the RPC stored it.

**If no row appears**, the usual causes are: notification permission denied, or
the `google-services.json` package name not matching `dk.mprc.treatmentcompanion`.

---

## Sending the pushes — already implemented

The send side is **done**: `supabase/functions/send-checkin-notifications`
already pushes to native tokens via **FCM HTTP v1** (with dead-token cleanup),
alongside web push. To switch it on you only need to give it the
**service-account credential** from this same Firebase project (Project settings
→ Service accounts → Generate new private key) as the Supabase function secret
`FCM_SERVICE_ACCOUNT` — keep the key secret, never committed.

For the full end-to-end go-live — the GitHub `GOOGLE_SERVICES_JSON` secret (this
file's job), the `FCM_SERVICE_ACCOUNT` function secret, deploying the function,
the cron schedule, and verification — follow **`mobile/PUSH_GOLIVE.md`**.
