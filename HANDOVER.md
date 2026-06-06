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
> _Last updated for build tag: `audit-followups`._

---

## 1. What this is

A **communication tool across the care triangle** — patient/caregiver, the
weekly therapist (the **physiotherapist** role), and the treating clinic (the
**clinician** role). Its main function is to **make all relevant data available
to the clinic when planning treatment**, so treatment quality improves.

Between visits, the patient (or a caregiver on the patient's device) and the
weekly therapist feed data in: patient-reported weekly outcomes against
patient-centred goals, optional check-in videos, therapist assessments, and
(newer) third-party / wearable data. The clinic reviews it all in one place —
the consolidated "since last visit" review — **discusses goals with the
patient, and plans the next treatment** (capturing the session, incl. a
face-injection map). Treatment today is **botulinum toxin** (spasticity **and**
dystonia), but the model is being generalised toward other modalities
(baclofen pumps, surgery) — see §6 / §8.

- **Stack:** Next.js 15.1.9 (App Router) · React 19 · next-intl · Supabase
  (Postgres + Auth + Storage, RLS-enforced) · Tailwind **v4** (`@theme` in
  `app/globals.css`).
- **Bilingual:** English + Danish (`messages/en.json`, `messages/da.json`).
- **Status:** Dev build with **test data only — no real patients**. The
  regulatory/clinical-validation step is later and is **not** a current
  blocker. The user deploys by uploading the repo zip to GitHub → Vercel, and
  runs DB migrations by pasting SQL into the Supabase SQL editor.

**Scope boundaries (decided — keep future work anchored here):**
- **Direction is primarily upward** (patient/therapist → clinic), plus the
  clinic's goal discussion with the patient — which is handled by the existing
  goal **suggestion → clinician-approval → shared-goal** flow. There is **no**
  clinic→patient messaging / feedback channel, and that is intentional; don't
  build one.
- **Caregivers use the patient's own device/login.** The per-check-in
  *self / caregiver* submission label records who entered it. There are **no
  separate caregiver accounts** — proxy access is out of scope.
- **The clinic's consolidated review-and-plan view is the product's centre of
  gravity.** Everything else exists to make that view complete and trustworthy
  at the visit.
- **The app *informs* decisions; the clinician decides.** This is the safer
  side of the medical-device (MDR) line: AI / wearable signals must inform the
  clinic's planning, never automate the decision (auto-titration / triage would
  change the classification).

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

`supabase/migrations/` holds the numbered migrations (through **0082**) plus the
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
- `0068_read_aloud_pref.sql` — Adds `profile.read_aloud boolean default false`
  (the read-aloud opt-in).
- `0069_wearable_observations.sql` — Adds the vendor-neutral `observation`
  table (FHIR-aligned PGHD store) + the `import_observations(patient, jsonb[])`
  security-definer RPC + RLS. Storage + import only.
- `0070_treatment_modality.sql` — Adds the `treatment_modality` enum +
  `treatment_cycle.modality` column (default `botulinum_toxin`). WP4 readiness
  seam; no clinical logic branches on it yet.
- `0071_goal_video_protocol.sql` — Adds
  `approved_goal.video_task_instruction/setup/seconds` + the
  `set_goal_video_protocol` RPC. The standardized task recipe shown at video
  capture so a rotating informant films the same task each week.
- `0072_clinic_video_score.sql` — **`clinic-video-scoring`, RUN THIS.** Adds
  `weekly_goal_rating.clinic_video_rating/unusable/scored_by/scored_at` + the
  `set_clinic_video_score` RPC. The clinic's GAS-level score of each
  standardized video — the authoritative one-rater outcome.
- `0073_session_switching.sql` — **`session-switching`, RUN THIS.** Lets a
  clinician hold several patients open + switch without re-coding + reopen
  today's without a new code. Consent gate unchanged; relaxes the
  one-active-session index to per-(clinician,patient), adds patient-scoped
  touch/end + `reopen_session` + `list_my_sessions`.
- `0074_nrs_baseline_target.sql` — **`nrs-baseline-target`, RUN THIS.** Adds
  `approved_goal.nrs_baseline_value` + `nrs_target_value` (0–10, nullable) and
  extends `create_goal_for_patient` with the two values (old 9-arg signature
  dropped).
