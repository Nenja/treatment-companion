# Transfer prompt — paste this into a new chat

> **What this is.** Paste the text below (everything under the line) into a
> fresh chat, and attach the latest handoff zip. It's the short kickoff that
> orients a new Claude instance in one shot. The deep reference is
> `HANDOVER.md` inside the zip — this prompt just points at it and encodes the
> rules, the working style, and where we are.
>
> **Keep this current.** At the end of *every* delivery, update the two
> volatile sections (**“Where we are”** and **“What’s likely next”**) to match
> `HANDOVER.md` §7/§8, and bump the build tag + migration number. The rest is
> stable and rarely changes.

---

You're picking up work on **Treatment Companion** with me. **First, read
`HANDOVER.md` in the attached zip — it's the single source of truth.** Then
confirm where we are and wait for my direction. Don't restate the whole
handover back to me; just tell me the current build/migration and that you're
ready.

**Who I am / the project.** I'm a physician in Denmark (non-developer). The app
is a patient-first clinical web app for adults on botulinum-toxin spasticity
treatment, with an intrathecal-baclofen parallel therapy and a face-muscle
dosing module. Patients suggest goals; clinicians approve them; patients do
weekly check-ins; the app produces descriptive summaries, EHR text and
pseudonymised CSV exports. It deliberately **does not diagnose, dose, recommend
or predict**. Direction of information is primarily **upward** (patient/therapist
→ clinic); the only sanctioned downward channel is the physician→therapist
handoff note (inter-professional, never patient-visible). Don't build a
clinic→patient messaging channel.

**My setup (this shapes how you deliver).**
- Stack: Next.js 15.1.9 / React 19 / TypeScript / Tailwind v4 / Supabase.
- Live: `https://treatment-companion.vercel.app` · GitHub:
  `github.com/Nenja/treatment-companion`.
- I'm on **Windows + Firefox** and **cannot run code locally.** I deploy by
  **uploading a zip to GitHub** (Vercel auto-builds), and I run **SQL migrations
  by hand in the Supabase SQL editor**. So everything you give me has to work
  through that pipeline.

**Non-negotiable delivery workflow** (details in `HANDOVER.md` §2):
1. **One clean repo zip per delivery**, with a **new filename** and a root
   **`BUILD.txt`** (what changed, which migration to run, what I must QA). The
   zip excludes `node_modules` and `.next`.
2. **Font-stub build before shipping:** the two `next/font/google` fonts in
   `app/[locale]/layout.tsx` can't fetch in the sandbox, so stub them, run
   `rm -rf .next && NEXT_TELEMETRY_DISABLED=1 npx next build`, confirm it
   compiles, then **restore `layout.tsx` byte-for-byte** and confirm **zero
   `BUILD-STUB` remnants**. Also run `npx tsc --noEmit` clean.
3. **New migrations:** numbered next in `supabase/migrations/`, **and** dropped
   as a **standalone `.sql` in outputs** so I can paste it into Supabase. Only
   for *new* migrations — never re-deliver old ones. For any non-trivial
   migration (RPC, constraint, RLS), **verify it on a throwaway Postgres**
   first (`HANDOVER.md` §5.12 D) and say so.
4. **i18n parity:** every user-facing string gets **en + da** keys, kept at
   full parity. Danish is your first pass, flagged as pending native review.
   Watch the known blind spot: strings hidden in ternaries / error messages.
5. **Be honest about what's unverified.** You can't see rendered screens, real
   devices, or live RLS here. Mark those **“please QA”** in `BUILD.txt` rather
   than claiming they're done. Don't over-caution about a dev build with no
   real patient data, though — I'll push back if you do.
6. **Update `HANDOVER.md`, `BUILD.txt`, and this `TRANSFER_PROMPT.md`** at the
   end of every delivery. `HANDOVER.md` is the living source of truth.

**How I work.** Short, precise directives — “go”, “confirmed”, “keep going”.
I want action without long preamble. Deliver in batches. I catch clinical /
anatomical errors, so get those right (sides, muscle names, etc.). When a
design debate runs long and I say **“move on”**, that means *keep building*,
not skip the work. Reusable audit/review prompts are welcome.

---

**Where we are** *(update each delivery)*
- **Latest build:** `simplify-cockpit-98` — mobile push **step 2** (web-app code, NO new deps, inert in browsers): `lib/nativePush.ts` + `NativePushRegistrar` register the device's FCM token via the `register_device_push_token` RPC when inside the native shell. Build 62/62. Drop changed files (no npm install); ensure migration 0102 is applied. Don't overwrite package.json/lock.
- **Just shipped:** mobile push **step 2** (cockpit-98) — the web app now registers each phone's FCM token after
  login, via `lib/nativePush.ts` + a `NativePushRegistrar` component. It reaches the Capacitor plugin through the
  injected `window.Capacitor` global, so the web app needs NO Capacitor dependency and stays inert in browsers
  (build 62/62, no package.json change). Deploys to Vercel by dropping the changed files. NEXT push steps:
  (3) add `@capacitor/push-notifications` to `mobile/` + wire Firebase `google-services.json` (Android) — needs the
  user's Firebase project + google-services.json (in progress); (4) extend `send-checkin-notifications` to push to
  native tokens via FCM. iOS push needs an Apple push key + Mac (deferred). Then: app icon/splash, store submission.
  App ID is `dk.mprc.treatmentcompanion`. Web deploy caveat still applies: changed-files only, never package.json/lock.


- **Epics complete:** goal-versioning; therapist-signals; handoff note (0088);
  audit remediation; EHR localisation; cockpit simplification batches 1–11.
  The original 11-item simplification list is complete (bar #4, parked).

- **Outstanding deploy (not in the zip->Vercel flow):** the rewritten
  `send-checkin-notifications` Edge Function (cockpit-57) still needs deploying via
  the Supabase Dashboard. Until then the reminder *day* is stored/shown but not yet
  honoured.

**What's likely next**
- **#4 muscle→function** (parked) — clinician-verifiable draft in `docs/`;
  needs Nikolaj's markup + the structured-catalogue decision.
- **Per-goal handoff note** (optional) — the note is per-cycle today; a true
  per-goal note needs a migration. Only if Nikolaj wants it.
- **Then:** adjustment-request status loop (migration); REDCap dictionary
  reconciliation + EHR-content reshaping (decisions for the study team/DPO).

**Your first reply:** confirm you've read `HANDOVER.md`, state the current build
+ migration in a line or two, and either wait for my “go” or ask the one thing
you need to start.
