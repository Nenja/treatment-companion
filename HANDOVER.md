# Treatment Companion — Engineering Handover

> **Purpose.** This is the single source of truth for picking up work on this
> project in a new chat/session. Read it first. It captures the app, the
> non-obvious build workflow, the data model, what's built, and what's pending.
>
> **Keep it current.** At the end of *every* delivery, update:
> §7 Latest delivered build, §6 Build history, §8 Pending, and §4/§5 if the
> schema, conventions, or a feature's state changed. Treat this as part of the
> deliverable, not an afterthought.
>
> _Last updated for build tag: `batch-a`._

---

## 1. What this is

A clinical web app for **botulinum-toxin treatment** (spasticity **and**
dystonia). It helps a clinician set patient-centred goals, capture treatment
sessions (incl. a face-injection map), and track weekly patient-reported
outcomes over a treatment cycle. The end user is a **clinician**; patients do
weekly check-ins.

- **Stack:** Next.js 15.1.9 (App Router) · React 19 · next-intl · Supabase
  (Postgres + Auth + Storage, RLS-enforced) · Tailwind **v4** (`@theme` in
  `app/globals.css`).
- **Bilingual:** English + Danish (`messages/en.json`, `messages/da.json`).
- **Status:** Dev build with **test data only — no real patients**. The
  regulatory/clinical-validation step is later and is **not** a current
  blocker. The user deploys by uploading the repo zip to GitHub → Vercel, and
  runs DB migrations by pasting SQL into the Supabase SQL editor.

---

## 2. Working environment & build workflow (CRITICAL — read fully)

The user gives us a **zip of the repo** (it is *not* a git repo). In the
working session it's extracted to:

```
/home/claude/work/repo/treatment-companion-main
```

### 2.1 The mandatory font-stub build (sandbox can't reach Google Fonts)

`next build` fetches `fonts.googleapis.com` for two `next/font/google` fonts in
`app/[locale]/layout.tsx` (Newsreader, Atkinson_Hyperlegible). The sandbox
blocks that host, so a real build **fails** unless you stub them first.

**Procedure for every build:**

1. Back up `app/[locale]/layout.tsx` to `/tmp/layout.tsx.orig` (already there in
   an ongoing session; **recreate from the current file if starting fresh** — the
   old `cfaf492…` snapshot that still contained `<BrandBar/>` is stale).
2. Stub: replace the `import { Newsreader, Atkinson_Hyperlegible } …` line with a
   comment, and replace each `Newsreader({…})` / `Atkinson_Hyperlegible({…})`
   call with `{ variable: '--font-newsreader' }` / `{ variable: '--font-atkinson' }`.
   Mark edits with `[BUILD-STUB]`.
3. The layout **no longer renders a global brand bar** (removed in `unified-header`);
   the brand now lives in each page header via `AppHeader` / `BrandMark` (§5.3).
   layout.tsx still contains only the two font calls to stub + `{children}`.
4. `rm -rf .next && NEXT_TELEMETRY_DISABLED=1 npx next build`
5. **Success = exit 0 and "✓ Generating static pages (58/58)".** (55 before
   the dev tools; +2 for `/dev/scenarios` in two locales, plus the API route.
   The no-auth `/demo` sandbox was removed in `batch-a`, dropping the count
   from 60 to 58.) The only
   expected warning is a Sentry/OpenTelemetry "critical dependency" message
   (unrelated, ignore).
6. **Restore** `app/[locale]/layout.tsx` from `/tmp/layout.tsx.orig`, then verify:
   - `sha256sum` of the restored file ==
     `6b5bb2fd1a13bd15c7b3f11f998450a80315c917f2c56eb776937be6f4714d67`
     (the post-`unified-header` layout, BrandBar removed; **was** `cfaf492…`).
   - **zero** `BUILD-STUB` remnants anywhere in `app components lib`.

`npx tsc --noEmit` is a fast pre-check before the full build.

### 2.2 Deliverable conventions

- **One clean repo zip per delivery**, with a **new descriptive filename**;
  remove the previous zip. Exclude `node_modules/`, `.next/`,
  `tsconfig.tsbuildinfo`, `.DS_Store`. Zip lives in `/mnt/user-data/outputs/`.
- Each zip contains a root **`BUILD.txt`**: build tag, change summary, deploy
  steps, and "how to confirm this build is deployed".
- Attach a **standalone `.sql`** in outputs **only when a migration is NEW**
  (the user runs it in the Supabase SQL editor). Don't re-attach unchanged
  migrations; they're still in the zip under `supabase/migrations/`.
- Note migration **run order** when it matters (e.g. a Storage bucket must
  exist before the code that writes to it).

### 2.3 Translation parity rule

Every user-facing string needs **en + da** parity. Verify after each change
with a recursive key-set diff of `messages/en.json` vs `messages/da.json`. The
**`da._meta`** block (reviewedBy/status) is intentionally English-only — ignore
it in the diff. The brand name **"Treatment Companion" is not localized**.

### 2.4 Honest constraints (state these to the user, don't pretend)

We **cannot**: see rendered output, test a camera/microphone or a real file
upload, or run against a live Supabase/with real auth. So **layout/visual,
RLS/security, and device/codec findings must be flagged for the user to verify**
on screen/device. Build + `tsc` only prove it compiles and the logic is sound.

