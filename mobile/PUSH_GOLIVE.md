# Turning on push notifications — end-to-end go-live

This is the single, ordered checklist to switch reminder notifications on. The
**code is already complete** — both the phone side (minting a token) and the
server side (sending to it). What remains is account/credential setup that only
you can do, because it needs your Firebase and (for iOS) Apple accounts.

There are **two separate channels**, each independently optional, and each
turned on by a different secret:

| Channel | Who it reaches | What you set | Where |
| --- | --- | --- | --- |
| **Web push** | Browser / installed PWA | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Supabase function secrets |
| **Native push (Android)** | The Android app | `GOOGLE_SERVICES_JSON` (build) **and** `FCM_SERVICE_ACCOUNT` (send) | GitHub secret + Supabase function secret |
| **Native push (iOS)** | The iPhone app | Apple APNs key in Firebase + an iOS build | Deferred — needs a Mac |

> **The two Firebase artifacts are different things, from the same project:**
> - `google-services.json` — the **app config**, baked into the Android build so
>   the phone can mint a token. (Provided to the build as the base64 GitHub
>   secret `GOOGLE_SERVICES_JSON`.)
> - the **service-account key** — a server credential that lets the edge
>   function **send** to those tokens. (Set as the Supabase function secret
>   `FCM_SERVICE_ACCOUNT`, raw JSON.)
> You need **both** for native push to work end-to-end.

---

## A. Android — let the phone mint a token

1. Create the Firebase project and Android app, and download
   `google-services.json` — follow **`mobile/FIREBASE_SETUP.md` Part A**. The
   Android package name must be exactly `dk.mprc.treatmentcompanion`.
2. Base64-encode the file and add it as a **GitHub Actions secret** named
   **`GOOGLE_SERVICES_JSON`** (repo → Settings → Secrets and variables →
   Actions → New repository secret):
   - macOS/Linux: `base64 -i google-services.json | pbcopy`
   - Windows PowerShell:
     `[Convert]::ToBase64String([IO.File]::ReadAllBytes("google-services.json")) | Set-Clipboard`
3. Re-run the **"Android build"** workflow (Actions tab → Run workflow). With the
   secret present it installs the push plugin, writes `google-services.json`, and
   builds an APK **with push enabled** (the APK is attached to the
   `android-latest` release).
4. Install that APK, **log in as a patient**, and **Allow** the notification
   prompt. Confirm a token landed — in the Supabase SQL editor:
   ```sql
   select profile_id, platform, locale, created_at
   from device_push_token order by created_at desc;
   ```
   A `platform = android` row means the phone→token→database chain works.

## B. Server — let the edge function send

5. In the **same Firebase project**: Project settings → **Service accounts** →
   **Generate new private key** → download the JSON. Keep it secret (never
   commit it).
6. Set it as a **Supabase Edge Function secret** named **`FCM_SERVICE_ACCOUNT`**,
   as the **raw JSON** (not base64):
   ```
   supabase secrets set FCM_SERVICE_ACCOUNT="$(cat service-account.json)"
   ```
   (or paste it in the dashboard: Project → Edge Functions → Manage secrets).
7. Set the remaining function secrets:
   - **`CRON_SECRET`** — any long random string; the scheduled job sends it as
     `Authorization: Bearer <CRON_SECRET>` and the function checks it.
   - (optional, web push) **`VAPID_PUBLIC_KEY`**, **`VAPID_PRIVATE_KEY`**,
     **`VAPID_SUBJECT`** (e.g. `mailto:you@clinic.dk`).
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are **auto-injected** by
     Supabase — you do **not** set these.
8. **Deploy** the function with JWT verification off, so the cron job can call it
   with the `CRON_SECRET` bearer rather than a Supabase user token:
   ```
   supabase functions deploy send-checkin-notifications --no-verify-jwt
   ```

## C. Schedule the daily run

9. Enable **pg_cron** and **pg_net** (Dashboard → Database → Extensions).
10. Store the two **Vault** secrets the schedule reads (SQL editor — never
    commit these):
    ```sql
    select vault.create_secret('<CRON_SECRET>', 'cron_secret');
    select vault.create_secret(
      'https://<project-ref>.supabase.co/functions/v1/send-checkin-notifications',
      'checkin_fn_url'
    );
    ```
11. Run migration **`0104_schedule_checkin_notifications.sql`** in the SQL editor.
    It creates the daily 07:00 UTC job (idempotent). (The migration is guarded,
    so it also no-ops cleanly anywhere pg_cron is absent.)

## D. Verify the whole chain

12. **Dry run** (reports the plan, sends nothing):
    ```
    curl -X POST https://<project-ref>.supabase.co/functions/v1/send-checkin-notifications \
      -H "Authorization: Bearer <CRON_SECRET>" \
      -H "Content-Type: application/json" \
      -d '{"dryRun": true}'
    ```
    Check `channels` shows `web`/`native` as expected and the planned counts.
13. **One real test push** to yourself:
    ```
    curl -X POST https://<project-ref>.supabase.co/functions/v1/send-checkin-notifications \
      -H "Authorization: Bearer <CRON_SECRET>" \
      -H "Content-Type: application/json" \
      -d '{"testProfileId": "<your-profile-id>"}'
    ```
    You should get a notification with generic text (no health details).

---

## iOS (deferred — needs a Mac and an Apple Developer account)

The server already sends to **any** registered token via FCM, so **no
server/edge-function change is needed for iOS** — once an iOS app is registered
with the same Firebase project, its tokens flow through the same path (FCM
relays to Apple's APNs). The remaining iOS-only steps, when a Mac is available:

1. Apple Developer account → create an **APNs auth key** (.p8).
2. In Firebase → the iOS app (bundle id `dk.mprc.treatmentcompanion`) → upload
   the APNs key.
3. `cd mobile && npx cap add ios && npx cap sync ios`, then build/sign in Xcode
   on the Mac. Add `GoogleService-Info.plist` (the iOS equivalent of
   `google-services.json`) to the iOS app.
4. Verify a `platform = ios` row appears in `device_push_token`, then repeat the
   §D test.

---

## What is already done (no action needed)
- Phone-side token registration: `lib/nativePush.ts` +
  `components/feedback/NativePushRegistrar.tsx`, storing via the
  `register_device_push_token` RPC (migration `0102`).
- Android Gradle wiring for `google-services.json` (auto-applies when the file
  is present) and the cloud APK build (`.github/workflows/android-build.yml`).
- Server send via **FCM HTTP v1** with dead-token cleanup, plus web push —
  `supabase/functions/send-checkin-notifications/index.ts`. Both channels send
  in one run; a prompt is marked done if it reached at least one channel.
- Reminder text is localized (en/da/sv/nb) and **carries no health details**.
