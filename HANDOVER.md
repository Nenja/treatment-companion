# Treatment Companion — Engineering Handover

> **Purpose.** This is the single source of truth for picking up work on this
> project in a new chat/session. Read it first. It captures the app, the
> non-obvious build workflow, the data model, what's built, and what's pending.
> A short, paste-able kickoff that points here lives at **`TRANSFER_PROMPT.md`**
> (repo root) — that's what the user pastes into a new chat alongside the zip.
>
> **Keep it current.** At the end of *every* delivery, update:
> §7 Latest delivered build (move the old one into §7b), §6 Build history,
> §8 Pending, and §4/§5 if the schema, conventions, or a feature's state
> changed. **Also update `TRANSFER_PROMPT.md`** (its “Where we are” / “What's
> likely next” sections + build tag) and write a fresh root `BUILD.txt`. Treat
> all of this as part of the deliverable, not an afterthought.
>
> _Last updated for build tag: `simplify-cockpit-64` (no new migration; still needs 0095 if not yet run). Therapist patient page restructured into the two-pane cockpit shell — sticky context rail (cycle/week, clinic note, patient comments) + work column (actions, report-progress, note card, goals) at wide/lg; single column on phone. Reuses today's reporting; slice 2b-ii folds ratings inline. See §7._

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
  build one. The **one** sanctioned downward channel is the physician→therapist
  handoff note (`physician-therapist-note`, §5.13) — inter-professional
  hand-off, never patient-visible — not a clinic→patient channel.
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
5. **Success = exit 0 and "✓ Generating static pages (60/60)".** (Historical:
   55 before the dev tools; +2 for `/dev/scenarios`; the no-auth `/demo` removal
   in `batch-a` dropped 60→58; the goal-versioning routes brought it back to
   **60**. No new route since.) The only
   expected warning is a Sentry/OpenTelemetry "critical dependency" message
   (unrelated, ignore).
6. **Restore** `app/[locale]/layout.tsx` from `/tmp/layout.tsx.orig`, then verify:
   - `sha256sum` of the restored file ==
     `5a1cf0da324497bc26f2a10bb332d8aced01d68bb7b8e533abc7ef62fdae90d9`
     (current as of `physician-therapist-note`; **was** `6b5bb2fd…`, and
     `cfaf492…` before that — layout.tsx evolves, so recompute from the backup
     you took this session rather than trusting a frozen hash).
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

**Contrast guardrail** (computed, `clinician-cockpit-accessibility-audit.md`):
every text-bearing pair passes WCAG AA. The one exception is **plain `sage`
(`#5c7a6a`)** — as text on cream it is 4.20:1 and white-on-`sage` is 4.45:1,
both **below AA for normal-size text**. Today it's used only for decorative
dots, which is fine. **Do not use plain `sage` for normal text or as a button
fill with light text — use `sage-deep` (which passes).**

**Modal a11y:** every blocking dialog must call `useModalA11y(onClose)` (focus
restore + focus-on-open + bidirectional Tab trap + Escape + body-scroll-lock).
The one deliberate exception is `FaceMap`'s anchored popover, which hand-rolls
focus + Escape (no Tab trap) by design because it's a popover, not a blocking
modal.

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
- **`treatment_handoff`** (0088): id, `treatment_cycle_id` **UNIQUE** (1:1 with
  the cycle), patient_id, `note` text, `treatment_changed` boolean (NULL =
  not stated; true = adjusted; false = no change), created_by, created_at,
  updated_at. The physician→therapist handoff note (§5.13). RLS read =
  `clinician_can_access_patient(patient_id)` (role-agnostic → physician +
  therapist read it; **no patient policy at all**, so a patient can never read
  it — the note must NOT be put on `treatment_session`, which the patient can
  read). Writes only via `set_treatment_handoff` (clinician-only).

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
- `set_treatment_handoff(p_cycle_id, p_note, p_treatment_changed)` (0088,
  SECURITY DEFINER). Upserts the physician→therapist handoff for a cycle into
  `treatment_handoff`. **Clinician-only** (`current_app_role() = 'clinician'`;
  a physiotherapist cannot author it) + `clinician_can_access_patient`. Empty
  note **and** null flag → deletes the row (clears it); a bare flag is kept.
- Helpers: `nrs_to_gas(...)`, `gas_label(int)`.

### 4.5 Storage

- Private bucket **`goal-videos`** (created in 0062). Path convention
  `<patient_id>/<prompt_id>/<goal_id>.<ext>`.
- Policies mirror the app model: patient manages only their own folder
  (`(storage.foldername(name))[1] = current_patient_id()::text`); clinician
  read-only via `clinician_can_access_patient(((storage.foldername(name))[1])::uuid)`.

### 4.6 Migrations & what must be run

`supabase/migrations/` holds the numbered migrations (through **0088**) plus the
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
- `0088_treatment_handoff.sql` — **`physician-therapist-note`, RUN THIS (after
  0087).** New `treatment_handoff` table (1:1 with the cycle) + RLS + the
  clinician-only `set_treatment_handoff` RPC. The physician→therapist note
  (§5.13). DB-verified locally (§5.12 D).

> If unsure whether the user's DB is current, confirm 0062–0088 are applied (0066 is dev-only; **0067** GAS suggestion-approval, **0068** read-aloud, **0069** wearable ingestion, **0070** treatment-modality, **0071** video task protocol, **0072** clinic video score, **0073** session switching, **0074** NRS baseline/target, **0075** baseline video, **0076** clinic video NRS, **0077** wearable enabled, **0078** nav style, **0079** ITB therapy, **0080** goal therapy tag, **0081** cycle-agnostic suggestions, **0082** check-in undo, **0083** physio goal signals, **0084** physio GAS value, **0085** cycle-agnostic physio suggestions, **0086** goal versioning, **0087** link goal to lineage, **0088** physician→therapist handoff note).

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

Also in `docs/audits/`:
- **`patient-workflow-audit.md`** — full patient journey, end to end. Headline:
  a brand-new patient couldn't record goals (cold start). Its five prioritized
  recommendations are **all shipped** (builds `pre-visit-suggestions`,
  `patient-visit-and-status`, `checkin-undo`, `audit-followups`).
- **`therapist-workflow-audit.md`** — full community-therapist journey.
  Headline: the therapist's weekly training had nowhere to be recorded. It
  drove the **therapist-signals epic** (capture days/functions/feasibility,
  surface to physician, GAS-aware rating, status echo, cycle-agnostic
  suggestions) — **all shipped** (§6, tags `therapist-signals` →
  `therapist-cycle-agnostic`).
- **`treatment-companion-visual-coherence-audit.md`** — design-token / visual
  consistency pass across the app.

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

### 5.12 Audit & verification methods (reusable)

How the audits and migration checks in this project are actually done — reuse
these recipes rather than reinventing them.

**A. End-to-end workflow audit (persona walk).** Used for
`patient-workflow-audit.md` and `therapist-workflow-audit.md`.
- Pick ONE concrete persona (e.g. "a brand-new patient"; "a community
  physiotherapist doing weekly training") and walk the *entire* journey in
  order: account creation → onboarding → first landing → each core task →
  resume/exit.
- Ground every observation in the ACTUAL code — read the routes, components,
  hooks, and RPCs for each step; do not audit from assumptions or memory.
- Per step note what works / friction / missing, each tagged **[High] /
  [Med] / [Low]**. Lead the whole doc with the single headline finding, and
  close with a short prioritized recommendation list.
- Honesty rule (non-negotiable): mark anything that needs a rendered build,
  real device, or live DB/RLS to confirm as **"verify"**, never as done.
  Distinguish `[verified-in-code]` from `[needs-on-screen-check]`.
- Deliver as a standalone `.md` (in `docs/audits/`, and to outputs). These are
  `.md` docs, NOT a code zip.

**B. Per-lens UX doc (six-lens).** Used for the face module and the sample
patient page. One lens per doc — accessibility, don't-make-me-think, health
literacy, information architecture, progressive disclosure, trust/credibility.
Style: **issue → why → specific fix**, severity-ranked, measured where possible,
`[verified-in-code]` vs `[needs-on-screen-check]` tags.

**C. Visual coherence audit.** Design-token / visual-consistency sweep across
screens (`treatment-companion-visual-coherence-audit.md`): check spacing,
type scale, colour-token use, component reuse vs one-offs.

**D. Migration verification via a throwaway local Postgres (NEW — used for
0086 & 0087).** For any migration with a non-trivial RPC or constraint, verify
the SQL *before* shipping instead of only reasoning about it:
1. `apt-get install -y postgresql` (Ubuntu archives are allowlisted), then
   `initdb` + `pg_ctl start` a throwaway cluster as the `postgres` user (PG
   won't run as root; use `su postgres -c …`, there's no `sudo`).
2. Build a **minimal schema harness**: only the enums + tables the migration
   touches, plus the SECURITY DEFINER helpers stubbed so you can flex them —
   a mutable `_test_ctx(role, clin, access)` table behind
   `current_app_role()` / `current_clinician_id()` / `clinician_can_access_patient()`,
   and an `auth.uid()` stub. Create a `role authenticated` so `grant … to
   authenticated` succeeds.
3. Apply the migration **verbatim**, seed a realistic scenario, and exercise
   the RPC on both the happy path AND every guard (negative cases).
4. This is not theoretical: it **caught a ship-blocking bug** in 0086 —
   `lineage_id` was NOT NULL with no default, so the first real goal-approval
   after the migration would have failed; the fix (a BEFORE INSERT lineage
   trigger) was found by the test.
- **Caveat:** the harness stubs RLS/auth, so it proves the SQL logic and the
  RPC guards, NOT the real RLS policies — those still need checking on the live
  Supabase. Still the highest-leverage check available without the user's DB.

### 5.13 Physician → therapist handoff note (`physician-therapist-note`, 0088)
The **one** sanctioned downward channel (clinic → therapist). The treating
physician can attach, to a cycle's treatment, a short note for the patient's
weekly community therapist plus a **"did the treatment change this visit?"**
flag (Adjusted / No change / Not specified). Closes the therapist-audit gaps:
no feedback on a physician action, and no since-last-session delta.

- **Never patient-visible** is enforced by the data model, not just the UI.
  The patient already has row-level read on `treatment_session` (treated-muscles
  pop-up) and Postgres RLS is row- not column-level, so the note **cannot** sit
  on `treatment_session`. It lives in **`treatment_handoff`** (1:1 with the
  cycle; §4.2), which has **no patient SELECT policy at all**. Read =
  `clinician_can_access_patient(patient_id)` (role-agnostic → physician +
  therapist; patient excluded). Write = `set_treatment_handoff` (SECURITY
  DEFINER, **clinician-only** — a physiotherapist cannot author it).
- **Physician UI** — `app/[locale]/clinician/treatment/page.tsx`: a sage "Note
  for the therapist" panel under Session notes (tri-state flag buttons +
  short note, maxLength 500, with a "not shown to the patient" hint).
  `useClinicianPatientData` loads the handoff into `ClinicianTreatmentRecord`
  (`therapistNote`, `treatmentChanged`) so editing the same-day treatment
  pre-fills it. Submit captures the cycle id (the new-cycle path returns it;
  the existing path already has it) and calls `useSetTreatmentHandoff` after
  the session save. Always called, so clearing the note removes the row.