---

## 3. Design system / tokens

Tailwind v4 `@theme` in `app/globals.css` exposes these as `--color-<name>` CSS
vars and `bg-<name>`/`text-<name>` utilities.

| token | hex |  | token | hex |
|---|---|---|---|---|
| cream | `#f6f1e8` | | sage-soft | `#dce6de` |
| cream-soft | `#fbf8f2` | | amber-soft | `#e8d5a0` |
| ink | `#1f2421` | | amber-deep | `#705619` |
| ink-soft | `#4b5450` | | stone | `#e5dfd3` |
| ink-muted | `#686d69` | | stone-soft | `#efeae0` |
| sage | `#5c7a6a` | | on-accent | `#fbf8f2` |
| sage-deep | `#3f5a4b` | | focus | `#2f5563` |

Width tokens: `--max-w-page-narrow` **480px**, `--max-w-page-mid` **720px**,
`--max-w-page-wide` **1080px**. Radii: `--radius-card` 1.25rem,
`--radius-button` 0.875rem. Headings use `font-display`.

---

## 4. Database (verified from migrations)

### 4.1 Identity & RLS

- `profile` (id = `auth.uid()`, role, email citext, …), `patient`
  (id, profile_id → profile), `clinician` (id, profile_id).
- RLS helpers in `0002_rls_policies.sql`:
  - `current_patient_id()` → the patient row for the current auth user.
  - `current_clinician_id()` → the clinician row for the current auth user.
  - `clinician_can_access_patient(p_patient_id)` → true if the clinician has an
    active (un-ended, < 1 hr) `clinician_session` for that patient.

### 4.2 Key tables / columns

- **`approved_goal`**: id, patient_id, treatment_cycle_id, patient_facing_text,
  smart_text, `goal_kind` (`'nrs'`|`'gas'`, default `'nrs'`), `goal_outcome`,
  NRS config (`nrs_question`, `nrs_direction`, `nrs_cut_low_low`, `nrs_cut_low`,
  `nrs_cut_zero`, `nrs_cut_high`), GAS anchors (`anchor_minus2`…`anchor_plus2`),
  status, **`video_enabled`** (0062).
  - **Check constraint `approved_goal_kind_fields`:** for `'nrs'` all NRS fields
    NOT NULL **and** all anchors NULL; for `'gas'` all 5 anchors NOT NULL **and**
    all NRS fields NULL. Honour this when inserting goals directly (e.g. seeds).
- **`weekly_checkin`**: id, weekly_prompt_id, patient_id, treatment_cycle_id,
  week_number, comment, submitter_label, **`training_days`** smallint[] (0063 = at-home days, ISO 1=Mon…7=Sun) and
  **`training_days_therapist`** smallint[] (0064 = days with a therapist). NULL
  = not reported; `{}` = reported none.
- **`weekly_goal_rating`**: id, weekly_checkin_id, approved_goal_id,
  rating_label (enum), `rating_value` (−2..2 GAS), `nrs_value` (0..10),
  **`video_path`** text (0062).
- `weekly_prompt` (id, treatment_cycle_id, patient_id, week_number, status
  `pending`/`completed`). `treatment_cycle`, `treatment_session`,
  `muscle_injection`, `goal_suggestion`, `physio_assessment`,
  `physio_goal_rating`, `audit_event`.

### 4.3 Enums

- `goal_domain`: `pain, hygiene, dressing, walking, transfers, handUse, sleep,
  positioning, caregiverHelp, therapyExercise, other` (note: **no `mobility`** —
  a past seed bug).
- `importance`: `low, medium, high`. `hoped_timeframe`: `4w, 8w, 12w, notSure`.
- `rating_label`: `muchWorseThanExpected, aLittleWorseThanExpected, asExpected,
  betterThanExpected, muchBetterThanExpected, notSure`
  (index map: GAS level −2→1 … +2→5).

### 4.4 RPCs (current)

- `create_goal_for_patient(p_patient_id, p_patient_facing_text, p_smart_text,
  p_nrs_question, p_nrs_direction, p_nrs_cut_low_low, p_nrs_cut_low,
  p_nrs_cut_zero, p_nrs_cut_high)` → uuid (NRS goal). Signature unchanged, but
  since `batch-a` the clinician no longer sets cut-offs — the hook sends fixed
  defaults `1/3/5/7` (option B; see §7).
- `create_gas_goal_for_patient(p_patient_id, p_patient_facing_text,
  p_smart_text, p_anchor_minus2 … p_anchor_plus2)` → uuid (GAS goal).
  Both return the new goal id.
- `approve_suggestion(p_suggestion_id, p_patient_facing_text, p_smart_text,
  p_nrs_question, p_nrs_direction, 4 cuts)` → uuid. Approves a patient
  suggestion as an **NRS** goal (sends default cuts since `batch-a`). Marks the
  suggestion `'active'` (the only sanctioned path to that status —
  `set_suggestion_status` forbids `'active'`).