- `0075_baseline_video.sql` — **`baseline-video`, RUN THIS.** Adds
  `approved_goal.baseline_video_path` + `set_goal_baseline_video` RPC + two
  storage policies letting a clinician write `<patient_id>/baseline/...` clips
  for a patient they can access.
- `0076_clinic_video_nrs.sql` — **`video-score-queue`, RUN THIS.** Adds
  `weekly_goal_rating.clinic_video_nrs` (0–10) + `set_clinic_video_nrs` RPC
  (NRS clips scored on the patient's 0–10 axis; GAS stays on −2..+2).
- `0077_wearable_enabled.sql` — **`training-row-wearable-module`, RUN THIS.**
  Adds `patient.wearable_enabled` + `set_patient_wearable_enabled` RPC; gates
  the patient-page wearable module.
- `0078_nav_style.sql` — **`side-menu-option`, RUN THIS.** Adds
  `profile.nav_style` (top|side) for the patient-page menu placement.
- `0079_itb_therapy.sql` — **`itb-therapy-track`, RUN THIS.** Adds
  `itb_therapy` + `itb_dose_change` (+ RLS) and `start_itb_therapy` /
  `log_itb_dose_change` RPCs — ITB as a parallel therapy, separate from
  treatment_cycle.
- `0080_goal_therapy.sql` — **`itb-goals`, RUN THIS.** Adds
  `approved_goal.therapy` (bont|itb) + `set_goal_therapy` RPC; ITB goals ride
  the active cycle and are grouped by this tag.
- `0081_cycle_agnostic_suggestions.sql` — **`pre-visit-suggestions`, RUN
  THIS.** patient row on patient signup (+ backfill); `goal_suggestion` cycle
  nullable; `approve_suggestion`/`approve_suggestion_gas` resolve the active
  cycle at approval.
- `0082_reopen_checkin.sql` — **`checkin-undo`, RUN THIS.** `reopen_weekly_checkin`
  lets a patient undo their own check-in within 24h (refused once a clinician
  has scored a clip).
  `add column if not exists`, safe to re-run.

> If unsure whether the user's DB is current, confirm 0062–0082 are applied (0066 is dev-only; **0067** GAS suggestion-approval, **0068** read-aloud, **0069** wearable ingestion, **0070** treatment-modality, **0071** video task protocol, **0072** clinic video score, **0073** session switching, **0074** NRS baseline/target, **0075** baseline video, **0076** clinic video NRS, **0077** wearable enabled, **0078** nav style, **0079** ITB therapy, **0080** goal therapy tag, **0081** cycle-agnostic suggestions, **0082** check-in undo).

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
GAS option, `/demo` deleted, `clinician/patient` forced dynamic) →
**`batch-b`** (localization sweep — no new migration) →
**`batch-c`** (minor polish — no new migration) →
**`read-aloud`** (0068; read-aloud / text-to-speech accessibility opt-in) →
**`mandatory-setup`** (no new migration; first-run setup made mandatory via
`SetupGate`, read-aloud added to the wizard's accessibility step) →
**`wearable-scaffold`** (0069; vendor-neutral wearable/PGHD ingestion layer —
`observation` table + `import_observations` RPC + clinician import tool) →
**`treatment-modality-seam`** (0070; WP4 futureproofing — `treatment_modality`
enum + `treatment_cycle.modality` column defaulting to botulinum toxin; additive,
BoNT flow unchanged) →
**`video-playback`** (no migration; clinicians can play back patient check-in
videos via signed URLs — reuses the 0062 `goal-videos` bucket) →
**`guided-capture`** (0071; standardized video task protocol + guided capture
— same task every week for rotating informants) →
**`clinic-video-scoring`** (0072; clinic scores each standardized clip on GAS
levels — the authoritative one-rater outcome series, + unusable mark) →
**`clinic-trend-chart`** (no migration; charts the clinic-scored series as its
own "Clinic video assessment" GAS trend under each goal) →
**`edit-video-protocol`** (no migration; video request + task protocol now
editable on an existing goal, not just at creation) →
**`patient-banner`** (no migration; always-visible patient banner + wearable
trend pulled into the since-last-visit summary; summary moved above the action
row) →
**`session-switching`** (0073; hold several patients open + switch without
re-coding + same-day reopen; consent gate unchanged) →
**`wide-layout`** (no migration; clinician patient page two-column at lg —
context left / goals right, look-up tools in a header toolbar; banner week
eyebrow removed) →
**`record-goal-inline`** (no migration; record a goal in a slide-over over the
chart instead of a separate route; form factored into RecordGoalForm) →
**`nrs-baseline-target`** (0074; NRS goals get a baseline + target 0–10 set
with the patient; direction derived; start/target lines on the graph) →
**`baseline-video`** (0075; clinician records an in-clinic baseline clip per
video goal; patient sees it as a reference at the weeks-6–8 check-in) →
**`video-score-queue`** (0076; per-visit quick-score queue over unscored peak
clips, baseline shown beside each, GAS anchors or NRS 0–10) →
**`recorder-upload-clinic-overlay`** (no migration; recorder file-upload
fallback for webcam-less desktops + clinic 0–10 overlaid on the NRS trend) →
**`training-row-wearable-module`** (0077; start-cycle moved up, training into
the icon row, wearables a gated module with a per-patient enable) →
**`side-menu-option`** (0078; top-vs-side nav choice at setup + in the account
menu, with a side rail on the patient page) →
**`itb-therapy-track`** (0079; intrathecal-baclofen therapy as a parallel
track with a dose-titration log, separate from the BoNT cycle) →
**`itb-goals`** (0080; goals tagged bont|itb, grouped on the page, both
therapies rated in one weekly check-in) →
**`itb-goals-polish`** (no migration; check-in ITB chip + dose-titration
markers on ITB goal charts) →
**`action-row-tidy`** (no migration; reordered patient-page icons, compact
therapist panel, panels open from the menu) →
**`pre-visit-suggestions`** (0081; patient row on signup, cycle-agnostic goal
suggestions, approval resolves the active cycle) →
**`patient-visit-and-status`** (no migration; teach visit code in onboarding +
no-cycle home, pending-suggestion status echo on the home) →
**`checkin-undo`** (0082; patient can undo a just-submitted check-in within
24h via reopen_weekly_checkin) →
**`audit-followups`** (no migration; signup expectation note, onboarding visit-
before-checkin order, home progress reassurance; current).

---

## 7. Latest delivered build

- **Zip:** `treatment-companion-audit-followups.zip`
- **Tag:** `audit-followups`
- **Change:** **Remaining patient-audit items. No migration (client/copy).**
  Most audit items turned out already-handled (autoComplete + inline password
  hint on signup; plain-language importance options; the check-in already
  passes a named `stepLabels` progress strip; status echo / undo / pre-visit
  suggestions shipped earlier). The genuinely-open ones done here:
  - **Signup expectation framing:** a patient-only note under the role choice
    — "Your clinic connects your record at your first visit; you can start
    suggesting goals before then." (`signup.patientNote`).
  - **Onboarding order:** the patient wizard now teaches the **visit code
    before the check-in** (`intro → details → visit → checkin → comfort`) —
    connect first, then learn the weekly rating.
  - **Progress reassurance:** a gentle, honest line under the home goals —
    progress is uneven and a flat week isn't failure; the clinician looks at
    the whole picture (`patient.home.progressReassurance`, shown when goals
    exist).
  - **i18n:** `signup.patientNote`, `patient.home.progressReassurance` (en/da).
- **DB needed:** none.
- **⚠ QA (can't test here):** signup shows the patient note when "Patient" is
  selected (and not for "Therapist"); onboarding step order reads visit →
  check-in; the reassurance line shows under the goals when the patient has any.
- **Audit items NOT changed (by design / can't action here):** clinic→patient
  visibility of what the clinician added (intentionally upward-only); visit-code
  10-min expiry + no-screen fallback (inherent / clinic-side); notifications
  push pipeline (opt-in UI exists; runtime/infra, untestable here); visual
  focus-ring / colour-contrast / screen-reader checks (need a rendered build —
  tap targets and aria-labels look right in code). Role two-button kept (defaults
  to patient; the role hint already explains physicians are clinic-set-up).

---

## 7b. Previous delivered builds

- **`checkin-undo`** — zip `treatment-companion-checkin-undo.zip` (migration
  0082). `reopen_weekly_checkin` lets a patient undo a just-submitted check-in
  within 24h (refused once a clinician has scored a clip); "Edit my answers" on
  the thanks screen.
- **`patient-visit-and-status`** — zip `treatment-companion-patient-visit-and-status.zip`
  (no migration). Visit-code teaching in the patient onboarding wizard + the
  no-cycle home; pending-suggestion status echo on the home.
- **`pre-visit-suggestions`** — zip `treatment-companion-pre-visit-suggestions.zip`
  (migration 0081). Patient row on signup (trigger+backfill), cycle-agnostic
  goal suggestions, approval resolves the active cycle; no-cycle home offers
  "Suggest a goal".
- **`action-row-tidy`** — zip `treatment-companion-action-row-tidy.zip` (no
  migration). Reordered patient-page icons (medication/training/therapist/
  history/export), compact therapist panel, panels open from the menu.
- **`itb-goals-polish`** — zip `treatment-companion-itb-goals-polish.zip` (no
  migration). Check-in ITB chip on ITB goal steps + dose-titration markers on
  ITB goal charts (`GoalProgressView` `doseMarkers`).
- **`itb-goals`** — zip `treatment-companion-itb-goals.zip` (migration 0080).
  Goals tagged `therapy` bont|itb (`set_goal_therapy` RPC); ITB goals ride the
  active cycle so the weekly check-in rates both therapies at once; clinician
  page groups them under an "ITB goals" section with a "Record ITB goal" action.
- **`itb-therapy-track`** — zip `treatment-companion-itb-therapy-track.zip`
  (migration 0079). ITB modelled as its own therapy entity with a
  dose-titration log (`itb_therapy` + `itb_dose_change`), parallel to the BoNT
  cycle; ITB track module on the clinician patient page.
- **`side-menu-option`** — zip `treatment-companion-side-menu-option.zip`
  (migration 0078). Top-vs-side navigation choice for the patient page, picked
  at setup (illustrated) and in the account menu; `PatientActionRow` gained a
  vertical `sidebar` variant. `profile.nav_style`.
- **`training-row-wearable-module`** — zip
  `treatment-companion-training-row-wearable-module.zip` (migration 0077).
  Start-cycle moved to the top of the context column; training moved into the
  icon row (panel); wearables became a gated left-column module with a
  per-patient enable on the patient-info page.
- **`recorder-upload-clinic-overlay`** — zip
  `treatment-companion-recorder-upload-clinic-overlay.zip` (no migration).
  Recorder file-upload fallback for webcam-less desktops; clinic 0–10 overlaid
  on the NRS trend chart.
- **`video-score-queue`** — zip `treatment-companion-video-score-queue.zip`
  (migration 0076). Per-visit clinician quick-score queue over unscored
  peak-effect clips: each shown beside its baseline, GAS anchors or NRS 0–10,
  unusable escape, auto-advance. Added `weekly_goal_rating.clinic_video_nrs` +
  `set_clinic_video_nrs` RPC.
- **`baseline-video`** — zip `treatment-companion-baseline-video.zip`
  (migration 0075). Clinician records an in-clinic baseline clip per
  video-enabled goal (`<patient_id>/baseline/<goal_id>`; new clinician-write
  storage policy scoped to the baseline subfolder); the patient sees it as a
  reference at the weeks-6–8 check-in.
- **`nrs-baseline-target`** — zip `treatment-companion-nrs-baseline-target.zip`
  (migration 0074). NRS goals gain a baseline + target (0–10) set with the
  patient; direction derived from them (the higher/lower question is gone);
  start + target reference lines on the NRS graph.
- **`record-goal-inline`** — zip `treatment-companion-record-goal-inline.zip`
  (no migration). Goal form factored into `RecordGoalForm` + `RecordGoalDrawer`;
  "Record goal" opens a slide-over over the chart instead of routing to
  `/clinician/new-goal` (route kept as a thin wrapper). Goal list refreshes in
  place via the existing query invalidation.
- **`wide-layout`** — zip `treatment-companion-wide-layout.zip` (no migration).
  Clinician patient page goes two-column at `lg` (context left / goals right),
  look-up tools moved into a header toolbar (`PatientActionRow variant="toolbar"`),
  goals lifted above the context; banner "week N" eyebrow removed (date only).
  Gated on the `wide` layout preference (default).
- **`session-switching`** — zip `treatment-companion-session-switching.zip`
  (migration 0073). Multi-patient open + switch without re-coding + same-day
  reopen; consent gate unchanged. One-active index relaxed to
  per-(clinician,patient); patient-scoped touch/end; `reopen_session`;
  `list_my_sessions`; `/clinician` is now a switcher; patient page gained
  "Switch patient" and ends only the current patient.
- **`patient-banner`** — zip `treatment-companion-patient-banner.zip` (no
  migration). Always-visible patient banner (name, demographics summary,
  cycle/modality, medication, devices via `PatientBanner` + `usePatientInfo`);
  conditional wearable trend pulled into `VisitChanges` (shown only when data
  exists); since-last-visit summary moved above the action row.
- **`edit-video-protocol`** — zip `treatment-companion-edit-video-protocol.zip`
  (no migration). The check-in video request + task protocol became editable on
  an existing goal via a new `VideoProtocolEditor` modal opened from a "Video
  task" button by each goal (reuses `useSetGoalVideoEnabled` +
  `useSetGoalVideoProtocol`); the clinician goal now carries `videoEnabled` +
  `videoTask*` so the editor opens pre-filled.
- **`clinic-trend-chart`** — zip `treatment-companion-clinic-trend-chart.zip`
  (no migration). Charts the clinic-scored video series as its own "Clinic
  video assessment" GAS trend under each goal's patient chart (reuses
  `GoalProgressView` kind=gas; no SVG edits; avoids NRS/GAS axis mixing).
- **`clinic-video-scoring`** — zip `treatment-companion-clinic-video-scoring.zip`
  (migration **0072**). Clinic-side structured scoring of the standardized
  videos: `weekly_goal_rating.clinic_video_*` + `set_clinic_video_score` RPC;
  a scoring panel in `VideoPlayerModal` (GAS levels — goal anchors for GAS
  goals, generic meanings for NRS — plus an unusable toggle); score badges on
  the `VisitChanges` clips. The authoritative one-rater outcome. **Run
  migration 0072.**
- **`guided-capture`** — zip `treatment-companion-guided-capture.zip` (migration
  **0071**). Standardized video task protocol + guided capture: the clinician
  defines a per-goal recipe (`approved_goal.video_task_*` +
  `set_goal_video_protocol`), shown at record time in `GoalVideoRecorder`
  (task card persists while filming, landscape nudge, target length, min-3s
  gate) so a rotating informant films the same task each week. **Run migration
  0071.**
- **`video-playback`** — zip `treatment-companion-video-playback.zip` (no
  migration). Clinicians can play back patient check-in videos: a signed-URL
  hook (`useGoalVideoUrl`) + an a11y `VideoPlayerModal`, launched from the
  per-clip play buttons added to `VisitChanges`. Reuses the 0062 `goal-videos`
  bucket + its clinician-read policy; frontend only.
- **`treatment-modality-seam`** — zip
  `treatment-companion-treatment-modality-seam.zip` (migration **0070**). WP4
  futureproofing: a `treatment_modality` enum + `treatment_cycle.modality`
  column (default `botulinum_toxin`), threaded into the clinician cycle type +
  a quiet modality pill, plus an optional (non-default-only) modality line in
  the EHR export. Strictly additive; the BoNT flow is unchanged and nothing
  branches on the column yet. **Run migration 0070.**
- **`wearable-scaffold`** — zip `treatment-companion-wearable-scaffold.zip`
  (migration **0069**). Vendor-neutral wearable / PGHD ingestion layer: a
  FHIR-`Observation`-aligned, metric-agnostic `observation` table + the
  `import_observations(patient, jsonb[])` security-definer RPC (authorizes +
  dedups) + RLS, plus `lib/supabase/observations.ts` (typed hooks + CSV
  parser) and a clinician `/clinician/observations` route (CSV + manual import
  + recent list), reached from a new **Wearable** action on the patient page.
  Storage + import only — no clinical logic, no vendor adapters. **Run
  migration 0069.**
- **`mandatory-setup`** — zip `treatment-companion-mandatory-setup.zip` (no
  new migration). First-run setup made **mandatory** via `SetupGate`
  (full-screen, non-skippable, mounted after `PasswordChangeGuard`; defers to
  password-change; auth pages + admin exempt), and the wizard's `comfort`
  accessibility step gained the read-aloud On/Off toggle. Wizard props
  `mandatory` / `replayOnly` / `onComplete`; per-page mounts are now
  replay-only. No DB change.
- **`read-aloud`** — zip `treatment-companion-read-aloud.zip` (migration
  **0068**). New read-aloud / text-to-speech accessibility opt-in:
  `profile.read_aloud` pref + `useSetReadAloud`, on-device `speechSynthesis`
  via `lib/useSpeak.ts`, and a self-gating `ReadAloudButton` placed on the
  patient-home goal, both check-in rating pickers, and the safety notice;
  toggle in `AppearanceSettings`. (The *visual* a11y options already existed;
  only read-aloud was new. Voice input deferred.) **Run migration 0068.**
- **`batch-c`** — zip `treatment-companion-batch-c.zip`. Minor polish:
  hide patient-home "View graph" until a goal has data; clinician-entry
  field label no longer duplicates the heading; three stale code comments
  corrected. No DB change.
- **`batch-b`** — zip `treatment-companion-batch-b.zip`. Localization sweep:
  patient home error/no-cycle, visit-code states, check-in GAS level
  meanings (picker + summary), the whole physio unlock screen, new-goal
  model toggle + headings, suggestion NRS heading/intro, clinician admin
  link, admin created-account block; reworded two now-stale cut-off
  strings. `/privacy` deferred. No DB change.
- **`batch-a`** — zip `treatment-companion-batch-a.zip`. NRS cut-off UI
  dropped (option B — app sends default cuts, no schema/check-in change),
  suggestion-approval gained a GAS option (additive RPC **0067**), `/demo`
  deleted, and `clinician/patient` forced dynamic to dodge a pre-existing
  Next 15 RSC-manifest prerender bug. **Run migration 0067.**
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

- **Access & switching — partly done.** `session-switching` (0073) shipped
  multi-patient switching + same-day reopen, consent gate unchanged. PARKED
  by decision: **pre-visit prep / roster** (needs consent to move earlier than
  the visit — appointment-scoped, which needs a scheduling concept the app
  lacks, or standing opt-in, which needs DPO/regulatory sign-off). Don't build
  until that call is made.
- **Clinician patient-view layout pass — DONE** in `wide-layout`: two columns
  at `lg` (context left / goals right), the look-up row moved into a header
  toolbar, and goals lifted above the context. Needs a visual verification pass
  (see §7 QA). Remaining patient-view friction, in the user's ranked order:
  **review → record without leaving the view — DONE** in `record-goal-inline`:
  the goal form opens as a slide-over over the chart. New-cycle is already a
  modal.
- **Video / baseline work — in progress.** Pass A (`nrs-baseline-target`, 0074)
  shipped NRS baseline + target. **Decisions locked with the user:** baseline
  video recorded IN CLINIC, stored on the goal, doubling as the patient's
  reference when they record the weeks-6–8 peak clip; video available on both
  GAS and NRS goals; peak-video clinician score = GAS −2…+2 vs anchors, NRS on
  the same 0–10 as the patient. **Pass B — DONE** (`baseline-video`, 0075): in-clinic
  baseline capture + patient reference at check-in; the new access path turned
  out to be the CLINICIAN write (patient read was already covered by 0062).
  **Pass C — DONE** (`video-score-queue`, 0076): per-visit
  quick-score queue, baseline beside each peak clip, anchors for GAS / 0–10 for
  NRS, auto-advance. Both follow-ups also DONE in
  `recorder-upload-clinic-overlay` (no migration): the recorder file-upload
  fallback for webcam-less desktops, and the clinic-vs-patient 0–10 overlay on
  the NRS trend. The whole 3-pass video/baseline arc plus its polish is shipped.

0. **Informant-independent capture (lever 3).** Slice 1 (`guided-capture`,
   0071) standardized the capture; slice 2 (`clinic-video-scoring`, 0072) added
   the clinic GAS scoring + unusable mark, so the authoritative one-rater
   series now exists in the data. **Still open:** (a) DONE in `clinic-trend-chart` —
   the clinic-scored series is charted as its own "Clinic video assessment"
   GAS trend under each goal; (b) DONE in `edit-video-protocol` —
   the video request + task protocol are now editable on an existing goal;
   (c) standardized framing is the precondition for later automated movement
   scoring (WP5) — **NOT built, and not a code drop**: it needs an actual model
   + clinical validation + an MDR determination, and would cross the
   "informs, clinician decides" line the scope sets. The DATA readiness already
   exists (the `observation` store can hold a machine-derived signal as a
   distinct, clearly-labelled, advisory source, separate from and never
   overwriting the clinic's human `clinic_video_rating`). Build the explicit AI
   lane only once there is a validated model to feed it.

1. **(DONE in `video-playback`)** Clinician video playback (signed-URL
   `<video>` via `useGoalVideoUrl` + `VideoPlayerModal`, launched from
   `VisitChanges`). Remaining: real-device playback QA (iOS/Android codecs),
   and an optional per-goal playback entry point for videos recorded earlier
   in the cycle (today's list covers the since-last-visit window).
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
7. **Wearable / third-party data — next slices** (scaffold shipped in
   `wearable-scaffold`; storage + manual/CSV import only):
   - **Per-vendor adapters** that normalize into `import_observations`:
     server-side are easiest (Garmin webhooks, Fitbit/Oura OAuth REST). Apple
     Health has **no backend API** — it needs a native iOS layer; Android
     needs Health Connect via a native layer. Patients use both platforms, so
     a thin native companion (or a unified-wearable-API aggregator) is
     unavoidable for phone-collected data. An aggregator adds a GDPR
     sub-processor (DPA needed).
   - **Decide which metrics are clinically meaningful** before surfacing any
     (for spasticity/dystonia likely activity, tremor/accelerometry, ROM) —
     none chosen yet; the model is deliberately metric-agnostic.
   - **GDPR / EHDS:** granular per-metric consent + opt-out, data
     minimization, residency; wearable data is special-category health data.
   - **MDR flag:** if wearable data starts *driving clinical decisions*, it
     may push the app toward CE-marked medical-device software — confirm the
     passive-display vs clinical-input line with a regulatory advisor.
   - **Clinical validity:** consumer-grade accuracy varies; vendor
     sleep/stress algorithms differ — don't treat sources as interchangeable.
   - **Scope gaps in the scaffold:** `observation` reads + the import route
     are **clinician-scoped** (add physio RLS/route if needed); automated /
     service-role ingestion for adapters and optional `treatment_cycle_id`
     backfill are not built; a richer clinician view/graph (beyond the raw
     recent list) is open.
8. **Treatment-modality backbone — finish WP4 when scheduled** (seam shipped
   in `treatment-modality-seam`; `treatment_cycle.modality` exists, defaults to
   BoNT, nothing branches on it yet):
   - **Detail tables per modality** keyed on the cycle (e.g. `baclofen_course`:
     test-dose response, implant date, titration; `surgical_episode`: preop
     status, procedure, postop recovery, complications).
   - **Modality picker in the new-cycle flow** (NewCycleDialog /
     useStartNewCycle / useStartCycleWithTreatment) — today only BoNT cycles
     can be created; the picker + modality-specific capture come together.
   - **Modality-specific views** on the clinician patient page (the BoNT
     injection/muscle/dose UI is BoNT-only; branch on `cycle.modality`).
   - **Concurrency:** a patient on BoNT who also has a pump = parallel active
     cycles of different modalities. The active index is already non-unique,
     but `useClinicianPatientData` loads a single active cycle (highest
     cycle_number) — multi-active needs a selector / per-modality loading.
   - **Check-ins / goals** are modality-neutral already (goal + rating), so
     they should carry across modalities largely as-is.

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