- **Therapist UI** — `app/[locale]/physio/patient/page.tsx`: a prominent "Note
  from the treating clinic" card near the top of the active-cycle content
  (date line, a change/no-change line, the note). `usePhysioPatientData` adds
  `handoff` for the **active cycle**, fetched **regardless of the muscle-sharing
  preference** (it's a deliberate message, not injection detail). Only rendered
  when a note and/or flag is present.
- **Verified locally** (§5.12 D): 8 checks incl. the RLS boundary (patient → 0
  rows; professionals with access → the row). Cleared handoffs delete the row.
- **Open follow-ups (not built):** the note isn't echoed back to the physician
  on the clinician patient page (they re-open the treatment form to see/edit
  it); it is single-shot per cycle (no thread); and it has no read receipt.

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
**`audit-followups`** (no migration; signup note, onboarding order, progress
reassurance) →
**`therapist-signals`** (0083; therapist per-goal signals — working-on,
needs-adjustment+note, visit auto-registers; capture) →
**`therapist-signals-physician`** (no migration; surfaces those to the
physician) →
**`therapist-gas-rating`** (0084; therapist rates GAS goals against anchors
via gas_value; overlays corrected) →
**`therapist-status-echo`** (no migration; therapist sees physician status on
their goal/muscle suggestions) →
**`therapist-cycle-agnostic`** (0085; therapist can suggest pre-cycle; physician
read widened to null-cycle) →
**`goal-versioning`** (0086; goal lineage/version foundation + edit_goal RPC +
live-version read filter) →
**`goal-edit`** (no migration; Recalibrate button + EditGoalDrawer call edit_goal;
goal carries lineageId/version) →
**`goal-history`** (no migration; per-goal History modal — version timeline by
lineage with frozen calibration + ratings) →
**`goal-link`** (0087; link a goal onto an existing lineage as its newest
version) →
**`physician-therapist-note`** (0088; first downward clinic→therapist channel —
`treatment_handoff` table + `set_treatment_handoff` RPC; physician records a
short note + "treatment changed?" flag, surfaced to the therapist, never
patient-visible) →
**`audit-fixes`** (no migration; remediation of the four audit docs — EHR
wearing-off/sustained/NRS-direction fixes, i18n leaks keyed en+da, cockpit `h1`
+ chart data-table + modal scroll-lock, start-cycle dependency copy) →
**`ehr-localized`** (no migration; EHR-paste export fully localised via the
`ehrExport` namespace, en+da) →
**`simplify-cockpit-1`** (no migration; declutter batch 1 — read-aloud scoped to
patients, goal-card history/link removed, ITB off the front page) →
**`simplify-cockpit-2`** (no migration; #2a read-aloud refresh fix; #3 night-mode
investigated; #4 muscle→function DRAFT) →
**`simplify-cockpit-3`** (no migration; #3 night-mode FIXED — toggle commits a
palette so the saved night value sticks) →
**`simplify-cockpit-4`** (no migration; #9a/#10 — medication/training/therapist
panels now open as side drawers via CockpitPanelDrawer) →
**`simplify-cockpit-5`** (no migration; #6 stray data-table under the graph
removed; goal 'Recalibrate'→'Edit' regrouped) →
**`simplify-cockpit-6`** (no migration; #5 video task under Edit goal; #8 show
last treatment) →
**`simplify-cockpit-7`** (no migration; backdrop-close + bg-field cleanup) →
**`simplify-cockpit-8`** (no migration; graph width cap + last-visit max-effect) →
**`simplify-cockpit-9`** (no migration; #9b therapist input → treatment page) →
**`simplify-cockpit-10`** (no migration; training day-list shows directly) →
**`simplify-cockpit-11`** (no migration; #11 therapist gating) →
**`simplify-cockpit-12`** (no migration; video button back; subtle link) →
**`simplify-cockpit-13`** (no migration; goal graph fills its card) →
**`simplify-cockpit-14`** (no migration; Option A restructure) →
**`simplify-cockpit-15`** (migration 0089; clip deletion) →
**`simplify-cockpit-16`** (migration 0090; per-goal handoff notes) →
**`simplify-cockpit-17`** (no migration; lightened goal-Edit copy) →
**`simplify-cockpit-18`** (no migration; wearable import reorder) →
**`simplify-cockpit-19`** (no migration; 'Session setup' heading) →
**`simplify-cockpit-20`** (no migration; 'what's still needed' helper on the
new-goal + approve calibration forms; current).

---

## 7. Latest delivered build

- **Zip:** `treatment-companion-simplify-cockpit-64.zip`  ·  **Tag:** `simplify-cockpit-64`  ·  **Migration: none (still needs 0095_therapist_note if not yet run).** Therapist surface, slice 2b-i (cockpit shell), cumulative.
- **Therapist patient page → two-pane cockpit shell (Direction 3).** The body now renders as `lg:grid lg:grid-cols-[300px_minmax(0,1fr)]` **only when the wide layout is on**; on a phone / compact it stays single-column (the rail + work simply stack). Left rail (`lg:sticky lg:top-6`): cycle/week line, late-cycle hint, the physician's clinic note, and the patient's recent comments. Right work column: the action-row chips + panels, the report-progress button, the note-to-clinic card, and the goals. `app/[locale]/physio/patient/page.tsx`, three surgical cuts (no data-flow change).
- **Reuses today's reporting for now** — the "Report progress" button still navigates to `/physio/progress`. Slice 2b-ii folds the rating inline as unified per-goal cards (rate beside the trend), adds the "since your last visit" recap, moves the note card below the goals, and retires `/physio/progress`.
- **⚠ QA (cannot verify here):** on a wide desktop the rail sits left and stays put while the work column scrolls; on a phone everything stacks in one column as before; the clinic note + patient comments read well in the rail. No behaviour changed — only layout.

- **Zip:** `treatment-companion-simplify-cockpit-63.zip`  ·  **Tag:** `simplify-cockpit-63`  ·  **Migration: 0095_therapist_note — RUN IT.** Therapist surface, slice 2a (the note channel), cumulative (supersedes 21-62).
- **Therapist → clinic note channel (new).** `therapist_note` table + `submit_therapist_note` / `mark_therapist_notes_seen` RPCs (migration 0095; verified on local Postgres — physio-only submit, physician-only mark-seen, idempotent, no patient SELECT policy). New `lib/supabase/therapistNote.ts` (list + submit hooks) and `components/physio/NoteToClinicCard.tsx`: one box, any length, sent immediately; sent notes show **Delivered**, upgrading to **Seen · <time>** (no name) once a physician opens the patient's notes. Patient-invisible. Wired onto `/physio/patient` at the foot of the active-cycle branch — it becomes a permanent fixture in slice 2b's layout rebuild.
- **Muscle-flag form retired.** Dropped the `suggestMuscle` chip from `PhysioActionRow` (left in the type/icon, just not in the row) and removed the inline `PhysioMuscleSuggestionForm` panel + `usePhysioMuscleSuggestions` from `/physio/patient`. Muscle concerns now go in the note as prose. `physio_muscle_suggestion` table + `PhysioMuscleSuggestionForm.tsx` left dormant (non-destructive). Goal suggestions stay separate.
- New i18n `therapistNote.*` (title/helper/placeholder/send/sending/sentHeading/seen/delivered/error; DA first-pass).
- **⚠ Requires migration 0095** (run the standalone SQL or the repo migration in the Supabase SQL editor) before the note feature works. **⚠ QA (cannot verify here):** therapist sends a note → it appears under Sent as "Delivered"; a patient can never see notes; the muscle chip is gone from the action row; DA `therapistNote.*` strings read naturally.

- **Zip:** `treatment-companion-simplify-cockpit-62.zip`  ·  **Tag:** `simplify-cockpit-62`  ·  **Migration: none (DB 0094).** Patient-home footer + profile headers, cumulative (supersedes 21-61).
- **Patient home — footer tightened.** Removed the empty band between the "Show visit code" row and the "Not for urgent care" disclaimer. The visit-code row's hairline (`border-b`) is now the single divider; the safety notice drops its own top rule (new `SafetyNotice` prop `topRule={false}`) and its wrapper margin shrank `mt-10`->`mt-5`. The other two SafetyNotice usages (no-cycle / weeks-1-2) default `topRule` true and are unchanged. **Patient page work is now complete.**
- **Profile page — section headers.** Added uppercase `eyebrow` headers grouping the fields: **Account** (name, email, password, + therapist profession), **About you** (patient: sex, reminder day), **Video consent** (patient; the consent block's own heading was promoted to eyebrow style), and **Accessibility** (the appearance / colour + night-mode controls — the last section). New i18n `profile.sectionAccount/sectionAbout/sectionAccessibility` (DA first-pass). The old small `profile.appearanceHeading` ("Colours") is replaced by the Accessibility header; that key is now unused.
- **⚠ QA (cannot verify from here):** home — visit-code row and disclaimer sit close with one hairline, no gap; profile — the four section headers read clearly and group the right fields; a therapist sees only Account + Accessibility; DA section strings read naturally (native review).

- **Zip:** `treatment-companion-simplify-cockpit-61.zip`  ·  **Tag:** `simplify-cockpit-61`  ·  **Migration: none (DB 0094).** Profile-page behaviour change, cumulative (supersedes 21-60).
- **Profile/settings page no longer auto-saves.** Name, profession (therapist), sex, reminder day, and video consent (patient) all STAGE in local state; the single "Save changes" button (last on the page) writes them in one go via `updateProfile` + `setOwnSex` + `setOwnVideoConsent`. Dirty-tracked: Save is disabled until something changes and re-disables after a successful save (JSON snapshot vs a baseline seeded once the profile + patient sex/consent queries have loaded). `app/[locale]/profile/page.tsx`.
- **Unsaved-changes guard.** `attemptLeave(nav)` routes the Back button and the "Change password" link through a styled in-app confirm dialog when there are pending edits; `beforeunload` covers tab close/refresh (native prompt). New i18n `profile.leaveTitle/leaveBody/leaveConfirm/leaveCancel` (DA first-pass).
- **VideoConsentSettings is now controlled** (`components/settings/VideoConsentSettings.tsx`): props `clinical`/`research`/`onChange`, no internal state or save button.
- **Appearance stays live.** Palette + night mode still apply instantly and persist themselves; intentionally NOT under Save and not part of the dirty check (display preview, not form data).
- **Goals page:** the "goals sent" status line moved below the "Suggest a new goal" button.
- **QA (cannot verify from here):** editing then Back/password shows the dialog and "Keep editing" / "Leave without saving" behave; tab-close prompts; Save persists all fields together then greys out; Appearance still previews instantly; DA leave* strings need native review.

- **Zip:** `treatment-companion-simplify-cockpit-60.zip`  ·  **Tag:** `simplify-cockpit-60`  ·  **Migration: none (DB 0094).** Profile-page layout only, cumulative (supersedes 21–59).
- **Profile/settings page reordered so Save is last.** The single "Save changes" button (it persists name + therapist profession; everything else auto-saves) previously sat mid-page, between the auto-saving fields and the video-consent / appearance sections. Now the VideoConsentSettings block and the Appearance (palette + night mode) block sit **above** the Save button, so Save reads as the final action. `app/[locale]/profile/page.tsx` only.
- **First block compacted.** Tighter vertical rhythm (name `mt-7`→`mt-6`, email/password `mt-6`→`mt-5`) and the read-only email is now plain text (`mt-1 text-[15px] text-ink`) instead of a bordered/filled box — removes a heavy boxed row from the identity group. Helpers and labels kept.
- Order is now: Name · Email · Password · Profession (therapist) · Sex (patient) · Reminder day (patient) · Video consent (patient) · Appearance · **Save**.
- **⚠ QA (cannot verify from here):** the Save button at the very bottom still reads clearly as "save my name/profession"; the compact identity block looks balanced; nothing below Save is missing (video consent + appearance present above it).
- _Note: name still requires the Save button while sex/reminder/appearance auto-save (pre-existing Save/auto-save inconsistency). If you'd rather, name could auto-save too and the Save button be dropped entirely — say the word._

- **Zip:** `treatment-companion-simplify-cockpit-59.zip`  ·  **Tag:** `simplify-cockpit-59`  ·  **Migration: none (DB 0094).** Styling/layout only, cumulative (supersedes 21–58).
- **Dropped "See which muscles were treated" from the home.** Removed the link, the `TreatedMusclesModal` render + import, and the now-dead `showMuscles` state from `app/[locale]/page.tsx`. The home foot is now just the visit-code row, then the safety notice + centred privacy link. (`TreatedMusclesModal.tsx` is now unused but left in the repo; the `patient.home.viewTreatedMuscles` i18n key is unused, kept for parity.)
- **"Step X of X" made more obvious.** In `components/wizard/WizardLayout.tsx` the step counter changed from the muted `eyebrow` class to `text-[14px] font-semibold text-sage-deep` — larger, sage-accent, sentence case. It's the only progress cue on the check-in (the step bar is hidden there), so it now reads clearly. Affects both wizards (check-in + suggest-goal), which is consistent.
- **⚠ QA (cannot verify from here):** home foot reads clean without the treated link; the step counter is clearly visible top-right in the check-in on a phone.
- _Note: a slimmer in-flow progress bar could be reintroduced on the check-in if the counter alone isn't enough — not done (the bar was deliberately hidden earlier)._

- **Zip:** `treatment-companion-simplify-cockpit-58.zip`  ·  **Tag:** `simplify-cockpit-58`  ·  **Migration: none (DB 0094).** Styling/i18n only, cumulative (supersedes 21–57).
- **Check-in title shortened.** `patient.home.checkinReadyTitle`: EN "Your weekly check-in is ready" → "Your check-in is ready"; DA "Din ugentlige status er klar" → "Din status er klar". It was wrapping to two lines in the check-in card on a phone. (DA edit is first-pass — flag for native review.)
- **NRS picker number smaller.** `components/wizard/GoalRatingPicker.tsx`: the big picked-number display went `text-[72px]` → `text-[56px]` and the "/ 10" `text-[20px]` → `text-[16px]`; the number block and the tap-scale both went `mt-6` → `mt-4`. This frees vertical room so the optional "Add a short video" button (shown weeks 6–8 for video-enabled goals) isn't crowded below the scale. The GAS picker was left unchanged (it has no big number). Tap targets (h-12 buttons) and stored values are untouched.
- **⚠ QA (cannot verify from here):** the check-in title sits on one line on a narrow phone; the NRS number still reads clearly at 56px and the video button has room beneath the scale on a video week.

- **Zip:** `treatment-companion-simplify-cockpit-57.zip`  ·  **Tag:** `simplify-cockpit-57`  ·  **⚠ MIGRATION 0094 — run `0094_notify_weekday.sql` in Supabase (DB 0093 → 0094).** Cumulative (supersedes 21–56).
- **New feature: patient-chosen weekly reminder day.**
  - **Migration 0094:** `profile.notify_weekday smallint` (CHECK null or 0–6; 0=Sun..6=Sat = JS getUTCDay). NULL = not chosen. No new RLS/grant — patients already self-update `profile`, and the WITH CHECK only forbids role changes.
  - **Login modal** `components/cards/NotificationDayModal.tsx`: bottom-sheet (uses `useModalA11y`). Day chips (Mon-first display, stores JS index), "Turn on reminders" (saves the day **first**, then `subscribeToPush` — so the day persists even if push is blocked / needs iOS install, avoiding a permanent nag), and "Skip for now". Reuses the existing `notifications.*` push status copy.
  - **Home** (`app/[locale]/page.tsx`): inline `NotificationsCard` removed; modal shown when `profile.notifyWeekday == null && pushSupported()`, client-gated via an effect (no SSR flip), tracked with a per-session `notifModalDone` so Skip dismisses for the session but it returns next login (per spec). Rendered in the cycle branch only, so it appears once the patient actually has check-ins.
  - **Auth/profile plumbing:** `AppProfile.notifyWeekday` added (auth.tsx select + map); `useUpdateOwnProfile` accepts `notifyWeekday`.
  - **Settings:** profile page gains a patient-only "Reminder day" select (auto-saves on change, like Sex). It has no "off" — once set, the patient picks among days; a true "off / declined" state would need a separate flag (not built).
  - **i18n:** `notifications.dayTitle/dayBody/dayTurnOn/daySkip/dayDone/dayChangeNote`; new top-level `weekday.short.0–6` + `weekday.long.0–6`; `profile.reminderDay*`. EN + DA (DA first-pass — flag for native review).
  - **Inline `NotificationsCard.tsx` is now unused** (superseded by the modal); left in the repo, safe to delete later.
- **⚠⚠ EDGE FUNCTION NEEDS A SEPARATE DEPLOY — NOT part of the zip→Vercel flow.** `supabase/functions/send-checkin-notifications/index.ts` was rewritten: instead of firing on each prompt's due_date, it now (per UTC day) finds patients whose `notify_weekday == today's weekday`, then their pending prompts (due_date ≤ today, not yet notified → initial; notified ≥ ~6 days ago, still pending, not reminded → reminder), and pushes. **Until this is deployed (`supabase functions deploy send-checkin-notifications`), the chosen day is stored and shown but reminders still behave as before / won't honor the day.** I could not run or test this Deno function here — verify with the `{ "dryRun": true }` POST before relying on it.
- **⚠ QA (cannot verify from here):** modal appears on patient login when no day is set and not after; Skip re-prompts next login; "Turn on reminders" saves the day + drives the push permission flow (incl. iOS install path); settings select changes the day; edge function deploy + dryRun sanity check.

- **Zip:** `treatment-companion-simplify-cockpit-56.zip`  ·  **Tag:** `simplify-cockpit-56`  ·  **Migration: none (DB 0093).** Patient-home + check-in-card layout only, cumulative (supersedes 21–55).
- **Catch-up moved inside the check-in card.** `CheckinPromptCard` gained an optional `catchUp?: ReactNode` prop; the home now passes `<CatchUpCard>` into it instead of rendering it as a standalone sibling. It renders inside the card below the main action, separated by a hairline (`mt-5 border-t border-sage/25 pt-4`), in both the pending and the "all caught up" states. `CatchUpCard`'s own outer row styling was neutralised (`mt-2 border-b border-stone/60 px-0.5 py-3` → `px-0.5`) so the parent controls the divider/spacing. It's only used here, so this is safe.
- **"Takes about two minutes" removed** from the pending check-in card (the `checkinReadyBody` `<p>`). The i18n key `checkinReadyBody` is now unused (left in `en/da` for now; parity unaffected).
- **Visit code moved below the goals button.** The full-width visit-code utility row now sits *under* the "Your goals" button (goals is the more frequent destination; visit code is appointment-only), with `mt-3` separation. Order under the check-in card is now: NotificationsCard (conditional) → Your goals button → visit-code row → treated-muscles link → safety → privacy.
- **Data & privacy link re-centred** (`inline-flex` → `flex w-full justify-center`), per preference.
- Files: `components/cards/CheckinPromptCard.tsx`, `components/cards/CatchUpCard.tsx`, `app/[locale]/page.tsx`. No i18n change; page count unchanged at 62.
- **⚠ QA (cannot verify from here):** the catch-up disclosure expands/collapses correctly *inside* the card and its divider reads well on both the sage (pending) and cream (caught-up) card backgrounds; on a real device the card looks balanced without the two-minutes line; visit-code row below the goals button reads right; centred privacy link looks correct.

- **Zip:** `treatment-companion-simplify-cockpit-55.zip`  ·  **Tag:** `simplify-cockpit-55`  ·  **Migration: none (DB 0093).** Patient-home layout only, cumulative (supersedes 21–54).
- **Visit code moved up.** The footer had three different treatments stacked (full-width goals button, a left-aligned link, a centred visit-code pill) which read as scattered. The "Show visit code" pill is removed from the footer and re-added as a **full-width utility row** (keypad icon + label + `→`, `border-b border-stone/60 py-4`) placed directly under the catch-up card, so the two utility rows group as a pair under the check-in. It stays obvious (full-width, icon, chevron) without competing with the check-in hero or the goals button. Note: the catch-up row is conditional, so on most days the visit-code row sits on its own directly under the check-in card — still a clear spot.
- **Footer simplified.** What remains below the goals button is just the quiet "See which muscles were treated →" link and the safety notice; the "Your data & privacy" link is now left-aligned (`inline-flex`, no `w-full`/`justify-center`) so the whole region shares one left column edge. No centred elements left in that band.
- `app/[locale]/page.tsx` only. No i18n change (reuses `showVisitCode`); page count unchanged at 62.
- **⚠ QA (cannot verify from here):** on a real device, the visit-code row reads as obviously tappable and routes to `/visit-code`; the row looks right both with and without a catch-up above it; the de-scattered footer reads tidy on Firefox mobile.
- _(Process note: first attempt aborted on a script error before writing — marker check `visitRow=0` caught it, nothing was shipped; rebuilt clean.)_

- **Zip:** `treatment-companion-simplify-cockpit-54.zip`  ·  **Tag:** `simplify-cockpit-54`  ·  **Migration: none (DB 0093).** New route + UI restructure, cumulative (supersedes 21–53).
- **Goals moved to their own page.** New `app/[locale]/goals/page.tsx` (patient-only, same auth guards + `usePatientHomeData` source as the home). It holds the goal cards, each goal's read-only `GoalGraphModal`, the sent-suggestion status, the weeks-1–2 progress reassurance, and the "Suggest a new goal" action. Has a "← Home" back link at top (new i18n `patient.home.navHome`, EN "Home" / DA "Hjem"). Builds as `/en/goals` + `/da/goals` (page count 60 → 62).
- **Home (`app/[locale]/page.tsx`) reworked:**
  - The whole inline goals `<section>` (cards, reassurance, pending-status, suggest button) is gone, replaced by one prominent outlined **"Your goals" button** with a live count subtitle (new i18n `patient.home.goalsActiveCount` = `{count, plural, =0 {No goals yet} one {# active goal} other {# active goals}}`; DA first-pass). Button is outlined (`border-sage/50`), deliberately quieter than the filled check-in hero so the check-in stays the primary tap. Routes to `/goals`.
  - **Top tightened** so Start check-in sits above the fold: greeting `text-[30px]` → `text-[24px]`; the "See what was treated" link moved from above the greeting down to below the goals button (quiet reference, `mt-4`). Catch-up card already sat directly under the check-in (unchanged).
  - Visit-code chip kept on the home; the read-only `GoalGraphModal` + `GoalCard` import + `graphGoal` state removed from the home (now only on `/goals`). `TreatedMusclesModal` + `showMuscles` stay (the treated link).
- **⚠ QA (cannot verify from here):** real navigation home→/goals and the "← Home" back button on Firefox mobile; the goals-button count rendering for 0 / 1 / many; that Start check-in now actually clears the fold on a real device; DA strings `navHome` / `goalsActiveCount` need native review (the DA plural for count=1 is first-pass).

- **Zip:** `treatment-companion-simplify-cockpit-53.zip`  ·  **Tag:** `simplify-cockpit-53`  ·  **Migration: none (DB 0093).** Styling only, cumulative (supersedes 21–52).
- **Goal cards = outlined, no fill.** The cockpit-51 bare divided-row treatment read as undefined ("no outlining"); reverted to the alternative discussed: each goal is a card with a full hairline `border border-stone` and transparent interior (the original `p-5` card minus `bg-cream-soft`), text back to 20px. The goals `<ul>` is `space-y-3` again (spaced cards, not `divide-y` rows), and the hairline rule under the "Your goals" heading is dropped (the cards now provide the definition). `GoalCard.tsx` + `app/[locale]/page.tsx` only.
- Catch-up row and safety notice keep their hairline treatment; the check-in card stays the one filled hero. So the hierarchy is now: filled hero → outlined goal cards → quiet hairline rows.
- **⚠ QA:** confirm the goals read as defined outlined cards (not bare rows, not heavy filled blocks) and the page still feels lighter than the original all-filled version.

- **Zip:** `treatment-companion-simplify-cockpit-52.zip`  ·  **Tag:** `simplify-cockpit-52`  ·  **Migration: none (DB 0093).** UI + i18n, cumulative (supersedes 21–51).
- **Patient account menu (`AccountMenu`) de-densified:**
    - Role line (`PATIENT`) hidden for patients (`profile.role !== 'patient'`); kept for clinician/physio/admin.
    - Text size + night mode combined into one bordered **"Display"** section (single heading + two sub-labelled control rows) instead of two separate bordered blocks. New i18n `appearance.displayLabel` (EN "Display" / DA "Visning").
    - Link rows lightened: `font-semibold`→`font-medium`, dividers `border-stone/70`→`/50`, and the tutorial row normalised to `border-b` so dividers don't double up after removals.
    - **Visit code removed from the menu** — the home-screen chip (cockpit-50/51) is now the single entry point. `accountMenu.visitCode` key left unused.
    - **"Your data & privacy" removed from the menu** (it was the one hardcoded-English string) and **moved to a quiet link under the home safety notice**, grouped with it as the two static informational items at the foot of the home. New i18n `patient.home.dataPrivacy` (EN "Your data & privacy" / DA "Dine data og privatliv"). Routes to `/privacy`. Note: privacy is now reachable from the home screen rather than globally from the menu.
    - Profile/settings page reviewed and left as-is (clean settings form, not blocky). Open minor item: for patients the Save button only persists the name while Sex auto-saves on change — left unchanged, can unify later if wanted.
    - **⚠ QA:** open the patient menu — no role line, one "Display" group, lighter link list, no visit-code or privacy rows; the home foot shows the safety notice + a quiet "Your data & privacy" link; both visit-code chip and privacy link route correctly. DA strings first-pass.

- **Zip:** `treatment-companion-simplify-cockpit-51.zip`  ·  **Tag:** `simplify-cockpit-51`  ·  **Migration: none (DB 0093).** Styling only, cumulative (supersedes 21–50).
- **Patient home visual hierarchy** — fixes the "stack of equal filled boxes" look. No logic/i18n changes; classNames only.
    - **One filled hero.** Only the check-in card keeps its fill. Everything below recedes to hairlines so the page reads as a list, not a stack.
    - **Goals = divided list.** `GoalCard` de-filled (was `rounded-card border bg-cream-soft p-5` → `flex … py-4`, text 20→18px); the goals `<ul>` uses `divide-y divide-stone/60`; a hairline rule sits under the "Your goals" heading. Scales cleanly to multiple goals; a new goal with no ratings just omits the graph chip.
    - **Catch-up + safety = hairline rows.** `CatchUpCard` container de-filled to a `border-b` row; `SafetyNotice` de-carded to a `border-t` top-rule (still the headline + "What to do" expander).
    - **Action hierarchy.** "Suggest a new goal" is now an outline button (fill removed); "Show visit code" returns from a bare text link to a small outlined pill chip with a keypad icon — visible/tappable without competing with Suggest.
    - **⚠ QA:** check the home reads as a divided list with the check-in clearly the anchor; confirm long goal text wraps tidily with the read-aloud/graph actions staying right-aligned; confirm the visit-code chip and safety expander still work.

- **Zip:** `treatment-companion-simplify-cockpit-50.zip`  ·  **Tag:** `simplify-cockpit-50`  ·  **Migration: none (DB 0093).** UI-only, cumulative (supersedes 21–49).
- **Patient home (`app/[locale]/page.tsx`, `SafetyNotice`) decluttered** after an element-by-element relevance review:
    - **One cycle-position signal.** Removed the "N check-ins this cycle" line (`CheckinDots` usage + import + `completedWeeksSet`); the "Week N since your last treatment" eyebrow is now the only cycle-position cue. `CheckinDots.tsx` and the `checkinsThisCycle` string are left in place but unused.
    - **Reassurance is occasional.** The "progress comes in ups and downs" paragraph now shows only in weeks 1–2 of a cycle (`data.goals.length > 0 && weekNumber <= 2`) instead of every visit.
    - **Action hierarchy.** "Suggest a new goal" is now a single prominent full-width button; "Show visit code" is demoted to a quiet centered text link beneath it (was an equal-weight half-width button).
    - **"See what was treated" relocated.** Moved from a full-width button at the bottom of the goals section to a quiet link directly under the "Week N since…" treatment line (only when `data.latestTreatment` exists). Opens the same read-only `TreatedMusclesModal`.
    - **Urgent-care notice → headline + expander.** `SafetyNotice` is now a client component: the "Not for urgent care" headline + amber "i" stay always visible with a "What to do ▾" toggle; the emergency-guidance body (and read-aloud) sit behind the tap. **Wording is verbatim/locked** — only presentation changed. New i18n `safety.whatToDo` (EN "What to do" / DA "Hvad du skal gøre", first-pass). Quieter card styling (hairline, lighter fill).
    - **⚠ QA / regulatory:** the safety body is collapsed by default — confirm a headline-always-visible + expandable detail meets the regulatory brief for this urgent-care notice. Also confirm reassurance appearing only weeks 1–2 is the intended rule.

- **Zip:** `treatment-companion-simplify-cockpit-49.zip`  ·  **Tag:** `simplify-cockpit-49`  ·  **Migration: none (DB 0093).** UI + one query field, cumulative (supersedes 21–48).
- **Catch-up week cue fixed and restyled** (`lib/supabase/checkin.ts`, `app/[locale]/checkin`, `WizardLayout`):
    - **Real current-week test.** cockpit-48 gated the cue on `Boolean(promptIdParam)`, but the home page passes `?promptId` on the normal current-week check-in too, so it showed every week. `useCheckinData` now selects `treatment_cycle.start_date` and returns `currentWeek` (same day-0-6=week-1 formula as the home page); the check-in computes `isCatchUp = prompt.weekNumber < currentWeek`. This also correctly flags a default check-in that resolves to an older pending week.
    - **Restyled to an eyebrow (option C).** The boxed "Week 6 check-in" field is removed. `WizardLayout` gained an `eyebrow?: string` prop rendered as a small uppercase amber line at the very top of the content, above the heading. The check-in passes `eyebrow={isCatchUp ? t('catchUpBanner', {week}) : undefined}`, so on a catch-up week it reads e.g. "EARLIER WEEK · WEEK 6" tucked above the goal; on the current week nothing shows. New i18n `patient.checkin.catchUpBanner` (EN "Earlier week · Week {week}" / DA "Tidligere uge · Uge {week}", first-pass). Old `weekBanner` key now unused (left in).
    - **⚠ QA:** open the current week → no week line; open an earlier week from the home catch-up card → eyebrow shows above the goal. Confirm the amber eyebrow reads clearly on the dark patient theme.

- **Zip:** `treatment-companion-simplify-cockpit-48.zip`  ·  **Tag:** `simplify-cockpit-48`  ·  **Migration: none (DB 0093).** UI-only, cumulative (supersedes 21–47).
- **Check-in rating step decluttered** (`app/[locale]/checkin`, `WizardLayout`, `GoalRatingPicker`, `GasGoalRatingPicker`):
    - **Goal is the heading.** `WizardLayout` gained `hideHeader`; the check-in sets it on the goal-rating steps (not the training / comment steps), so the generic "How did this week go for this goal?" title and the "Tap the number…" helper no longer render. The picker's goal text is promoted to the page `<h1>` (22px) with the read-aloud button beside it; the clinician's NRS/GAS question is the single prompt below it.
    - **Previous-rating chip removed.** The "Week N, you rated this X" line is gone from `GoalRatingPicker` (prop + render dropped) — it anchored/biased the new rating. `goal.previousRating` data is untouched, just no longer shown.
    - **Week banner now conditional.** `{weekBanner}` → `{isCatchUp && weekBanner}` where `isCatchUp = Boolean(promptIdParam)`. On a normal current-week check-in (no `?promptId`) it's hidden; on a catch-up week reached from the home page (which routes via `?promptId=X`) it returns as the safety cue. ⚠ Limitation: if a behind patient's default check-in ever resolves to a past prompt with no promptId, the banner won't show — in practice the home page surfaces past weeks as catch-up prompts (promptId), so the default is the current week.
    - **Video button subtitle** trimmed: `addVideoHint` "Optional — film the movement task" → "Optional" (EN) / "Valgfrit" (DA).
    - **⚠ QA:** rating step is much shorter; heading = goal; only the clinician question remains as prose; no previous-score line; week line appears only when you open a catch-up week from home; training/comment steps still show their titles. The "0 · WORST / 10 · BEST" endpoint labels remain hardcoded English in the pickers (pre-existing, not addressed here).

- **Zip:** `treatment-companion-simplify-cockpit-47.zip`  ·  **Tag:** `simplify-cockpit-47`  ·  **Migration: none (DB 0093).** UI-only, cumulative (supersedes 21–46).
- First **patient-facing** change — weekly **check-in** (`app/[locale]/checkin`, phone wizard):
    - **Optional video is now a pop-up.** The inline recorder on a goal's rating step (which made the step tall) becomes a compact button ("Add a short video" / "Video added" once recorded) opening `CheckinVideoModal` (bottom-sheet on phone) with the baseline reference + recorder, kept inside the existing `PatientVideoConsentGate`. Recording lives in the same `videos` state, so closing/reopening keeps it.
    - **Step bar simplified.** `WizardLayout` gained `hideStepBar`; the check-in passes it and drops `stepLabels`, so the named per-step list is gone — only "Step X of X" remains. `suggest-goal` (also uses WizardLayout) is unchanged.
    - New i18n `patient.checkin`: addVideoTitle/addVideoHint, videoAddedTitle/videoAddedHint, videoModalTitle, videoModalDone (EN + DA, DA first-pass). (`tTraining('stepLabel')`/`t('summaryStepLabel')` now unused, left in.)
    - **⚠ QA:** rating step shorter; button opens the pop-up, records, shows "Video added"; wizard top shows only Step X of X.

- **Zip:** `treatment-companion-simplify-cockpit-46.zip`
- **Tag:** `simplify-cockpit-46`  ·  **Migration: none (DB 0093).** UI-only.
- **Cumulative.** Treatment page layout polish:
    - **Title block moved into the rail.** The page heading, "For {patient}"
      subline, and the Therapist-input button were a full-width band above the
      two-pane grid, so the form column started well below the top (visible blank
      gap top-right). They now sit at the top of the left rail, so the grid — and
      the form column's Last-treatment banner — start at the very top. (Expiry
      banner + therapist drawer stay above the grid.)
    - **"Note for the therapist" added to the rail nav** — a conditional nav row
      (when a therapist is engaged) that jumps to the handoff block, which now has
      `id="tsec-handoff"` + scroll-spy. Nav: Session setup · Muscles · Face ·
      Note for the therapist (each shown when relevant).
- **Verified locally:** tsc clean; font-stub 60/60; parity unchanged.
- **⚠ QA on deploy:** no blank band above the form; rail shows title + therapist
  button + total + areas + nav; "Note for the therapist" nav row appears (therapist
  engaged) and jumps to the handoff; layout still collapses on narrow.
- _(superseded)_ `simplify-cockpit-45` · remove Session notes + badge. None.
- **Cumulative.** Two-notes clash resolved (mockups shown; Nikolaj chose option 3
  badge + remove Session notes):
    - **Session notes UI removed** (its `tsec-notes` card + nav entry + scroll-spy
      id). The `notes` state stays fully wired — hydrated from an existing record,
      copied by copy-from-last, and still written on save — so this is reversible
      and loses no stored data; the field is simply no longer shown/editable.
      (Hidden caveat: a value carried in by copy-from-last or an existing record
      will still be re-saved silently.)
    - **Therapist handoff** note now carries a sage **"Therapist only"** audience
      badge beside its title (`handoffAudienceBadge`, EN + DA, DA first-pass), so
      the one remaining note's destination is unambiguous.
    - Section nav is now Session setup · Muscles · Face (notes/total both gone).
- **Verified locally:** tsc clean; font-stub 60/60; parity clean.
- **⚠ QA on deploy:** no Session notes field; therapist handoff shows the
  "Therapist only" badge; copy-from-last + save still work.
- _(superseded)_ `simplify-cockpit-44` · header width + localize. None.
- **Cumulative.** Treatment page fixes from a proper content read:
    - **Header width regression fixed.** `AppHeader` was still `width="mid"` (720)
      after the body went `lg:wide` (1080) in cockpit-43 — Back / End-session sat
      misaligned with the form on large screens. Now uses `maxWidthClass` matching
      the body (`mid` base, `lg:wide`).
    - **Localized strings:** the header **Back** label now uses `t('back')`; the
      relocated rail-total override strings are now i18n (`treatment.muscleSumLabel`,
      `treatment.useTheSum`) in EN + DA (DA first-pass) instead of hardcoded English.
- **Verified locally:** tsc clean; font-stub 60/60; parity clean.
- **⚠ QA on deploy:** on a wide screen the header bar edges line up with the form;
  Back/End-session aligned; total override text shows in Danish when da.
- _(superseded)_ `simplify-cockpit-43` · total de-dup + width. None.
- **Cumulative.** Treatment page content + width:
    - **De-duplicated the total.** The standalone "Total units" form card
      (`tsec-total`) and its nav entry are removed. The rail **running total** is
      now the single place the dose appears; its manual override (auto-sum vs.
      typed value + "use the sum") moved into the rail behind an **"Adjust total"**
      reveal (`showTotalAdjust`). Same state/logic (`totalUnits`, `totalManual`,
      `dosesSum`) — only the home changed, so validation/save are unaffected.
    - **More width.** `mainWidthClass` now `lg:max-w-[var(--max-w-page-wide)]`
      (1080px, matching the cockpit) instead of capping at mid (720px), so the
      two-pane form has room.
    - New i18n `treatment.adjustTotal` (EN + DA, DA first-pass). ("use the sum" /
      "Muscle sum:" remain hardcoded English — pre-existing, carried over verbatim.)
- **Verified locally:** tsc clean; font-stub 60/60; parity clean.
- **⚠ QA on deploy:** total appears once (rail); "Adjust total" reveals the input;
  typing takes manual control and the big number tracks it; "use the sum" resets;
  page is wider on large screens; nav no longer lists Total units.
- _(superseded)_ `simplify-cockpit-42` · last-treatment banner move. None.
- **Cumulative.** Treatment page follow-up to the option-C makeover:
    - **Last treatment** reference + **Copy into form** moved out of the left
      rail and up to a **horizontal banner at the top of the form column**
      (tappable summary + helper on the left, Copy button on the right; stacks on
      narrow). Fixes the cramped Copy button that wrapped in the ~212px rail and
      aligns it with the form cards below.
    - The left rail now carries only the running total, area toggles, and section
      nav. All handlers unchanged (`setShowLastTreatmentModal`, `requestCopyFromPrevious`).
- **Verified locally:** tsc clean; font-stub 60/60; parity unchanged.
- **⚠ QA on deploy:** banner sits above Session setup, aligned with the form
  cards; Copy button is one line (not wrapped); tapping the summary opens the
  last-treatment details; Copy still fills the form; banner stacks on narrow.
- _(superseded)_ `simplify-cockpit-41` · option-C treatment makeover. None.
- **Cumulative.** Treatment-record page (`app/[locale]/clinician/treatment`)
  visual makeover — chosen design **option C** (mockups shown to Nikolaj):
    - **Left rail** (`paneGridClass`/`asideClass`, previously empty strings →
      now a `lg:` two-pane grid + sticky aside): a **running total** rendered
      typographically (`font-display` 32px number + `runningTotalLabel` eyebrow +
      `drug · N muscles` subline, all derived from existing `totalUnits`/`dosesSum`),
      the **area toggles** (Body and neck / Face) moved here as quiet chips
      (replacing the old areas checkbox card; same `includesStandard`/`includesFace`
      state), and a **section nav** that jumps to a section and scroll-tracks the
      one in view (IntersectionObserver, `activeSec`).
    - The muscle-entry section keeps its own name `musclesTitle` ("Muscles
      injected") — the area is "Body and neck", the section is "Muscles injected";
      they are deliberately not the same word (per Nikolaj).
    - Form sections are now **cockpit-style cards** (`tsec-setup`/`-muscles`/
      `-face`/`-total`/`-notes`, 20px `font-display` headings) instead of bare
      `mt-8` headings; **sticky frosted save bar** at the foot.
    - All existing logic preserved verbatim — copy-from-last, edit-lock, validation,
      total override + "use the sum", per-muscle notes, FaceMap, handoff note.
    - New i18n `treatment.runningTotalLabel` (EN + DA, DA first-pass).
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity clean.
- **⚠ QA on deploy (can't verify rendering here):** the rail shows on wide
  screens and sticks while scrolling; nav clicks jump to sections and the active
  item tracks on scroll; toggling Body and neck / Face shows/hides the muscle &
  face sections AND their nav rows; running total updates as doses change; the
  layout collapses to a single column on narrow widths; sticky save bar doesn't
  overlap content.
- _(superseded)_ `simplify-cockpit-40` · guided enable→consent→baseline. None.
- **Cumulative.** Guided **enable → consent → baseline** flow:
    - `VideoProtocolEditor` gained `onEnabled`, fired only on a save that flips
      video from off → on (`!initialEnabled && enabled`).
    - The page then opens `VideoEnableGuide` (new component) for that goal: a
      two-step follow-up — **Step 1 Consent** (the same two checkmarks /
      `set_patient_video_consent` path) and **Step 2 Baseline** (a "Film baseline
      now" CTA, disabled until consent for clinical use is on file, with a hint;
      "Re-film" wording + a note when a baseline already exists). "Do this later"
      dismisses; the goal stays enabled with no recording (a valid state).
    - Filming from the guide opens the existing `BaselineRecorderModal` for the
      goal (its Back → the goal's Video overview, Close → cockpit).
    - New i18n `clinician.videoGuide.*` (EN + DA, DA first-pass; `intro` carries
      ICU `{goal}`).
- **Verified locally:** tsc clean; font-stub 60/60; parity + ICU-arg check clean.
- **⚠ QA on deploy:** open a goal → Video → Edit task → tick *Enable video* →
  Save; the guide should appear; with consent off the Film button is disabled
  and shows a hint; ticking clinical consent enables it and opens the recorder;
  editing an already-enabled goal does NOT trigger the guide.
- _(superseded)_ `simplify-cockpit-39`  ·  per-patient Video toolbar entry +
  Background-card declutter. Migration: none.
- **Cumulative.** Video governance relocated to declutter the Background card:
    - New per-patient **Video** item in the cockpit toolbar (`PatientActionRow`,
      alongside Training / History / Export; camera icon). Opens
      `ClinicianVideoModal` holding the two **consent** checkmarks (recording /
      research) + an **Archived videos** entry.
    - The Background card no longer carries consent checkboxes or the archived
      button (`BackgroundCard` props/labels for those removed) — it's back to
      demographics · treatment · medication.
    - The **per-goal** "Video" button on each goal card is unchanged: it's
      goal-scoped (protocol + that goal's baseline), a different surface from the
      patient-level governance now in the toolbar.
    - New i18n: `clinician.patient.actionVideo`/`actionShortVideo`,
      `clinician.videoPanel.{title,intro,consentHint}` (EN + DA, DA first-pass).
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity clean.
- **⚠ QA on deploy:** toolbar shows a Video item (top + sidebar + narrow row);
  it opens the consent + archive panel; consent edits persist (`set_patient_video_consent`);
  Archived-videos opens from the panel; Background card no longer shows consent.
- _(superseded)_ `simplify-cockpit-38`  ·  Migration: none (DB 0093). UI-only.
- **Cumulative.** Back navigation in the per-goal Video module:
    - Opening **Manage** (baseline) or **Edit task** (protocol) from the Video
      overview previously left only a close button, dropping you back to the
      cockpit. Both editors now take an optional `onBack` and render a **Back**
      button (← ) when opened from the overview; Back returns to the Video
      overview (rebuilt from live goal data, so changes show), while close still
      exits to the cockpit. New i18n `a11y.back` (EN + DA).
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity clean.
- **⚠ QA on deploy:** goal → Video → Manage/Edit task shows a Back button that
  returns to the overview; the overview reflects the change (e.g. a freshly
  recorded/deleted baseline); close still exits fully.
- **Tag:** `simplify-cockpit-37`  ·  **Migration: 0093 (DB 0092 → 0093)** — RUN THE SQL.
- **Cumulative.** Patient-side video consent:
    - **Migration 0093**: `set_own_video_consent(clinical, research)` — patient-only,
      scoped to `current_patient_id()` (mirrors `set_own_sex`, 0055), writing the
      SAME flags the clinician sees so all existing gates reflect it. Adds
      `patient.video_consent_source` ('patient'|'clinician'); the 0091 clinician RPC
      is re-declared to stamp source='clinician'. NOT re-run through the Postgres
      harness (the sandbox wiped the apt install mid-session); it's a near-verbatim
      clone of `set_own_sex` + the verified 0091 pattern. Additive + idempotent.
    - Hooks (`lib/supabase/patientInfo.ts`): `useOwnVideoConsent`,
      `useSetOwnVideoConsent`, `OwnVideoConsent`.
    - **Profile consent section** (`components/settings/VideoConsentSettings.tsx`,
      patient-only): two checkmarks (recording + research) the patient can set or
      **withdraw** any time, with informed text + Save.
    - **Check-in filming gate** (`components/wizard/PatientVideoConsentGate.tsx`):
      wraps the check-in recorder; if recording consent isn't on file it shows an
      informed-consent prompt (record + optional research) and only reveals the
      recorder once the patient consents.
    - i18n: new top-level **`videoConsent`** namespace (patient-facing), EN + DA.
- **⚠ CONSENT WORDING IS FIRST-PASS** — the patient-facing consent text (EN + DA)
  must be reviewed by the study team / DPO and a native Danish speaker before real
  use. It's an attestation in-app; the binding consent process lives in study docs.
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity clean (only_da =
  pre-existing `_meta.*`).
- **⚠ DEPLOY ORDER:** run `0093_patient_video_consent.sql` before/with the zip.
- **⚠ QA on deploy:** (a) as a patient, Profile shows a Video consent section;
  setting it persists and reflects in the clinician cockpit (source = patient);
  (b) in check-in, a video goal in the peak window shows the consent prompt until
  the patient consents, then the recorder; (c) withdrawing in Profile re-gates filming.
- **Video feature complete across both roles.** Remaining: nothing required; the
  consent copy needs human/legal review.
- **Tag:** `simplify-cockpit-36`  ·  **Migration: none (DB 0092).** UI-only.
- **Cumulative.** Per-goal video consolidation (the last item of the video work):
    - The goal-card action row's two video buttons — **Record baseline** and
      **Video task** — are replaced by a single **Video** button.
    - New `components/clinician/GoalVideoModal.tsx`: a per-goal video overview
      with (1) the task protocol (instruction/setup/length, or a "set up video"
      prompt when not enabled) + **Edit task**; (2) the baseline clip with inline
      playback + **Manage** (record/replace/archive/delete); (3) a note that
      check-in clips are reviewed under "Since last visit" + an **Archived videos**
      link. It REUSES the proven editors: its actions hand off to the existing
      `VideoProtocolEditor` / `BaselineRecorderModal` / archive (the hub closes and
      the focused editor opens — no modal stacking, no stale snapshot), so the
      tested flows are untouched.
    - i18n: new `clinician.videoHub` namespace + `clinician.videoProtocol.hubButton`
      (EN + DA).
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity clean (only_da =
  pre-existing `_meta.*`), no ICU mismatches.
- **⚠ QA on deploy:** goal card now shows one **Video** button; it opens the
  overview; Edit task / Manage baseline / Archived videos hand off to the existing
  screens; baseline plays inline when present. (No DB change this build.)
- **Video feature now complete:** consent (0091) · baseline delete · archive
  (0092, archive/unarchive/delete + per-patient view) · per-goal Video overview.
  Remaining follow-up (separate): the patient-app home-filming consent gate.
- **Tag:** `simplify-cockpit-35`  ·  **Migration: 0092 (DB 0091 → 0092)** — RUN THE SQL.
- **Cumulative.** Video archive (stage 2):
    - **Migration 0092**: `archived_goal_video` (clinician-only RLS, like
      treatment_handoff) + `archive_goal_video(goal, source, rating, note)` and
      `unarchive_goal_video(id)`. Archive snapshots the clip's path, clinic score,
      and consent flags, then clears the active reference (rating `video_path` or
      goal `baseline_video_path`) — **the Storage file and the rating's score are
      KEPT**. Archiving **requires clinical consent** (raises otherwise). Permanent
      delete of an archived clip = client-side Storage remove + row delete (0089
      + 0092 DELETE policies). **VERIFIED against a real Postgres harness**
      (stub schema + helpers): archive baseline/rating, score preserved, unarchive
      restores, consent-off correctly errors.
    - Hooks (`lib/supabase/goalVideo.ts`): `useArchivedVideos`, `useArchiveGoalVideo`,
      `useUnarchiveGoalVideo`, `useDeleteArchivedVideo`, + `ArchivedGoalVideo` type.
    - **Per-patient archive view**: `components/clinician/ArchivedVideosModal.tsx`
      — lists archived clips (goal, source, score, consent chips, date) with
      playback, Restore (unarchive), and Delete. Opened from a **"Archived videos"
      button in the Background card**.
    - **Archive actions**: in the clip player (`VideoPlayerModal`, beside Delete —
      the "archive until rated" case) and the baseline recorder (`BaselineRecorderModal`,
      beside Delete). Both gated on clinical consent; the player gets
      `approvedGoalId` + `consentClinical` threaded via `VisitChanges`.
    - i18n: new `clinician.archive` namespace + `clinician.video.archive/archiving`
      + `clinician.baseline.archiveCta` + `clinician.patient.archivedVideosButton`
      (EN + DA).
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity clean (only_da =
  pre-existing `_meta.*`); migration run through Postgres harness.
- **⚠ DEPLOY ORDER:** run `0092_goal_video_archive.sql` in Supabase before/with the zip.
- **⚠ QA on deploy:** (a) with clinical consent ON, the clip player and baseline
  modal show an Archive button; archiving moves the clip to the archive (graph
  point keeps its score); (b) Background card "Archived videos" opens the list;
  Restore returns the clip; Delete removes it permanently; (c) with consent OFF,
  Archive is hidden / errors.
- **NEXT:** the per-goal consolidated "Video" modal (fold "Record baseline" +
  "Video task" into one entry with Protocol/Baseline/Clips) — UI-only, no migration.
  Patient-side home-filming consent gate = separate patient-app follow-up.
- **Tag:** `simplify-cockpit-34`  ·  **Migration: 0091 (DB 0090 → 0091)** — RUN THE SQL.
- **⚠ cockpit-33 was a regression** — it was built on a reset (cockpit-20) base
  and silently dropped builds 30/31/32 (Overview-header New-treatment, the mt-10
  alignment fix, the header 520px cap, the headerBadge chip, the visible rating
  delete). **Discard cockpit-33.** cockpit-34 is rebuilt from the verified
  cockpit-32 base and is fully cumulative. Root cause: the cockpit-33 turn edited
  without re-verifying the working-dir tag after a sandbox reset. Lesson logged in
  §5: ALWAYS verify the HANDOVER tag / markers (or restore from the latest zip)
  before editing, every turn.
- **Cumulative.** Contents of 34:
    - Re-applied **baseline-video delete** (cockpit-33's intended change) onto the
      good base: Delete button + confirm in `BaselineRecorderModal`; hook
      `useDeleteGoalBaselineVideo` (no migration — reuses 0089 storage policy +
      `set_goal_baseline_video('')`).
    - **Patient video consent (stage 1 of the video-archive feature).**
      Migration **0091** adds two patient-level booleans `video_consent_clinical`
      / `video_consent_research` (+ recorded_at/by audit) and RPC
      `set_patient_video_consent` (clinician-only, mirrors `set_patient_medication`
      0061). Loaded into `ClinicianPatientData.patient` and shown as **two
      checkmarks in the Background card** (`onSetVideoConsent` saves both).
      **Baseline filming is gated**: `BaselineRecorderModal` blocks the recorder
      (shows a "record consent first" notice) when `video_consent_clinical` is
      false; an existing baseline can still be viewed/deleted. New i18n:
      `clinician.patient.videoConsent{Title,Clinical,Research}` and
      `clinician.baseline.consentGate{Title,Body,Close}` (EN + DA).
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity clean (only_da =
  pre-existing `_meta.*`), no ICU mismatches. Migration 0091 mirrors the proven
  0061 pattern (NOT yet run through Method D — additive + idempotent, safe to
  re-run).
- **⚠ DEPLOY ORDER:** run `0091_video_consent.sql` in Supabase **before/with**
  deploying the zip (the cockpit selects the new columns; the RPC must exist).
- **⚠ QA on deploy:** (a) Background card shows two consent checkmarks, toggling
  persists; (b) with clinical consent OFF, "Record baseline" shows the consent
  notice instead of the recorder; with it ON, the recorder works; (c) all of
  30/31/32 still present (alignment, header chip, visible rating-delete);
  (d) baseline delete works.
- **NEXT (stage 2):** per-goal "Video" modal + the archive table/RPCs as migration
  **0092** (paired with its UI); per-person archive view = stage 3. Consent gate
  for the patient's own home filming = follow-up (patient app).
- **Tag:** `simplify-cockpit-32`  ·  **Migration:** none (DB **0090**).
- **Cumulative.** Two video fixes:
    1. **Video chip relocated.** The "Video task · baseline set/needed" chip used
       to sit on the goal-card action row and, at 520px, wrapped onto its own line
       above the buttons, pushing them down. `GoalProgressView` now takes an
       optional **`headerBadge?: ReactNode`** rendered in the card header under the
       title; the clinician page passes the video chip there. The action row is
       back to a clean right-aligned button group (`justify-end`). Other
       `GoalProgressView` call sites (physio, onboarding, modal, trend charts) omit
       the prop, so they're unchanged.
    2. **Video delete is now findable.** Delete already existed
       (`useDeleteGoalRatingVideo`, migration 0089) but was a faint amber text link
       at the bottom of the player modal. It's now a **visible outlined button with
       a trash icon**. Reached by opening a video from "Since last visit" → the
       player modal → **Delete** (then a confirm step). NB: this deletes a *rating*
       clip (a graph point). **Baseline videos still have no delete** — only
       re-record via "Record baseline" replaces them. Open question for Nikolaj:
       add a "remove baseline video" action? (would clear `baseline_video_path`).
- **Verified locally:** tsc clean; font-stub 60/60; no new i18n keys (reuses
  `clinician.patient.videoTagBaseline*` and `clinician.video.delete`), parity unchanged.
- **⚠ ENV NOTE:** sandbox reverted twice this session; recovered from the latest
  output zip + `npm ci` each time. Output zips persist and are cumulative.
- **⚠ QA on deploy:** (a) video chip now sits under the goal title inside the card,
  buttons no longer shift; (b) opening a "Since last visit" video shows a clear
  Delete button at the bottom of the player.
- **Tag:** `simplify-cockpit-31`  ·  **Migration:** none (DB **0090**).
- **Cumulative.** This build finally fixes the cockpit alignment, after several
  wrong guesses (22/24/28/29/30). The true causes were two width/margin facts,
  not header-height math:
    1. **The float.** `components/clinician/VisitChanges.tsx` rendered its root
       `<section>` with a baked-in **`mt-10`** (left over from when it sat lower
       in the page). Once it was moved under the Overview header — which already
       wraps it in `mt-4 lg:mt-3` — that `mt-10` dropped "Since last visit" ~40px
       below the header "for no apparent reason." **Removed the `mt-10`**; the
       wrapper now governs spacing, so "Since last visit" lines up with the first
       goal graph (both at header + `mt-3`).
    2. **The right border.** Goal cards are capped at `max-w-[520px]` on the
       `<li>`, but the **Active-goals header row spanned the full 7fr column**, so
       Suggestions / Record a goal were pushed to the far-right column edge, past
       the card's 520px right border. **Capped the header at `max-w-[520px]`** so
       its buttons sit on the card's right border. (The Edit/Record/Video/Retire
       row was already inside the 520px `<li>` and correctly aligned — cockpit-30
       had wrongly restyled that row instead; the chip-on-row layout from 30 is
       kept as it's harmless and tidy.)
- **Verified locally:** tsc clean; font-stub 60/60; i18n parity unchanged.
- **⚠ ENV NOTE:** sandbox reverted again early this session (lost 27→30 working
  state + node_modules); recovered from the cockpit-29 zip + `npm ci`, then
  re-applied 30's edits and these. Output zips persist and are cumulative.
- **⚠ QA on deploy:** (a) "Since last visit" top should align with the first goal
  graph; (b) Suggestions / Record a goal right edge should sit on the goal card's
  right border; (c) "New treatment" is in the Overview header (top bar no longer
  has it).
- **Tag:** `simplify-cockpit-30`  ·  **Migration:** none (DB **0090**).
- **Cumulative.** Latest changes (29→30):
    - **Column alignment via matching headers.** The "Active goals" header has
      buttons (Suggestions / Record a goal) so it was taller than the plain
      "Overview" header, leaving the left card higher. Moved **"New treatment"
      out of the top page header into the Overview header** (right side, same
      `py-2 text-[14px]` button as the goals header). Both headers now have a
      button → equal height → "Since last visit" lines up with the first goal
      graph by structure, not a magic min-height. The top header now holds only
      name / Switch patient / End session / help / account.
    - **Goal-card action row aligned.** The "Video task · baseline …" chip was a
      standalone left-aligned line above a right-aligned button row. Now the
      action row is one `justify-between` flex row: the chip on the left, the
      Edit / Record baseline / Video task / Retire buttons grouped on the right.
- **Verified locally:** tsc clean; i18n parity (unchanged); font-stub 60/60.
- **⚠ ENV NOTE:** the build sandbox reverted again this session (lost cockpit-27→29
  working state + node_modules); recovered by re-extracting the cockpit-29 zip and
  `npm ci`. The outputs zips persist and are cumulative — always restore from the
  latest zip, not the working dir, at session start.
- **⚠ QA:** "New treatment" now sits in the Overview header (not the top bar);
  "Since last visit" top lines up with the first goal graph; the goal-card chip
  and action buttons sit on one row (chip left, buttons right).
- **Tag:** `simplify-cockpit-29`  ·  **Migration:** none (DB **0090**).
- **Cumulative.** Latest changes (28→29): every cockpit column now has a header,
  so they read as parallel and their content tops align via a shared
  `lg:min-h-[39px]` header band (no empty gap — each header has its own text):
    - context column: **"Overview"** (`clinician.patient.overviewTitle`) above
      "Since last visit" + "Background".
    - sidebar rail (side-nav): **"Tools"** (`clinician.patient.railTitle`) above
      Training / History / Export; the header+rail stay sticky as a unit.
    - goals column: existing **"Active goals"**.
  - Labels are easy to rename if wanted (overviewTitle / railTitle).
- **Tag:** `simplify-cockpit-28`  ·  **Migration:** none (DB **0090**).
- **Cumulative** (same full set as cockpit-27 below). **Latest change:** removed
  the empty `lg:min-h-[39px]` alignment band at the top of the context column —
  once the modality pill moved into the Background card it left an empty gap.
  "Since last visit" now leads the context column flush (`mt-4 lg:mt-0`), so its
  top sits level with the "Active goals" heading opposite; the first graph sits
  below that heading as normal. (If graph-level alignment is ever wanted again,
  it would require a non-empty band, which is what caused the gap.)
- **Tag:** `simplify-cockpit-27`  ·  **Migration:** none (DB **0090**).
- **⚠ Why this is a cumulative rebuild.** The build sandbox reset itself between
  builds during the prior session, so the zips tagged 21–26 were each built on a
  reverted base and are **not cumulative** (each is missing pieces of the
  others). This build re-applies the full intended set onto the known-good
  build-20 base in one pass. **Deploy this zip; discard 21–26.**
- **What's in it (the agreed consolidated set):**
  1. "What's still needed" checklist on the new-goal + approve calibration forms,
     shown from the start (no "started" gate). (`RecordGoalForm`, `suggestion`.)
  2. "Video task" chip on video-enabled goal cards
     (`videoTagBaselineSet`/`videoTagBaselineNeeded`, `clinician.patient`).
  3. Compact layout option hidden for **clinicians** (forced wide in
     `useWideLayout`; toggle hidden in `AccountMenu` + `OnboardingWizard`).
     Therapists (`physiotherapist`) unchanged.
  4. Top alignment: empty `lg:min-h-[39px]` band atop the context column keeps
     "since last visit" level with the first goal graph (~line 1026 of
     `clinician/patient/page.tsx`).
  5. **"Since last visit" lists each goal's max-effect only** (goal name + one
     value; GAS shows ±2). No most-recent, no improved/declined verdict.
     (`VisitChanges` rows reshaped; verdict helpers + medication footer removed.)
  6. **Goal graphs stay clean** — no value labels on the line.
  7. **New `BackgroundCard`** below "since last visit": demographics + treatment
     type + medication. The demographics no longer sits in the header sub-line,
     the modality pill is gone from the top of the column, and medication moved
     out of the visit-card footer — all consolidated here. (`PatientBanner` is
     now unused.)
- **Orphaned-but-harmless i18n** (left in place): `visitChanges` `recentLabel`,
  `improved`, `declined`, `chipNoChange`, `noGoalMovement`, plus the unused
  `PatientBanner.tsx` component.
- **Verified locally:** tsc clean; i18n parity (0 mismatches); font-stub 60/60.
- **⚠ QA:** clinician account menu has no wide/compact toggle and the cockpit is
  always two-pane; each video-enabled goal shows a "Video task" chip; the
  calibration forms show the checklist on a blank form; "since last visit" shows
  goal + max effect only with the graphs clean; a Background card sits below it
  with demographics/treatment/medication.

---

### Earlier (pre-rebuild) build sections below are historical — the 21–26 zips are NOT cumulative; prefer cockpit-27.

## 7-old. Latest delivered build

- **Zip:** `treatment-companion-simplify-cockpit-20.zip`
- **Tag:** `simplify-cockpit-20`
- **Migration:** **none** (DB stays at **0090**).
- **Goal-calibration forms now explain a disabled Save.** The audit's "NRS
  cut-off entry" item turned out moot — the clinician never enters cut-offs
  (fixed server-side defaults; `cutoffError` is an orphaned string). The real
  friction was that both calibration forms just greyed out Save with no reason.
  Added a **"what's still needed"** list (mirrors the treatment form) on:
    - **new-goal** (`RecordGoalForm`): lists goal text / SMART / weekly question /
      starting-point+target / all five outcome levels — whatever's missing.
      Keys under `newGoal`: `stillNeededTitle`, `needGoalText`, `needSmart`,
      `needNrsQuestion`, `needNrsRange`, `needAnchors`.
    - **approve** (`/clinician/suggestion`): same idea, keys under
      `clinician.approve` (`stillNeededTitle`, `needGoalText`, `needSmart`,
      `needNrsQuestion`, `needAnchors`).
  - Only shows once the clinician has started (a pristine form isn't nagged).
- **Verified locally:** tsc clean; i18n parity (0 mismatches); font-stub 60/60.
- **⚠ QA:** start a goal (new-goal or approving a suggestion), leave a required
  field blank → a "Before you can save/approve:" list names what's missing;
  fill them and it disappears and Save enables.
- **Audit status:** the cheap/contained items are now done or were already
  handled. Remaining is judgment-call polish only; the highest-value next step is
  a live moderated test (3 per role; patients on phone, clinicians/therapists on
  desktop).

### `simplify-cockpit-19` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-19.zip`. "Session setup" heading
  on the record-treatment form. **Tag:** `simplify-cockpit-19`
- **Migration:** **none** (DB stays at **0090**).
- **Record-treatment page — reads the structure first, then a light fix.** On
  inspection the page is well-organised already: two-pane desktop layout
  (reference left / form right), an **area selector that gates which sections
  render** (standard injections vs face vs both), copy-from-last-treatment,
  per-muscle notes behind tap-to-reveal, and a "what's still needed" helper when
  Save is disabled. So it did **not** need a restructure — only a scannability
  gap: the first four fields (date/drug/dilution/guidance) had no group heading
  while every later block did. Added a **"Session setup"** heading + subtitle so
  the form now reads as labelled groups (Session setup → Injections → Total →
  Notes → Note for therapist). New keys `treatment.sessionSetupTitle/
  sessionSetupSubtitle` (en+da).
- **Verified locally:** tsc clean; i18n parity (0 mismatches); font-stub 60/60.
- **⚠ QA:** on the treatment form the date/drug/dilution/guidance block now sits
  under a "Session setup" heading, matching the Muscles/Total/Notes sections.
- **Audit items still open (recommend dedicated handling):** NRS cut-off entry
  in goal approval (make it stepwise / impossible to enter wrong). The
  record-treatment page is otherwise in good shape; revisit only if live testing
  flags a specific step.

### `simplify-cockpit-18` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-18.zip`. Wearable import leads
  with manual add; CSV under 'advanced'. **Tag:** `simplify-cockpit-18`
- **Migration:** **none** (DB stays at **0090**).
- **Usability-audit follow-through (platform split: clinician/therapist = desktop,
  patient = phone).** Findings from reading the components (not just copy):
    - Goal calibration (`RecordGoalForm`) ALREADY does progressive disclosure —
      model picker, then only the chosen model's fields. No change needed.
    - The patient NRS scale (`GoalRatingPicker`) shows endpoint meanings by
      default; `patient.checkin.scaleTapPrompt` is an orphaned/unused string, so
      the "tap to reveal" friction I'd flagged doesn't actually exist.
    - Mobile cockpit-header density is moot (clinicians/therapists are desktop).
  - **Shipped:** the wearable/observations import (`/clinician/observations`)
    no longer opens with a technical CSV wall. The **simple "Add one
    measurement" form now leads**; the CSV importer moved into a collapsed
    `<details>` (advanced) below it. No copy keys added (summary reuses
    `csvHeading`).
- **Still open from the audit (not done this build):**
    - **Record-treatment page** (`/clinician/treatment`, ~1.5k lines) — the one
      surface that warrants a dedicated structural pass (sectioning / staging,
      clear face-module separation, find-the-save). Too big for a safe blind edit
      at the tail of a long session; recommend its own session.
    - **NRS cut-off entry** in goal approval — make it stepwise/impossible-to-
      enter-wrong instead of free-entry-then-reject. Moderate.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** open a patient's wearable/observations page → the manual add form is
  first; "Import a CSV" is a collapsed disclosure below it.

### `simplify-cockpit-17` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-17.zip`. Lightened goal-Edit copy
  (versioning ceremony removed; data model intact). **Tag:** `simplify-cockpit-17`
- **Migration:** **none** (DB stays at **0090**). Pure copy/UX change.
- **Lightened the goal versioning UX** (keep the data model, drop the ceremony).
  Versioning (0086) is doing real work — every historical rating stays bound to
  the exact calibration it was scored under — so the lineage stays. What felt
  heavy was the Edit drawer *announcing* it. Changed:
    - `editGoal.intro` no longer says "creates version N / keeps version M as
      history" (and no longer interpolates `{version}`/`{next}` — the call is now
      `t('intro')`). It reads: changes apply from here on; past check-ins keep the
      wording + scale they were recorded under, so nothing already scored changes
      meaning. (Honest reassurance, no version ceremony.)
    - `editGoal.save` "Save new version" → "Save changes"; `saved` → "Goal
      updated."; `error` reworded; `carryForwardNote` de-jargoned.
  - Already invisible to the clinician (no change needed): the `v{version}` badge
    (`goalVersionLabel`) is rendered nowhere; the per-goal `GoalHistoryModal` and
    `LinkGoalModal` exist but aren't opened from the cockpit (those buttons were
    removed back in batch 5).
- **Verified locally:** tsc clean; i18n parity (0 mismatches); font-stub 60/60.
- **⚠ QA:** Edit a goal → the drawer reads like a normal edit; the button says
  "Save changes"; on save it says "Goal updated." No "version" wording anywhere
  the clinician can see. (Under the hood it still creates a frozen version.)

### `simplify-cockpit-16` (previous; migration 0090)
- **Zip:** `treatment-companion-simplify-cockpit-16.zip`. Per-goal physician→
  therapist handoff note. **Tag:** `simplify-cockpit-16`
- **Migration:** **0090_goal_handoff_note.sql** — DB moves **0089 → 0090**.
  **Run 0089 then 0090** in the Supabase SQL editor (0089 is safe to re-run if
  already applied from build 15; both are idempotent).
- **Per-goal physician → therapist handoff note** (the second "missing area").
  Adds an optional, short note per (cycle, goal) alongside the per-cycle note
  from 0088 — same narrow downward channel, **never patient-visible** (RLS on
  `goal_handoff_note` has no patient policy by design; reads are role-agnostic
  for an active session; writes are physician-only via `set_goal_handoff_note`).
  - **Author (physician):** treatment page → handoff sage panel → "Goal-specific
    notes" — a short textarea per goal the **therapist has evaluated** this cycle
    (gated on `therapistEvaluatedGoalIds`, matching the #11/#5 rule). Saves on
    blur; emptying clears the row.
  - **Read (therapist):** physio patient page shows the note under each goal
    ("Note from the treating physician").
  - **Hooks:** `useGoalHandoffNotes(cycleId)` (read map, used by both pages) and
    `useSetGoalHandoffNote()` (write). New component `GoalHandoffNotes`. New
    i18n namespace `clinician.goalHandoff` (heading/hint/placeholder/
    fromPhysician, en+da).
  - **Known limitation:** the note is keyed by (cycle, goal-version id). If a
    goal is re-versioned mid-cycle the note stays on the version it was written
    against; acceptable for v1 (flagged).
- **Verified locally:** tsc clean; i18n parity (0 mismatches); font-stub 60/60.
- **⚠ QA:** as physician, evaluate a goal as the therapist first (or use a goal
  the therapist already rated) → on the treatment page the handoff panel shows a
  note box for that goal → type + blur → switch to the therapist view → the note
  appears under that goal. Confirm the patient never sees it.

### `simplify-cockpit-15` (previous; migration 0089)
- **Zip:** `treatment-companion-simplify-cockpit-15.zip`. Clinician clip deletion
  (`clear_goal_rating_video` + storage DELETE policy). **Tag:** `simplify-cockpit-15`
- **Migration:** **0089_goal_video_delete.sql** — DB moves **0088 → 0089**.
  **Run this one in the Supabase SQL editor before/with deploy.**
- **Clinician can delete a saved goal-video clip** (the #4 gap). Until now a
  saved clip could be viewed but never removed by the clinic. Now the video
  player (the check-in/peak clip view, which has the rating id) has a quiet
  "Delete clip" link with a confirm step. On confirm it removes the Storage
  object and clears the rating's `video_path` (and its now-orphaned clinic
  score) via the new `clear_goal_rating_video` RPC.
  - **Migration adds:** `clear_goal_rating_video(uuid)` RPC (access-checked like
    `set_clinic_video_score`) + a Storage **DELETE** policy on `goal-videos`
    scoped to patients the clinician can access (same predicate as the 0062 read
    policy). Patient keeps full manage of their own folder. Baseline clips can be
    cleared via the existing `set_goal_baseline_video(goal, '')` + this policy.
  - New i18n: `clinician.video.delete / deleteConfirm / deleteConfirmCta /
    deleteCancel / deleting` (en+da).
- **Verified locally:** tsc clean; i18n parity (0 key/ICU mismatches); font-stub
  build 60/60.
- **⚠ QA:** open a saved check-in clip → "Delete clip" → confirm → the clip
  disappears from the visit strip / score queue / clinic series; the Storage
  object is gone. Try as a clinician with an active session.

### `simplify-cockpit-14` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-14.zip`. **Option A** restructure
  (header lead CTA, slim banner, medication in visit footer). **Tag:** `simplify-cockpit-14`
- **Migration:** **none** (DB stays at **0088**).
- **Start new treatment is now the header lead action.** Moved from the top of
  the left context column into the page header's right cluster as a sage-filled
  primary button (icon-only on mobile, icon + "New treatment" on ≥sm), with a
  divider before the switch/end/help/account controls. The header is rendered in
  every layout (wide+top, wide+side, narrow), so the CTA is reachable regardless
  of `navStyle`/`wide`. Still opens `NewCycleDialog` (confirm step intact). New
  key `clinician.patient.startNewTreatmentShort` (en "New treatment" / da "Ny
  behandling").
- **Patient banner slimmed to a one-line context.** `PatientBanner` is now just
  demographics + modality badge (no card chrome). Removed the duplicated
  treatment date (it lives in the Since-last-visit anchor) and the
  medication/devices block.
- **Medication + devices moved into the Since-last-visit footer.** `VisitChanges`
  gained optional `medication` / `devices` / `onEditMedication` / `medLabels`
  props and renders a quiet footer (medication + Edit, devices) under the visit
  summary. Edit still opens the medication drawer.
- **Hierarchy:** left column now reads slim context → Since-last-visit
  (prominent) → look-up tools; goals fill the right column.
- The look-up row (history/training/export) is unchanged — it already relocates
  per `navStyle` (header toolbar at top, side rail, or body row).
- **Unused-but-harmless keys:** `startNewCycleActivates`, `startNewCycleHint`,
  `treatmentDate` are no longer referenced (kept in both locales; parity intact).
- **DB needed:** none.
- **Verified locally:** tsc clean; i18n parity (0 key/ICU mismatches); font-stub
  build 60/60.
- **⚠ QA (please eyeball live):**
  - Header: "New treatment" sage button leads the right controls (desktop label,
    mobile icon-only); opens the new-cycle dialog.
  - Patient row is a single quiet line (demographics · modality), no box.
  - "Since last visit" carries Max-effect/Most-recent and now a medication +
    devices footer with an Edit link.
  - Check the header isn't crowded on a narrow phone (5 right-side controls).

### `simplify-cockpit-13` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-13.zip`. Goal graph fills its
  card; card width-bounded (`max-w-[520px]`, tunable). **Tag:** `simplify-cockpit-13`
- **Migration:** **none** (DB stays at **0088**).
- **Goal graph / card width fix.** The earlier 360px cap was on the SVG itself,
  so the chart sat small inside a full-width card with dead space to its right.
  Fix: removed the SVG cap (`max-w-[360px]` → `w-full`) so the graph fills its
  card, and bounded the whole goal card + action row together via
  `max-w-[520px]` on the active-goal `<li>` (so chart, card and the
  Edit/baseline/Video/Retire row share one width). The expand/enlarge modal is
  uncapped, so it still shows a full-size chart.
  - **TUNABLE:** the single number is `max-w-[520px]` on the `<li key={g.id}>` in
    `app/[locale]/clinician/patient/page.tsx` (~line 1231). Lower it (e.g. 440)
    for a more compact card; raise it (e.g. 600) to keep the action row on one
    line. The chart follows the card automatically now.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** active-goal cards are bounded (~520px); the chart fills the card with
  no empty gutter; expand still opens a large chart.

### `simplify-cockpit-12` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-12.zip`. Video task button back
  on the goal card; subtle last-treatment link. **Tag:** `simplify-cockpit-12`
- **Migration:** **none** (DB stays at **0088**).
- **Video task button moved back to the goal card** (reverts the cockpit-6
  #5-video move). It now sits in the goal action row next to Retire
  (Edit · baseline · Video task · Retire) and opens `VideoProtocolEditor` via the
  restored page-level `videoEditorGoal` state. Removed the Video-task button +
  nested editor from `EditGoalDrawer`. (`editGoal.videoTaskButton` key now unused
  but left in place, parity intact.)
- **"Show last treatment" is now a subtle link** (was a bordered button) in the
  VisitChanges header — small sage text, underline on hover.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** goal action row = Edit · (baseline) · Video task · Retire; the video
  task button opens the protocol editor. Edit drawer no longer has a video task
  button. "Show last treatment" reads as a quiet link.

### `simplify-cockpit-11` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-11.zip`. #11 therapist gating.
  **Tag:** `simplify-cockpit-11`
- **Migration:** **none** (DB stays at **0088**).
- **#11 — therapist modules gated on therapist engagement.**
  - **Cockpit (per goal):** already gated by data — a goal only shows the
    therapist overlay (physioRatings) / working-on tag once a therapist has
    evaluated *that* goal. No change needed.
  - **Treatment page:** the **Therapist input** button and the physician→
    therapist **handoff panel** (title + "treatment changed?" + note) now render
    only when `therapistHasEngaged = physioAssessments.length > 0 ||
    therapistSuggestionCount > 0` (the therapist has evaluated or suggested this
    cycle). Until then the physician sees no therapist UI for the patient.
  - **Granularity note:** the handoff note is a **per-cycle** field
    (`treatment_handoff`), so it activates once the therapist engages with the
    cycle (any goal), not strictly per-goal. A true **per-goal** handoff note
    would need a schema change (migration) — flagged for Nikolaj if he wants it.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** a patient with no therapist activity shows NO therapist input button
  and NO handoff panel on the treatment page; once a therapist evaluates or
  suggests, both appear.

### `simplify-cockpit-10` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-10.zip`. Training day-list shows
  directly in the drawer. **Tag:** `simplify-cockpit-10`
- **Migration:** **none** (DB stays at **0088**).
- **Training day-list no longer nested-collapsible.** `TrainingOverview` was a
  collapsible card; inside the training drawer that was a menu-in-a-menu. Made it
  non-collapsible — the week×day grid (and legend) now render directly under a
  static summary header, so opening the Training drawer shows the day-list at
  once. Removed the toggle button/chevron/`open` state/`useId`. (Used only in the
  cockpit training drawer, so no other call site affected.)
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** open the Training drawer → the day grid shows immediately (no
  expand/collapse step).

### `simplify-cockpit-9` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-9.zip`. #9b therapist→treatment
  page. **Tag:** `simplify-cockpit-9`
- **Migration:** **none** (DB stays at **0088**).
- **#9b — therapist input relocated to the treatment page.** New
  `components/clinician/TherapistInputPanel.tsx` holds the therapist activity
  (visit days + adjustment requests) and the goal/muscle suggestions with the
  consider/dismiss actions (the two `Physio*SuggestionActions` helpers moved into
  it). On the **treatment page** a counted, Suggestions-style button
  (badge = `physioGoalSuggestions.length + physioMuscleSuggestions.length`) opens
  it in a `CockpitPanelDrawer`. Data comes from the `useClinicianPatientData` the
  treatment page already loads — no new query. New key
  `treatment.therapistInputButton` (en+da).
- **Removed from the cockpit:** the therapist (physio) action-row button, the
  physio panel, the two suggestion-action helpers, and `'physio'` from the
  `openPanel` type. `onActionSelect` narrowed (only Training opens a panel now;
  medication is edited from the background field, physio is on the treatment
  page). The `physio` icon/id remain in PatientActionRow (harmless, unused).
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60; en/da parity intact.
- **⚠ QA:** cockpit action row = Training · History · Export (no therapist
  button). On the treatment page, the **Therapist input** button shows a count
  badge when suggestions exist and opens the panel (activity + suggestions, with
  consider/dismiss working). Drawer closes on backdrop click.

### `simplify-cockpit-8` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-8.zip`. Graph width cap +
  last-visit max-effect. **Tag:** `simplify-cockpit-8`
- **Migration:** **none** (DB stays at **0088**).
- **Goal graph width capped.** `GoalProgressView`'s SVG was `w-full` and scaled
  UP on the wide desktop column (native viewBox is 360×160), making it oversized.
  Added `max-w-[360px]` so it renders at native size on desktop and still shrinks
  on narrow screens. (The enlarged view uses a separate `GoalGraphModal`, so it's
  unaffected.)
- **Last-visit section shows Max effect + Most recent.** `VisitChanges` per-goal
  row previously showed only the most recent measurement; now it shows both the
  **peak (max effect)** and the **most recent**, with labels. Peak is
  direction-aware (max when higher-is-better, min when lower-is-better — GAS and
  NRS directions respected). New keys `visitChanges.peakLabel` /
  `visitChanges.recentLabel` (en+da).
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60; en/da parity + 0 ICU
  mismatches.
- **⚠ QA:** desktop goal graphs are no longer stretched. The since-last-treatment
  rows show two values (Max effect, Most recent) plus the trend chip.

### `simplify-cockpit-7` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-7.zip`. Backdrop-close + bg-field
  cleanup. **Tag:** `simplify-cockpit-7`
- **Migration:** **none** (DB stays at **0088**).
- **Drawers/modals now close on backdrop click.** `useModalA11y` only handled
  Escape; added an `onClick` backdrop handler (`e.target === e.currentTarget →
  onClose`) to CockpitPanelDrawer, RecordGoalDrawer, EditGoalDrawer,
  LastTreatmentModal and TreatedMusclesModal. (VideoProtocolEditor already did
  this via onClick+stopPropagation.)
- **Patient-background field (`PatientBanner`) cleaned up.**
  - Removed the patient-name restatement (and its open-info button) — the name
    already sits in the page header. Dropped `name`/`onOpenInfo`/`openInfoAria`.
  - **Medication moved here**: the banner always shows the medication line with
    an **Edit** button (opens the existing medication drawer via
    `onEditMedication`), and the **medication button was removed from the action
    row**. Reused `medEdit` / `medNotRecordedYet` labels.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60; en/da parity intact.
- **⚠ QA:** click outside any drawer (e.g. Training) → it closes. The background
  field shows demographics + modality + treatment date + medication(+Edit)
  +devices, with NO duplicated patient name. Edit opens the medication drawer.

### `simplify-cockpit-6` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-6.zip`. #5 video-under-Edit + #8
  show-last-treatment. **Tag:** `simplify-cockpit-6`
- **Migration:** **none** (DB stays at **0088**).
- **#5 video task → under Edit goal.** The goal card's separate "video protocol"
  button is gone. `EditGoalDrawer` now has a **Video task** button that opens the
  existing `VideoProtocolEditor` (nested over the edit drawer); it still operates
  on the current goal id, so no change to goal-versioning behaviour. Removed from
  `clinician/patient/page.tsx`: the card video button, the page-level
  `videoEditorGoal` state + `VideoProtocolEditor` render + import. (The baseline
  RECORD button stays on the card — it's a recording action, not task config.)
  New key `editGoal.videoTaskButton` (en+da).
- **#8 "Show last treatment" dialog.** The "since last treatment" section
  (`VisitChanges`) now shows a **Show last treatment** button when a treatment is
  recorded for the cycle. New `LastTreatmentModal` renders that treatment
  read-only (date · drug · units · guidance, standard + face injection lists,
  notes), reusing the `ehrExport` label vocabulary so wording matches the export.
  Wiring: `VisitChanges` gets an optional `onShowLastTreatment`; the cockpit holds
  `showLastTreatment` state and maps its `treatment` object to the `LastTreatment`
  shape (isFace = posX != null). New `lastTreatment` namespace (title, button).
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60; en/da parity + 0 ICU
  mismatches.
- **⚠ QA:** (#5) open a goal's **Edit** → **Video task** opens the protocol
  editor; the card no longer has its own video button. (#8) in the
  since-last-treatment section, **Show last treatment** opens a dialog with the
  injection record; hidden when no treatment is recorded.

### `simplify-cockpit-5` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-5.zip`. #6 overlap fix + goal
  'Edit' regroup. **Tag:** `simplify-cockpit-5`
- **Migration:** **none** (DB stays at **0088**).
- **#6 overlap FIXED.** The screen-reader data table added in `audit-fixes`
  (GoalProgressView, `className="sr-only"`) was rendering VISIBLY in production
  and colliding with "Tap a point for details." (`.sr-only` is emitted in the
  built CSS but wasn't hiding it reliably.) Removed the table, its `tableId`,
  and the svg's `aria-describedby`. The chart keeps its descriptive aria-label,
  so basic screen-reader support remains. (The four now-unused `a11y.chart*`
  table keys are left in the catalogue — harmless, parity intact.)
- **Goal-card button: "Recalibrate" → "Edit", regrouped.** `editGoalCta` (and
  the EditGoalDrawer eyebrow/title) renamed Recalibrate→Edit (en+da). The Edit
  button was a standalone row above the chart; it now sits in the goal's action
  row alongside the video-task and Retire buttons (Edit · video · retire).
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** under each goal graph there should be NO stray "Weekly ratings
  data…/Week/Rating" text. The goal action row reads Edit · (video) · Retire.

### `simplify-cockpit-4` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-4.zip`. Action panels → side
  drawers. **Tag:** `simplify-cockpit-4`
- **Migration:** **none** (DB stays at **0088**).
- **#9a + #10 — action panels → side drawers.** The medication, training and
  therapist-input panels used to open as inline `<section>`s in the left column
  ("in the middle of everything"). New shared `CockpitPanelDrawer` (mirrors
  `RecordGoalDrawer`: overlay + right slide-over + focus trap + scroll) now
  hosts all three. Converted in place — each panel's content/heading is
  unchanged, just wrapped in the drawer and lifted out of the column flow
  (position:fixed). The action-row buttons open the drawer; close returns.
  - #10 medication: now a drawer (non-intrusive). ✅
  - #9a training: now a drawer. ✅
  - physio/therapist input: now a drawer too (no longer center-panel). The
    REMAINING part of #9 — relocating therapist input OFF the cockpit ONTO the
    treatment page — is still to do (#9b); kept as a drawer in the interim so
    the clinician doesn't lose visibility of adjustment requests.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA (visual — can't test here):** open each action-row item (medication,
  training, therapist input) → it should slide in from the right as a drawer,
  not push a panel into the left column. Check the medication edit/save flow and
  the training overview render correctly inside the 520px drawer.

### `simplify-cockpit-3` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-3.zip`. #3 night-mode fix.
  **Tag:** `simplify-cockpit-3`
- **Migration:** **none** (DB stays at **0088**).
- **#3 night-mode FIXED.** Root cause: `ThemeApplier` only honours a saved
  `night_mode` once a palette has been explicitly chosen
  (`hasSavedChoice = colorScheme != null`). A user who never opened the palette
  picker would toggle night → optimistic apply flashes it on → `refreshProfile`
  re-runs ThemeApplier → `hasSavedChoice` still false → it falls back to the OS
  preference and reverts. Net effect: "nothing changes" (the reported symptom).
  Fix: `useSetNightMode` now persists a concrete palette
  (`resolvePaletteId(currentPalette)`, default 'green') alongside `night_mode`,
  so the choice sticks and ThemeApplier respects it. (Picking a palette already
  set `color_scheme`, so that path was unaffected; only the night-only path was
  dead.) One file: `lib/supabase/colorScheme.ts`.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** with the OS in light mode and no palette ever picked, toggle night —
  the app should go dark and STAY dark (and survive a reload). Toggle back →
  day.

### `simplify-cockpit-2` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-2.zip`. #2a read-aloud refresh
  fix; #4 muscle→function DRAFT. **Tag:** `simplify-cockpit-2`
- **Migration:** **none** (DB stays at **0088**). Batch 2 of cockpit
  simplification (backlog + status in §8).
  - **#2a read-aloud FIXED:** `useSetReadAloud` was calling
    `invalidateQueries(['auth'])`, but the profile lives in AuthProvider's
    `useState`, not a react-query cache — so the toggle persisted to the DB but
    never refreshed in memory (button never appeared until a full reload). Now
    uses `refreshProfile()` like the palette/night setters.
  - **#3 night-mode INVESTIGATED, no fix yet:** the logic is sound —
    `night_mode` round-trips through the profile correctly, `resolveColors`
    returns proper dark sets, the compiled utilities use `var(--color-*)` (so
    runtime overrides DO apply — verified in the built CSS), and there are no
    stray non-token colours on the main surfaces. Could not reproduce
    "doesn't work properly" from the code. **Needs the specific symptom from
    Nikolaj** (nothing changes / some areas stay light / flashes or reverts on
    reload) before a correct fix.
  - **#4 muscle→function mapping DRAFT** delivered at
    `docs/muscle-function-mapping-DRAFT.md`. Key finding: body muscles are
    **free text** (no catalogue), so this needs a structured muscle catalogue
    with patient-function labels. Draft is for Nikolaj's clinical correction;
    once verified it becomes the catalogue + treatment-page picker, and
    `TreatedMusclesModal` switches to the function text.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60; confirmed
  `.bg-cream{background-color:var(--color-cream)}` in the built CSS.
- **⚠ QA:** turn read-aloud on in a patient's Appearance settings → the speaker
  button should now appear on patient text WITHOUT a reload.

### `simplify-cockpit-1` (previous; no migration)
- **Zip:** `treatment-companion-simplify-cockpit-1.zip`. **Tag:** `simplify-cockpit-1`
- **Migration:** **none** (DB stays at **0088**). Batch 1 of the cockpit
  simplification (see §8 "Simplification backlog" for the full 11-item list +
  status). Low-risk declutter only:
  - **#1** sex vs gender: "sex" confirmed correct and already used everywhere —
    no change.
  - **#2b** read-aloud toggle now renders only for patients (Appearance
    settings); clinicians/therapists don't see it.
  - **#5** goal cards: removed Goal-history + Goal-link buttons + version label
    (and their dead modals/state/imports). Edit + retire remain. History/Link
    components kept in the tree. (Video-task-under-Edit still pending.)
  - **#7** ITB removed from the cockpit (track + goals section + record drawer).
    `ItbTrack`/hooks stay in the tree — functionality intact, just not shown.
- **DB needed:** none.
- **Verified locally:** tsc clean; font-stub build 60/60.
- **⚠ QA:** goal cards show only Edit + retire; no ITB UI on the cockpit and ITB
  goals don't leak into the main list; patient Appearance has read-aloud,
  clinician/therapist don't.

### `ehr-localized` (previous; no migration)
- **Zip:** `treatment-companion-ehr-localized.zip`. EHR-paste export fully
  localised via the `ehrExport` namespace (en+da). **Tag:** `ehr-localized`
- **Migration:** **none** (DB stays at **0088**). Cumulative on top of
  `audit-fixes` (same working tree; that build is summarised in §7b).
- **Change:** the EHR-paste export (`lib/ehrExport.ts`) is now **fully
  localised**. Previously only the dates followed locale; every label and
  sentence fragment was hardcoded English. `buildEhrExport` now takes a
  translator (`ExportTranslator`) and renders the whole note from the new
  **`ehrExport`** message namespace (42 keys, en+da). ICU plurals
  (`# week`/`# weeks` → `# uge`/`# uger`), week markers (`W` → `uge`), units,
  side codes (L/R/B → V/H/B) and the GAS/NRS sentence all switch with the app
  locale. The call site (`clinician/patient`) passes `useTranslations('ehrExport')`.
  Danish is a first pass — **flag for native-speaker review** (esp. the GAS/NRS
  sentence wording, side codes V/H, and "Peak").
- **DB needed:** none.
- **Verified locally:** `tsc --noEmit` clean; production build OK via the
  font-stub procedure, **60/60 pages**; en/da parity re-checked (1368 keys/side
  + 2 da `_meta`), **0 ICU-argument mismatches**; the new ICU strings
  smoke-formatted in both locales (plurals + interpolation render correctly).
- **⚠ QA / open:** **content** of the EHR note still needs work (your call — see
  §8). Skim a Danish-locale export for wording. The Danish strings are a first
  pass.

### `audit-fixes` (previous; no migration)
- **Zip:** `treatment-companion-audit-fixes.zip`. **Migration:** none.
- **Change:** remediation pass implementing the concrete code/copy findings from
  four audits (`all-roles-workflow`, `i18n-parity`, `clinician-cockpit-
  accessibility`, `data-output-correctness` — all in `docs/audits/`). No schema
  change. Highlights:
  - **EHR export (`lib/ehrExport.ts`):** fixed the [High] false "clear
    wearing-off" — the return-to-baseline clause now requires an actual rise
    (`peak > initial`), so a stable/flat-good series no longer reports
    wearing-off. "Sustained N weeks" now breaks on calendar gaps as its doc
    claims. Lower-is-better NRS goals get a "NRS: lower is better" note so the
    raw value isn't misread. Added a reconciliation line when per-injection
    doses don't sum to the recorded total. `default` cases on the label
    switches. `buildGoalSentence` now takes the goal (for kind/direction).
  - **i18n leaks keyed (en+da):** the physio-suggestion action toasts + buttons
    + status labels (`clinician/patient`), the whole `ExportModal`
    (`clinician.export.*`), and `GoalProgressView`'s chart aria-label, legend,
    and week captions (`a11y.chart*`, `treatment.chart*`). Danish fixes:
    `visitChanges.checkinCount` plural now translated; `treatment.forPatient` →
    "Til {name}" (pending native review).
  - **Accessibility:** cockpit now has an `<h1>` (patient name); each goal chart
    has a visually-hidden data table via `aria-describedby` (real values for
    screen readers); `useModalA11y` now locks body scroll for the modal's
    lifetime.
  - **Cross-role legibility:** the start-cycle button now states it activates
    the patient's weekly check-ins and the therapist's progress reporting (the
    workflow audit's [High] headline).
- **DB needed:** none.
- **Verified locally:** `tsc --noEmit` clean; production build OK via the
  font-stub procedure, **60/60 pages**; en/da catalog parity re-checked (1326
  keys each side + the 2 `_meta`), **zero ICU-argument mismatches**.
- **⚠ QA (can't test here):** the `<h1>` + chart data-table need a screen-reader
  pass; body-scroll-lock and the new copy need an on-device look; confirm the
  EHR wearing-off wording on a real stable-good patient series.

---

## 7b. Previous delivered builds

- **`physician-therapist-note`** — zip
  `treatment-companion-physician-therapist-note.zip` (migration **0088**). First
  downward clinic→therapist channel: a short physician note + "treatment changed
  this visit?" flag in a dedicated `treatment_handoff` table (no patient SELECT
  policy → never patient-visible), via the clinician-only `set_treatment_handoff`
  RPC. Shown to the therapist high on `physio/patient`. Full write-up in §5.13.
  DB-verified on throwaway PG16.

- **`goal-link`** — zip `treatment-companion-goal-link.zip` (migration 0087).
  Link a goal onto an existing lineage as its newest version: per-goal **Link**
  button → `LinkGoalModal`, `link_goal_to_lineage` RPC (clinician-only, same
  patient + kind, freeze-then-move). Completes the goal-versioning epic
  (0086 foundation + goal-edit + goal-history + goal-link). A cross-version
  *chart* remains deferred (history modal shows per-version chips). DB-verified.
- **`goal-history`** — zip `treatment-companion-goal-history.zip` (no
  migration). Per-goal History modal: version timeline by lineage with frozen
  wording/calibration + patient/therapist rating chips per version
  (`useGoalHistory`).
- **`goal-edit`** — zip `treatment-companion-goal-edit.zip` (no migration).
  Recalibrate button + EditGoalDrawer call edit_goal to create a new goal
  version at a visit; goal carries lineageId/version.
- **`goal-versioning`** — zip `treatment-companion-goal-versioning.zip`
  (migration 0086). Versioning foundation: lineage/version/superseded columns +
  lineage-default trigger + `edit_goal` RPC + live-version read filter.
  DB-verified locally.
- **`therapist-cycle-agnostic`** — zip
  `treatment-companion-therapist-cycle-agnostic.zip` (migration 0085). Therapist
  can suggest a goal before the first cycle; physio-suggestion submit RPCs no
  longer require an active cycle; physician read widened to null-cycle.
- **`therapist-status-echo`** — zip `treatment-companion-therapist-status-echo.zip`
  (no migration). Therapist sees the physician's status (awaiting / will take
  forward / considered / not this time) on their goal + muscle suggestions,
  under the Suggest panels.
- **`therapist-gas-rating`** — zip `treatment-companion-therapist-gas-rating.zip`
  (migration 0084). Therapist rates GAS goals against their anchors via a new
  `gas_value` column; both chart overlays corrected to plot GAS from gas_value
  and NRS via nrsToGas.
- **`therapist-signals-physician`** — zip
  `treatment-companion-therapist-signals-physician.zip` (no migration). Surfaces
  the slice-1 signals to the physician: therapy visit-day strip (count +
  weekday strip), "working on this" chips on goals, adjustment-requests list.
- **`therapist-signals`** — zip `treatment-companion-therapist-signals.zip`
  (migration 0083). Capture slice: per-goal "working on this" + "needs treatment
  adjusted" (+ short note) flags in the therapist progress form; visit
  auto-registers on submit; nrs_value nullable; overlay builders skip null-NRS
  rows.
- **`audit-followups`** — zip `treatment-companion-audit-followups.zip` (no
  migration). Remaining patient-audit items: signup expectation note,
  onboarding visit-before-checkin order, home progress reassurance. (Most other
  audit items were already handled.)
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

### Simplification backlog (the 11-item declutter list — track here)
Status as of `simplify-cockpit-1`. "We expanded too much" — this list drives the
trimming. ✅ done · ◑ partial · ☐ todo · 💬 needs a decision/draft from Nikolaj.

1. ✅ **Sex vs gender** — "sex" is correct (biological/clinical) and already used
   throughout; no "gender" leak.
2. ✅ **Read-aloud** — #2b toggle patient-only; #2a FIXED (the toggle used a
   no-op `invalidateQueries` instead of `refreshProfile`, so it never took
   effect without a reload).
3. ✅ **Night-mode** — FIXED. Symptom was "nothing changes" for users who never
   picked a palette: ThemeApplier ignored saved night_mode (fell back to OS) so
   the toggle reverted. `useSetNightMode` now commits the resolved palette too.
4. ⏸ **Patient-facing muscle names → function language** — PARKED at Nikolaj's
   request. DRAFT ready (`docs/muscle-function-mapping-DRAFT.md`) for when we
   return; body muscles are free text → needs a structured catalogue.
5. ✅ **Goal-graph actions** — history + link removed; "Recalibrate"→"Edit"
   regrouped; video-task config moved under Edit goal (card's separate video
   button dropped; Edit drawer has a "Video task" button opening the protocol
   editor). Baseline-record button intentionally left on the card.
6. ✅ **Overlapping text under the goal graph** — was the `audit-fixes`
   screen-reader data table rendering visibly (sr-only not hiding it); removed
   it. (Chart aria-label retained for basic a11y.)
7. ✅ **ITB off the front page** — removed from cockpit; functionality kept.
8. ✅ **"Show last treatment"** — button in the since-last-treatment section
   opens `LastTreatmentModal` (read-only injection record). Hidden when no
   treatment recorded.
9. ✅ **Action panels → side drawers** — #9a drawers; drawers close on backdrop
   click; #9b therapist input moved OFF the cockpit ONTO the treatment page as a
   counted, Suggestions-style button opening `TherapistInputPanel`.
10. ✅ **Medication** — now opens as a side drawer (CockpitPanelDrawer) instead
    of a centre panel in the left column.
11. ✅ **Therapist modules gated on engagement** — cockpit per-goal display was
    already data-gated; the treatment-page Therapist-input button + handoff panel
    now show only once a therapist has evaluated/suggested this cycle. (Handoff
    note is per-cycle; true per-goal note would need a migration — see §7.)

### Front-page refinements (from session feedback)
- ✅ Drawers close on click-outside.
- ✅ Background field: no name restatement; medication shown with Edit; med
  action-row button removed.
- ✅ **Therapist action button** removed from the cockpit; therapist input now on
  the treatment page (counted button).
- ✅ **Training day-list** now shows directly in the training drawer
  (TrainingOverview made non-collapsible) — no menu-in-a-menu.
- ✅ **Goal graphs too wide on desktop** — capped GoalProgressView SVG at
  `max-w-[360px]` (native size).
- ✅ **Last-visit section** now shows Max effect (peak) + Most recent per goal.

### Other open items (pre-existing)

**Audit remediation (`audit-fixes`) — what's now done, what's left.** Four
audits live in `docs/audits/` (`all-roles-workflow`, `i18n-parity`,
`clinician-cockpit-accessibility`, `data-output-correctness`). The
`audit-fixes` build implemented every concrete code/copy finding (EHR
wearing-off/sustained/NRS-direction, units reconciliation, switch defaults; all
i18n leaks keyed en+da incl. the chart/legend/caption and `ExportModal`; cockpit
`<h1>`, chart data-table, modal scroll-lock; start-cycle dependency copy). **Not
done — these are deliberate decisions / a separate feature, not code I should
have decided unilaterally:**
- **Adjustment-request status loop** *(feature, needs a migration)* — give the
  therapist's "needs treatment adjusted" flag a status the physician sets and
  the therapist sees echoed (the workflow audit's #2; mirrors how goal/muscle
  suggestions already echo). Its own slice: status column + RPC + cross-role UI.
- **REDCap dictionary reconciliation** *(decision)* — the dictionary defines
  check-in fields the app doesn't collect (`ci_pain/stiffness/spasm_freq/
  daily_care/side_effects`), exports goal free-text without a PII flag while
  `tx_notes` was dropped, models guidance per-muscle vs the app's per-session,
  and exports exact dates + birth_year (quasi-identifiers). All need your /
  the study team's / the DPO's call before any push is built. The push itself
  is **not built** — the dictionary is a spec.
- **EHR-text language** — ✅ RESOLVED in `ehr-localized`: the export now follows
  the app locale (en/da) via the `ehrExport` namespace. Danish is a first pass,
  pending native review.
- **EHR-text content** *(your call — open)* — the *content/structure* of the
  note still needs work. Candidates surfaced (data exists, not yet shown): goal
  baseline→target + SMART text + how retired goals ended; therapist input
  (visit days / worked-on / adjustment requests); clinic-video results; ITB
  dose changes; and whether the dense GAS/NRS shorthand should read as plainer
  prose. Awaiting direction before reshaping the builder.

**Recently completed epics (this session) — context for what's now done:**
- **Therapist-signals epic — COMPLETE.** Driven by `therapist-workflow-audit.md`.
  Capture (days auto-register from dated assessments, per-goal "working on" +
  "needs treatment adjusted" + note; 0083) → surface to physician (visit-day
  strip, working-on chips, adjustment-requests list) → GAS-aware therapist
  rating (0084) → suggestion status echo to the therapist → cycle-agnostic
  therapist suggestions (0085). Low-intensity by design: taps + one short
  reason, no double documentation (therapists keep their own EMR).
- **Goal-versioning epic — COMPLETE.** A goal is a *lineage* of frozen
  versions; editing recalibrates at a visit by creating the next version and
  freezing the prior (so past ratings stay bound to the calibration they were
  made under). 0086 foundation (lineage/version/superseded + lineage-default
  trigger + `edit_goal` + live-version read filter) → `goal-edit` (Recalibrate
  drawer) → `goal-history` (per-goal version timeline) → `goal-link` / 0087
  (merge an accidentally-separate goal into a lineage). 0086 & 0087 were
  DB-verified locally (§5.12 D).

**Open design decisions from this session (decided, mostly NOT built):**
- **Cycle-agnostic measurements — investigated, decided AGAINST.** Conclusion:
  after the first injection there is always exactly one active cycle (a cycle
  is completed only when the next one starts, atomically; the patient check-in
  completes the *prompt*, not the cycle), and goals are recalibrated per cycle.
  So "the active cycle" is unambiguous and measurements stay cycle-tied;
  date-derivation would add risk near the second-active-cycle landmine for no
  behavioural gain. Do NOT build the nullable-cycle/derive-by-date refactor for
  measurements. (Suggestions are the exception and are already cycle-agnostic,
  because a suggestion can precede the first cycle.)
- **Physician→therapist focus note — ✅ SHIPPED** as `physician-therapist-note`
  (0088, §5.13). The short physician note + change flag, therapist-only and
  never patient-visible. Remaining nice-to-haves (not built): echo the note
  back to the physician on the clinician patient page (today they re-open the
  treatment form); threading / multiple notes per cycle; a read receipt.
- **Persistent / recurring therapist access — PROPOSED, not built.** The
  per-visit code fights a weekly community-therapist relationship (re-unlock
  every visit, no after-session write-up window). A longer-lived, consent-based
  therapist↔patient link or roster would fit better, but it touches the consent
  model — its own careful decision.
- **Adjustment-request status loop — open.** The therapist's "needs treatment
  adjusted" flags have no status field, so there's nothing to echo back yet
  (unlike goal/muscle suggestions, which now echo). Would need a status column.
- **Cross-version goal chart — deferred.** A single chart across versions
  (continuous NRS line / per-version GAS segments). The history modal shows
  per-version rating chips instead; the chart is a clean future enhancement.

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