- `approve_suggestion_gas(p_suggestion_id, p_patient_facing_text, p_smart_text,
  p_anchor_minus2 … p_anchor_plus2)` → uuid (**0067**, `batch-a`). Approves a
  suggestion as a **GAS** goal; mirrors `approve_suggestion` (same lookup /
  access check / status flip / audit) but inserts a GAS goal. Additive; does
  not touch the check-in path.
- `set_approved_goal_video_enabled(p_goal_id, p_enabled)` (0062, SECURITY
  DEFINER, checks `clinician_can_access_patient`). New-goal flow calls this
  after creating the goal, so the create RPCs didn't need changing.
- `submit_weekly_checkin_v4(p_prompt_id, p_ratings weekly_goal_rating_input_v4[],
  p_comment, p_submitter_label)` → uuid (0062). Input type
  `weekly_goal_rating_input_v4 = (approved_goal_id uuid, nrs_value int,
  gas_value int, video_path text)`. NRS ratings: server derives GAS via
  `nrs_to_gas(...)` and stores both `rating_value` (GAS) and `nrs_value`; GAS
  ratings store the picked level. `video_path` stored only for video-enabled
  goals. **v3 is left intact**; the app now calls v4.
- `set_checkin_training_days(p_checkin_id, p_days smallint[], p_days_therapist
  smallint[] default null)` (0063, extended in 0064 — home + therapist days;
  SECURITY DEFINER, owner-checked, validates 1..7). Called right after submit.
- `set_cycle_clinician_note(p_cycle_id, p_note)` (0065, SECURITY DEFINER,
  checks `clinician_can_access_patient`). Saves the per-cycle "since last
  visit" clinician note (`treatment_cycle.clinician_note`).
- Helpers: `nrs_to_gas(...)`, `gas_label(int)`.

### 4.5 Storage

- Private bucket **`goal-videos`** (created in 0062). Path convention
  `<patient_id>/<prompt_id>/<goal_id>.<ext>`.
- Policies mirror the app model: patient manages only their own folder
  (`(storage.foldername(name))[1] = current_patient_id()::text`); clinician
  read-only via `clinician_can_access_patient(((storage.foldername(name))[1])::uuid)`.

### 4.6 Migrations & what must be run

`supabase/migrations/` holds the numbered migrations (through **0067**) plus the
non-numbered seed `demo_seed_test_patients.sql`. Notable recent ones:

- `0061` medication rename (`current/previous_antispastic_medication` →
  `current/previous_medication`).
- `0062_goal_video.sql` — video columns, set-flag RPC, `submit_weekly_checkin_v4`
  + input type, **`goal-videos` bucket + RLS**. Run **before** deploying video code.
- `0063_training_days.sql` — `weekly_checkin.training_days` +
  `set_checkin_training_days`.
- `0064_training_with_therapist.sql` — `weekly_checkin.training_days_therapist`
  + extends the setter to take both arrays.
- `0065_cycle_clinician_note.sql` — `treatment_cycle.clinician_note` +
  `set_cycle_clinician_note`.
- `0066_dev_seed_functions.sql` — DEV-ONLY. Wraps the seed blocks into
  `dev_seed_b1..b8()` + `dev_reseed_all()` for one-click reseed.
- `0067_approve_suggestion_gas.sql` — **`batch-a`, RUN THIS.** Additive RPC
  `approve_suggestion_gas` so a clinician can approve a suggestion as a GAS
  goal. `create or replace`, no schema change, safe to re-run.

> If unsure whether the user's DB is current, confirm 0062–0067 are applied (0066 is dev-only; **0067 is required for the new GAS suggestion-approval**).

---

## 5. Features & current state

### 5.1 Face module — `components/clinician/FaceMap.tsx`
Injection-site map. Reverted per clinician to: original DOSE_COLORS
`['#a9c2b3','#6f9482','#3f5a4b','#2a3f33','#16201a']`; **no** printed dose
numbers on marks (on-screen and in export); symbol-mode backing `fillOpacity
0.75` no stroke; **no** "+ Add a mark" button; persistent tap hint; finishing
actions (copy/clear/download) grouped under a divider; copy-to-other-side is
once-only; two-step "Clear marks" confirm; export PNG date-stamped + caption;
editor popover is `role=dialog aria-modal` with focus trap + Escape;
`aria-pressed` on toggles. Export is clinician-only; `exportLabel` = patient
display name. Pilot face-model toggle visible.

### 5.2 Treatment page — `app/[locale]/clinician/treatment/page.tsx`
Single column capped at **mid (720px)**. "Treatment areas" selector and "Last
treatment" card sit side by side above the form. Area labels: "Body and
neck"/"Krop og nakke" and "Face"/"Ansigt".

### 5.3 Page header — `components/layout/AppHeader.tsx` + `BrandMark.tsx`
**One unified header per page** (the `unified-header` build). A single row:
brand on the **left**, optional `back` / `middle` (title or patient name) /
`actions` slots, and **help + account always hard right**. Because the row always
has a left (brand) and a right (controls) group, the account menu can never drift
left and the brand always shares the line with the controls — fixing both prior
complaints (account-on-left; "Treatment Companion" on a separate strip that looked
empty when the page header was sparse).

- `BrandMark.tsx` — the sage double-chevron mark + optional "Treatment Companion"
  wordmark (`useTranslations('app').t('name')`, same key the old BrandBar used, so
  the displayed text is unchanged — note `app.name` is localized: da =
  "Behandlingsledsager"). Props: `showName` (default true) + `nameClassName`.
- `AppHeader.tsx` — props: `width` (`narrow|mid|wide|narrowToMid|narrowToWide`) or
  `maxWidthClass` override (e.g. admin's `max-w-[640px]`); `back?:{label,onClick}`
  (renders `← label`, label hidden on the smallest screens); `middle?` (flex-1
  truncating slot — page titles get `eyebrow block truncate text-center`, the
  patient-name link stays left-aligned); `actions?` (e.g. `<EndSessionButton/>`);
  `helpPageKey?` (renders `PageHelpButton`); `showAccount` (default true);
  `brandName` (`auto` default → wordmark shown only when the row is otherwise empty,
  else mark-only with the wordmark returning on `lg`). The inner row width **matches
  the page `<main>`**, so the brand lines up with the content column with no JS — the
  old BrandBar's `ResizeObserver` measuring hack is **gone**.

**Removed:** the global `<BrandBar/>` (was rendered once in layout.tsx) and
`TopBar.tsx` (account/help-only bar) — both deleted, fully superseded by AppHeader.

**Rollout:** `AppShell` renders `<AppHeader>` (so patient home + patient-info get it
automatically). Nine single-row pages use `<AppHeader>` directly (clinician
landing/admin/history/treatment/new-goal/suggestion, physio landing/progress,
visit-code). The two **two-row** patient headers (`clinician/patient`,
`physio/patient`) keep their name + clinical-summary layout and just get
`<BrandMark showName={false}/>` (chevron) prepended on the left. The **check-in
wizard** (`WizardLayout.tsx`) gained a top brand + help/account row, with the
cancel/save + "step X of Y" row beneath it and the progress bars unchanged.
**Visual QA still needed** (can't render here): the busy clinician working pages on
**mobile** (brand + back + end-session + help + account in one row).

### 5.4 Goals & graphs — `components/clinician/GoalProgressView.tsx`
**NRS goals render on a 0–10 NRS chart; GAS goals on the −2..+2 banded chart.**
The component takes `kind?: 'nrs' | 'gas'` (default `'gas'`). It plots `nrs` for
NRS goals and `value` (GAS) for GAS goals via a `plotVal` accessor; the y-scale,
background (NRS = gridlines at 0/5/10; GAS = 5 directional bands), axis labels,
missing-marker position, and tap-caption all switch on `kind`. The data
(`weekly_goal_rating`) already carries both values, so this is display-only.
`kind` is threaded through call sites: clinician patient page, physio patient
page, and `GoalGraphModal` (the tap-to-expand view). `OnboardingWizard` stays
GAS (the default). Physio patient query now also selects `goal_kind`.

**NRS direction cue (`nrs-graph-direction`):** the NRS chart now shows which way
is clinically better — previously it always put 10 at the top with no colour or
label, so a *lower-is-better* goal (pain, spasm counts) read upside-down (an
improving downward line looked like a decline — the same trap fixed on the
"Since last visit" chip). `GoalProgressView`/`GoalGraphModal` take an optional
`nrsDirection?: 'higherIsBetter' | 'lowerIsBetter'`; when set, the chart tints the
**good half** with a soft sage gradient (fading from the good extreme to the
midline, so it implies direction, not a pass mark) and prints a small
`↑ better` / `↓ better` cue at the good end of the y-axis (string
`treatment.axisBetter`), plus appends the direction to the SVG `aria-label`. The
direction is threaded from existing goal data: `g.nrs?.direction` (clinician),
`g.nrsDirection` (physio), `g.direction` (demo), and a newly-selected
`nrs_direction` on the patient-home goal (`patientHome.ts`); the onboarding NRS
sample passes `higherIsBetter`. GAS charts ignore the prop (their sage/amber bands
already encode direction). Gradient uses a `useId()`-suffixed id so multiple charts
on a page don't collide. Display-only; no DB/RPC/migration change.

### 5.5 Goal video (optional patient video)
- **Capture pipeline DELIVERED.** Clinician enables video per goal (toggle on
  the new-goal form → `set_approved_goal_video_enabled`). At check-in, for a
  video-enabled goal, the recorder is offered at **any week 6/7/8 check-in but
  only once per cycle** (gated in `app/[locale]/checkin/page.tsx`:
  `videoEnabled && [6,7,8].includes(weekNumber) && !videoAlreadyInCycle`; the
  "already this cycle" check is in `lib/supabase/checkin.ts`). Flow: explicit
  consent each time → camera → record (auto-stop 30s) → preview → keep/re-record
  → upload on submit. Component `components/wizard/GoalVideoRecorder.tsx`
  (detects iOS mp4 vs Chrome/Android webm). Upload is **non-fatal** (video is
  optional); a partial-failure toast is shown.
- **PENDING: clinician playback** (signed-URL `<video>` on the goal/check-in
  view). Agreed as the next slice once capture is confirmed on a real device.
- **Untested by us:** camera/record/30s-autostop/upload, iOS vs Android codecs,
  files landing in `goal-videos`. Needs the user to test on devices.

### 5.6 Training days (home + with therapist)
- **Patient capture DELIVERED.** A check-in wizard step (after goal ratings,
  before the comment step): "Which days did you train this week?" with **two**
  Mon–Sun multi-selects — **"At home"** and **"With a therapist"** (each
  optional; empty = none). Component `components/wizard/TrainingDaysPicker.tsx`
  (rendered twice). Saved in the resumable draft (`trainingDays` = home,
  `trainingDaysTherapist`); written via `set_checkin_training_days` after submit
  (best-effort, both arrays).
- **Clinician overview DELIVERED.** `components/clinician/TrainingOverview.tsx`
  — a **collapsible** "Training" card at the top of the active-cycle goals
  section, **active cycle only**. The header (always visible) carries the
  summary "home X/wk · therapist N×" and a chevron toggle (`aria-expanded`).
  **Collapsed by default.** The body is a week × day grid: **filled sage cell = home** that day, **amber
  ring = with-therapist** that day (a cell can be both). Current week marked;
  weeks beyond current faded. Reads both arrays (built into `trainingByWeek` =
  `Map<week, {home, therapist}>` on the patient page). Shown once ≥1 check-in.
- **PENDING (offered, not built):** tap-a-week to reveal exact days/count;
  past-cycle view in the history page; a prescribed-frequency target to shade
  against (would need a new "days/week" field at goal/cycle setup).

### 5.7 UX/accessibility audits — `docs/audits/`
Six face-module lens docs, a sample patient-page six-lens doc, and an
**onboarding/intro-wizards audit** (`docs/audits/onboarding-and-intro-wizards-audit.md`)
are written. The onboarding audit’s copy fixes are now **implemented** (build
`onboarding-content-fixes`): the graph tour shows both NRS and GAS live
charts, and the tour + Help now cover GAS goals, the optional video, training
days, and the visit note. A *forced* re-show of the tour to existing users
remains optional (would need an onboarding-version field). The
**6 app-wide per-lens docs (clinician + patient + physio pages)** are approved
but **not yet written**. Style: issue → why → specific fix, severity-ranked,
measured where possible, `[verified-in-code]` vs `[needs-on-screen-check]` tags.
Known still-open a11y items: FaceMap dose-by-colour can't reach WCAG 3:1 across
5 bands; no keyboard-only mark creation — both **accepted by the clinician**.

### 5.9 Dev scenario launcher (test environment)
**DELIVERED (dev-only).** A `/dev/scenarios` page that resets the demo data
(optional), signs you in as the right account, opens the clinician session
where needed, and lands you on the screen — no visit codes, minimal clicking.
Pieces: `lib/dev/scenarios.ts` (the catalog), `app/[locale]/dev/scenarios/page.tsx`
(the launcher UI), `app/api/dev/scenario/route.ts` (service-role route: reseed
+ `auth.admin.generateLink` to mint a sign-in token + a reusable `visit_code`
for professional scenarios), and migration `0066` (`dev_reseed_all`). The
client calls `verifyOtp` with the token, then `unlock_with_visit_code` for
clinician/physio scenarios. **Gating (must stay off in prod):**
`NEXT_PUBLIC_ENABLE_DEV_TOOLS=1` shows the page; `ENABLE_DEV_TOOLS=1` lets the
route run; both 404/disable otherwise. Needs `SUPABASE_SERVICE_ROLE_KEY` (the
admin features already use it). **Unverified by me** — I can’t exercise auth or
a live Supabase; the sign-in/session/seed flow needs on-machine testing.

### 5.10 No-auth demo sandbox — REMOVED (`batch-a`)
**DELETED** per request. The `/demo` page (`app/[locale]/demo/`) and its
fixtures were removed in `batch-a`. It was a no-login sandbox rendering the real
presentational components from made-up fixtures; it's gone now, dropping the
build page count 60 → 58. (Historical note: it was gated by
`NEXT_PUBLIC_ENABLE_DEMO=1` and used `lib/demo/fixtures.ts`.) If a public demo
is ever wanted again, recreate from git history.

### 5.8 "Since last visit" — auto-generated change list
`components/clinician/VisitChanges.tsx` — a **read-only, computed** card on the
patient page (just above the active-goals section). It summarises what changed
since the patient was last seen; nothing is editable. **Anchor:** the most recent
treatment for the cycle (`treatment.date`); if no treatment is recorded yet it
falls back to the cycle start date and says so. It lists check-ins submitted
since the anchor (filtered by `weekly_checkin.submitted_at`) with:
- **Goal verdict (the headline)** — one row per goal: the goal name, the **current
  value** (NRS `7/10`; GAS the descriptive level e.g. *As expected*), and a
  plain-language **verdict chip**: `↑ improved` / `↓ declined` / `→ no change`,
  where **up + green always means clinically better** regardless of whether the
  goal is higher- or lower-is-better (NRS uses the goal's `nrs_direction`; GAS is
  higher-is-better). Colours: sage = improved, amber = declined, neutral = flat;
  the arrow is decorative (the word carries the meaning). **No trend line and no
  raw "from N"** — both were removed because, for a lower-is-better goal (e.g.
  "fewer night-time leg spasms", 9→3), a raw sparkline slopes *down* and "from 9"
  reads like a decline even though the patient improved, which clinicians found
  confusing. Now only the current value (one number) and the verdict word are
  shown, so direction can't be misread. Archived goals with ratings in the window
  still appear, tagged "· archived".
- **Header + adherence** — a check-in count top-right (`5 check-ins`) and an
  adherence clause in the subline: `· checked in every week`, or `· missed week(s) N`
  (gaps detected between the first and last week present, so the current pending
  week is never flagged as missed).
- **Compact stat strip** (bottom) — home-exercise days with a cadence (`Home 14 days
  · ~3×/wk`), therapist sessions (`Therapist 2×`), and a video count when present.
  Falls back to "No training logged".

Data: `useClinicianPatientData` selects `weekly_checkin.submitted_at` and each
rating's `video_path` (on `ClinicianPatientCheckin`). The page passes
`treatment?.date`, `cycle.startDate`, `checkins`, and `[...activeGoals,
...archivedGoals]`. i18n namespace **`visitChanges`** (en+da, 22 keys, incl. GAS
level labels + ICU plurals incl. a nested-arg `missedWeeks`). **This replaced the
old free-text note** — the `treatment_cycle.clinician_note` column +
`set_cycle_clinician_note` RPC / `useSetCycleClinicianNote` hook remain in place but
are now **unused** (kept so the change is reversible / non-destructive; the old
`visitNote` i18n namespace is also
left in but unused).

---

### 5.11 Patient home — read-only goal graph pop-up — `app/[locale]/page.tsx`

The patient home (`app/[locale]/page.tsx`, namespace `patient.home`) lists active
goals as text-only `GoalCard`s. Each card now shows a small **graph button on the
right** (chart glyph; label "View graph"/"Se graf" shown from the `sm` breakpoint
up, icon-only with `aria-label`/`title` on mobile). Tapping it opens the goal's
progress graph in a **read-only pop-up** — the existing `GoalGraphModal`
(`components/clinician/GoalGraphModal.tsx`) reused as-is, with `physioRatings={[]}`
so the patient sees **only their own self-report** (no physiotherapist overlay) and
no edit affordances. Nothing is shown until the patient actively taps the button.

Data: `usePatientHomeData` (`lib/supabase/patientHome.ts`) was extended to (a) select
`approved_goal.goal_kind`, and (b) load the patient's own check-in history for the
active cycle (`weekly_checkin` + `weekly_goal_rating`, scoped by RLS
`weekly_checkin_patient_read` / `weekly_goal_rating_patient_read`) and group it into
a per-goal `GoalRatingPoint[]` (a new exported type, structurally identical to
`GoalProgressView`'s `ratings` prop: `weekNumber`, `value` −2..2|null, `nrs` 0–10|null,
`reported`, optional `comment`/`submitterLabel`). Each `PatientHomeData.goals[]` entry
now carries `kind` + `ratings`; the graph's x-axis uses `data.currentWeek`. No DB or
RPC change. i18n: `patient.home.viewGraph` + `patient.home.graphClose` (en+da).
`GoalCard` gained optional `onViewGraph` + `viewGraphLabel` props (omitted → text-only
as before, so other callers are unaffected).

**Treated-muscles pop-up (same page).** Below the goals' quiet action row (show visit
code / suggest a goal), a full-width **"See which muscles were treated"** button
appears **only when a treatment is on record** (`data.latestTreatment`). It opens
`components/cards/TreatedMusclesModal.tsx` — a read-only pop-up listing the muscles
injected at the patient's most recent treatment, grouped per muscle with sides
combined (reuses the shared `groupTreatedMuscles` from `lib/types.ts`, same helper as
the clinician/physio views) and headed by the treatment date. **Dosing and product
detail are deliberately omitted** — just muscle + side. `usePatientHomeData` now also
loads `latestTreatment: { date, muscles: { muscle, side }[] } | null` (most recent
`treatment_session` for the patient + its `muscle_injection` rows, ordered by
`position`; RLS `treatment_session_patient_read` / `muscle_injection_select` already
permit the patient to read their own rows). **Unlike the physiotherapist view there is
no `share_muscles_with_physio` gate** — the patient may always see their own treatment.
i18n added under `patient.home`: `viewTreatedMuscles`, `treatedMusclesTitle`,
`treatedMusclesFrom` ({date}), `treatedMusclesNone`, and side labels
`treatedSide{Left,Right,LeftRight,Both}` (close reuses `graphClose`); Danish reuses the
physio view's existing wording.

**Still requested for the patient home (NOT yet built):** the original ask also wanted
a button showing **medication / assistive devices**. That data exists
(`current/previous_antispastic_medication` + `physio_assistive_devices`) but is **not
loaded by `usePatientHomeData`**, and — importantly — patient RLS read access to the
medication columns must be verified before surfacing them on the patient side
(medication was originally scoped clinician-to-therapist). See §8.

---

## 6. Build history (tags, oldest → newest)

`copy-to-other-side` → `trim-header-and-meds` → `meds-to-actionrow` →
`panel-and-title-fixes` → `medication-rename` (0061) → `face-model-toggle` →
`facemap-copy-clear` → `facemap-a11y-fixes` → `clinician-answers` →
`facemap-revert-and-global-brand` → `brand-follows-page-width` →
`brand-pixel-aligned` → `goal-video-capture` (0062) →
`nrs-graphs-and-week6-video` → `nrs-graphs-and-video-6to8` →
`brandbar-compact-and-test-seed` → `checkin-training-days` (0063) →
`clinician-training-overview` → `training-home-vs-therapist` (0064) →
`visit-note-and-collapse-default` (0065) →
`checkin-cancel-and-onboarding-audit` →
`onboarding-content-fixes` → `dev-scenario-launcher` (0066) →
`demo-sandbox` →
`checkin-hooks-order-fix` →
`since-last-visit-change-list` →
`checkin-leave-button-fix` →
`test1-video-on-current-checkin` →
`visit-changes-usability` →
`visit-changes-direction-fix` →
`patient-home-goal-graph` →
`patient-home-treated-muscles` →
`unified-header` →
`nrs-graph-direction` →
**`batch-a`** (0067; NRS cut-off UI dropped, suggestion-approval gained a
GAS option, `/demo` deleted, `clinician/patient` forced dynamic — current).

---

## 7. Latest delivered build

- **Zip:** `treatment-companion-batch-a.zip`
- **Tag:** `batch-a`
- **Change:** three things, all from the page-by-page review.
  1. **NRS goals no longer show GAS cut-offs** in setup. The clinician now
     configures an NRS goal with just the 0–10 question + direction; there is
     no cut-off UI. Done as **option B (UI-only)**: the schema still requires
     four cut-offs and the check-in RPC still derives an (unused) GAS bucket
     from them, so rather than rewrite the critical check-in path, the hooks
     now send fixed default cut-offs (`1/3/5/7`) behind the scenes. The graph
     and the "since last visit" verdict already read the raw 0–10 + direction,
     so the derived GAS stays the unused byproduct it already was. Cut-off
     columns retain default data; **no schema/check-in change.**
  2. **Suggestion-approval can now create a GAS goal**, not only NRS. The
     approve form gained a measurement-model toggle + five anchor inputs
     (reusing new-goal's GAS strings; 3 new toggle keys, parity verified).
     Backed by a new **additive RPC `approve_suggestion_gas` (migration 0067)**
     mirroring `approve_suggestion` but inserting a GAS goal — needed because
     `set_suggestion_status` forbids setting `'active'`. Does not touch the
     check-in path.
  3. **`/demo` deleted** (no-auth sandbox, per request); orphaned
     `components/clinician/GasCutPoints.tsx` removed.
- **Build-blocker fixed (pre-existing, unrelated to the above):** statically
  prerendering `clinician/patient` tripped a Next 15 RSC client-manifest
  bundler error (`page.tsx#default` not in manifest). Confirmed Batch A is
  innocent — that page imports nothing this batch changed, and the build is
  clean 58/58 with the page stubbed. Fixed by adding
  `app/[locale]/clinician/patient/layout.tsx` with `export const dynamic =
  'force-dynamic'`, which skips SSG for this one auth-gated, session-only
  route (its prerendered shell was empty anyway) and matches its real
  runtime behaviour. No other route affected.
- **Files:** `lib/supabase/clinicianPatient.ts`,
  `app/[locale]/clinician/{new-goal,suggestion}/page.tsx`,
  `app/[locale]/clinician/patient/layout.tsx` (new),
  `supabase/migrations/0067_approve_suggestion_gas.sql` (new),
  `messages/{en,da}.json`; deleted `app/[locale]/demo/` +
  `components/clinician/GasCutPoints.tsx`.
- **DB needed:** run **migration 0067** (additive function; safe, idempotent
  via `create or replace`). Nothing else; no env changes. Migrations now
  through **0067**.
- **⚠ QA (can't test here):** (a) approve a suggestion as a **GAS** goal
  end-to-end after running 0067; (b) create an **NRS** goal from both
  new-goal and suggestion now that the cut-off UI is gone — confirm it saves
  and the patient check-in + graph work; (c) confirm `clinician/patient`
  loads on Vercel with the new `force-dynamic` segment.

---

## 7b. Previous delivered build

- **Zip:** `treatment-companion-nrs-graph-direction.zip` · **Tag:** `nrs-graph-direction`
- **Change:** made the **NRS progress graph show which way is positive** (§5.4).
  The chart always drew 0 at the bottom / 10 at the top with no colour or label, so
  *lower-is-better* goals (pain, spasm frequency) read upside-down. Now, given the
  goal's direction, the chart tints the **good half** with a soft sage gradient and
  shows a small `↑ better` / `↓ better` cue at the good end of the y-axis (and in the
  SVG `aria-label`). `GoalProgressView` + `GoalGraphModal` gained an optional
  `nrsDirection` prop, threaded from existing goal data on the clinician, physio,
  demo, and onboarding charts, plus a newly-selected `nrs_direction` on the
  patient-home goal. GAS charts are unchanged (their bands already encode direction).
  One new string `treatment.axisBetter` (en "better" / da "bedre"); en/da parity
  verified. Files: `components/clinician/{GoalProgressView,GoalGraphModal}.tsx`,
  `lib/supabase/patientHome.ts`, `app/[locale]/{page,clinician/patient,physio/patient,
  demo}/page.tsx`, `components/feedback/OnboardingWizard.tsx`, `messages/{en,da}.json`.
  **No DB / RPC / migration change.**
- **⚠ Visual QA (can't render here):** open an NRS goal graph for a **lower-is-better**
  goal (clinician view, the enlarged modal, and the patient-home pop-up) and confirm
  the sage tint sits on the bottom half with `↓ better` at the bottom; for a
  higher-is-better goal the tint/label sit at the top. Check the small label doesn't
  collide with a week-1 data point at the extreme.
- **Still on the original request (NOT built):** patient-home button for **medication /
  assistive devices** — data exists but isn't loaded on the home page, and patient RLS
  read access to medication must be confirmed first — see §8.
- **DB needed:** unchanged — migrations through **0066**. No new migration, no env
  changes.

---

## 8. Pending / next slices

1. **Clinician video playback** (signed-URL `<video>`) — §5.5. Next after device test.
2. **On-device video testing** — capture/upload/codecs/Storage — by the user.
3. **Training overview follow-ups** — tap-a-week caption, history (past cycles),
   prescribed-frequency target — §5.6.
4. **6 app-wide per-lens audit docs** — approved, unwritten — §5.7.
5. **(DONE in `onboarding-content-fixes`)** Onboarding/help content fixes from
   the audit. Optional leftover: a *forced* re-show of the updated tour to
   existing users (needs an onboarding-version field; Help already carries it).
   The **dev-only scenario/test launcher** is now built (§5.9) — remaining:
   verify its auth/session/seed flow on a real machine (I couldn’t test it).
6. **Confirm migrations 0062–0065 are applied** in the user's Supabase.

---

## 9. Test accounts & seed

Six demo patients: **`test1@example.com` … `test6@example.com`** (the auth
users/profiles already exist; the seed looks them up by email). Re-seed by
running **`supabase/migrations/demo_seed_test_patients.sql`** in the Supabase
SQL editor — it's idempotent (each patient block wipes & rebuilds). Prereqs: the
six accounts exist and ≥1 `clinician` row exists.

Scenarios: test1 going-well, test2 struggling, test3 pending suggestions, test4
missed check-ins, test5 late cycle / re-treatment due, test6 longitudinal (3
done + 1 active cycle). **Feature coverage added to test1** (appended block in
the seed): a GAS goal with history (exercises the GAS chart alongside test1's
NRS goals) + **video enabled** on test1's hand goal. test1's cycle now starts
**5 weeks ago** (was 8) and completes **weeks 1–5**, so its **current (pending)
check-in is week 6** — inside the 6–8 optional-video window. This means the video
recorder shows on the *current* check-in (not on an overdue catch-up week). The
window holds for ~3 weeks (current week walks 6→7→8) before drifting; re-seed to
reset. This week change lives in seed block 1 **and** `0066`'s `dev_seed_b1()`
(kept in sync). _Note: a past seed bug used an invalid `goal_domain` `'mobility'`;
valid values are in §4.3._

---

## 10. Key files map

```
app/[locale]/layout.tsx                      root layout (FONT STUB target; no brand bar — brand is per-header now)
app/[locale]/checkin/page.tsx                patient check-in wizard (ratings, video, training step)
app/[locale]/clinician/patient/page.tsx      clinician patient view (graphs, training overview, suggestions)
app/[locale]/clinician/new-goal/page.tsx     create NRS/GAS goal + video toggle
app/[locale]/clinician/treatment/page.tsx    treatment session + FaceMap
app/[locale]/physio/patient/page.tsx         physiotherapist patient view

components/clinician/FaceMap.tsx             injection-site map (clinician-only export)
components/clinician/GoalProgressView.tsx    per-goal chart (kind-aware: NRS 0–10 / GAS −2..2)
components/clinician/GoalGraphModal.tsx      enlarged chart (forwards kind)
components/clinician/TrainingOverview.tsx    collapsible "Training" grid (home + therapist)
components/clinician/VisitChanges.tsx       auto "since last visit" change list (read-only, computed)
components/wizard/GoalRatingPicker.tsx       NRS 0–10 picker
components/wizard/GasGoalRatingPicker.tsx    GAS level picker
components/wizard/GoalVideoRecorder.tsx      consent + camera + 30s record + preview
components/wizard/TrainingDaysPicker.tsx     Mon–Sun multi-select (used for home + therapist)
components/layout/AppHeader.tsx              unified page header (brand left; back/title/actions; help+account right)
components/layout/BrandMark.tsx              sage chevron mark + optional "Treatment Companion" wordmark
components/layout/AppShell.tsx               wraps pages that don't render their own <main> (renders AppHeader)

lib/supabase/checkin.ts                      check-in data + submit v4 + uploadGoalVideo + training write
lib/supabase/clinicianPatient.ts            clinician patient data + goal-create/video hooks
lib/supabase/physioPatient.ts               physio patient data
lib/checkinDraft.ts                          persisted draft shape (ratings, trainingDays, comment)
lib/useCheckinDraft.ts                       draft hook

messages/en.json, messages/da.json           i18n (keep parity; da._meta is en-only)
supabase/migrations/                         numbered migrations + demo_seed_test_patients.sql
docs/audits/                                 UX/accessibility audit docs
```
