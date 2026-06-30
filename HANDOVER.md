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
> _Last updated: **2026-06-15 - clean handover, deploy applied.** Current assessment: `docs/ASSESSMENT-2026-06-15.md` (supersedes `ASSESSMENT-2026-06.md`). This session shipped six deliveries (next16-upgrade-1 / secdef-harden-1 `0108` / e2e-autorun-1 / deps-secfix-1 next-intl 4.13.0+Dependabot / sentry-enable-1 / audit-followups-1 `0109`+FORCE-RLS-decision) - **all now applied live by Nikolaj** (0108+0109 run, Sentry DSN set, deps committed + Dependabot toggles on, renamed-away files deleted) **except backups**, the one remaining operational item (Supabase Pro + PITR + a tested restore). Of the things in Nikolaj's control, backups is the last open item before the external gates (regulatory/DPO sign-off, native-Danish clinical review). **Process note: trust the repo/filesystem over any carried summary.** See section 7 + the top of section 8._
>
> _**Update 2026-06-15 (later) — `studies-and-fixes-1`:** new migration **`0110_studies.sql`** (study + study_membership, admin-gated RPCs, study_overview) adds an admin "Studies / Study patients" view — group consented patients into studies and pick them out by REDCap record_id; membership is orthogonal to consent and does **not** change the consent-gated export. Plus five patient-surface fixes (profile language now persists + Back is locale-aware; login honours browser language via next-intl `localeDetection`; DOB picker no longer squished; account-menu navigation works from the check-in wizard). Migrations now **0001-0111** — run `0110`. Build 0110 Method-D verified (15 cases), font-stub build clean, tsc clean, i18n parity (en/da/sv/nb). See §7._
>
> _**Update 2026-06-15 (later still) — `rls-denial-tests-1`:** a runtime RLS-denial test suite now runs in CI (real policies, impersonatable `auth.uid()`): cross-patient isolation, clinician-session gating incl. the 1-hour staleness cutoff, anonymous denial, the 0096 care-team-note boundary, and admin-only `study` tables — each with a positive control, negative-control validated. **No app/migration change** (test infra + CI only). It surfaced a documentation/spec divergence: care-team notes (handoff + therapist notes) are **patient-readable for the patient's own rows** since migration `0096` (GDPR right-of-access), which contradicts the "never patient-visible" line in §5.13 / TRANSFER_PROMPT — §5.13 corrected; **resolved 2026-06-16 — patient-readable IS intended (the patient's own data); the authoring + patient-facing UI already reflect it, so no app change, only the docs were stale.** See §5.14 + §7._
>
> _**Update 2026-06-15 (later still ×2) — `staging-ci-gate-1`:** deploy-on-green workflow (`.github/workflows/deploy.yml`, **inert** until Vercel secrets are set) that ships production only after CI passes — a real gate even with direct-to-main commits — plus `docs/STAGING-AND-CI-GATE.md` for activating it and standing up a staging Supabase + Vercel Preview env. Docs + one inert workflow only; **no app/migration change**, nothing to run. Nikolaj's actions are dashboard-side (disable Vercel auto-deploy, add 3 secrets, create staging project). See §7._
>
> _**Update 2026-06-15 (later still ×3) — `e2e-coverage-1`:** added `e2e/clinician.spec.ts`. Tier 1 (runnable, read-only): clinician signed-out redirects + sign-in (self-skip without `E2E_CLINICIAN_EMAIL`/`_PASSWORD`; `e2e.yml` passes them through). Tier 2 (`test.fixme`, staging-only): approve-a-suggestion + therapist-note round-trip — grounded scaffolds (dev scenario API + `clinician-suggestions`/`physio-suggestions`), left as fixme rather than faked green since they couldn't be run here; finish against staging with the dev. Specs typecheck clean; no app/migration change. See §7._
>
> _**Update 2026-06-15 (later still ×4) — `eslint-ci-1`:** added an ESLint 9 flat config (`eslint.config.mjs`) + `lint` script + CI Lint step — the last P1 code-quality gap. Green baseline (0 errors, ~79 warnings; correctness rules error, stylistic rules warn). Surfaced a **real rules-of-hooks violation** in `app/[locale]/clinician/treatment/page.tsx` (two effects after the loading/error early-returns — latent "more hooks than previous render" crash); scoped to a tracked warning for that file (hard error elsewhere), recommend a child-component-extraction refactor as its own task. devDeps + lockfile updated; build/tsc/lint all green. See §7._
>
> _**Update 2026-06-16 — `hooks-refactor-1`:** fixed the treatment-page rules-of-hooks violation found by `eslint-ci-1`. Split `app/[locale]/clinician/treatment/page.tsx` into a shell (fetch + guards) and a child `TreatmentRecordLoaded` (all loaded-data hooks), so hooks run unconditionally — latent crash gone. Scoped ESLint warning removed; `rules-of-hooks` is now a hard error everywhere. tsc/lint/build green; no migration. **QA the treatment screen** (record/edit/new-cycle/save/copy-from-previous/scroll-highlight/total auto-fill). See §7._

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
  handoff note (`physician-therapist-note`, §5.13) — an inter-professional
  hand-off (not a clinic→patient *messaging* channel), though the patient **can
  read** these care-team notes about themselves (their own care record; see
  §5.13/§5.14, migration 0096).
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
5. **Success = exit 0 and "✓ Generating static pages (N/N)"** with both numbers
   equal. The absolute N tracks route count × locales × the framework's own
   counting, so don't hardcode it — it is **109** on Next 16.2.7 (was **110** on
   Next 15 once the four en/da/sv/nb locales landed; **60** back in the
   two-locale era). The only
   expected warning is a Sentry/OpenTelemetry "critical dependency" message
   (unrelated, ignore).
6. **Restore** `app/[locale]/layout.tsx` from `/tmp/layout.tsx.orig`, then verify:
   - `sha256sum` of the restored file ==
     `6e231e47637ccee79b1811b67adb9dfe833f07c147cb0fd9e09c16abdfeb8105`
     (current as of `pwa-service-worker`: layout now mounts
     `<ServiceWorkerRegistrar/>`; **was** `939245…` through the wearables work,
     `5a1cf0da…` at `physician-therapist-note`, and
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

`supabase/migrations/` holds the numbered migrations (through **0111**) plus the
non-numbered seed `demo_seed_test_patients.sql`. **Latest to run: `0111` —**
`0111_fix_export_guidance.sql` (`create or replace export_research_dataset()`
reading `s.guidance` instead of the moved-away `m.guidance`; no schema/data
change). Run it in **staging** (it was already run in production). Notable
recent ones:

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
- `0110_studies.sql` — **`studies-and-fixes-1`, RUN THIS.** New `study` +
  `study_membership` tables (admin-only RLS) and admin-gated RPCs
  (`create_study`, `update_study`, `add_patient_to_study`,
  `remove_patient_from_study`, `study_overview`). Study membership is
  orthogonal to research consent and does **not** change the consent-gated
  export; `add_patient_to_study` mints a `study_code` (REDCap record_id) for a
  consented, non-purged member that lacks one (reuses `study_code_seq`, 0106).
  Method-D verified, 15 cases (§7).

> If unsure whether the user's DB is current, confirm 0062–0088 are applied (0066 is dev-only; **0067** GAS suggestion-approval, **0068** read-aloud, **0069** wearable ingestion, **0070** treatment-modality, **0071** video task protocol, **0072** clinic video score, **0073** session switching, **0074** NRS baseline/target, **0075** baseline video, **0076** clinic video NRS, **0077** wearable enabled, **0078** nav style, **0079** ITB therapy, **0080** goal therapy tag, **0081** cycle-agnostic suggestions, **0082** check-in undo, **0083** physio goal signals, **0084** physio GAS value, **0085** cycle-agnostic physio suggestions, **0086** goal versioning, **0087** link goal to lineage, **0088** physician→therapist handoff note, **0110** studies + study membership).

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

### 5.9 Dev scenario launcher (test environment) — **RETIRED 2026-06-16**
**REMOVED in `retire-dev-scenarios-1`.** `lib/dev/scenarios.ts`,
`app/[locale]/dev/scenarios/page.tsx`, and `app/api/dev/scenario/route.ts` are
deleted. It signed the user out (`supabase.auth.signOut()`) then tried to sign
back in with a magic-link token; on an environment without the expected demo
accounts it failed *after* signing out, leaving you on the login screen — the
"bounces to login even when logged in" bug. The `NEXT_PUBLIC_ENABLE_DEV_TOOLS`
/ `ENABLE_DEV_TOOLS` env vars are now unused (delete from Vercel). Migration
`0066`'s `dev_reseed_all()` SQL is **untouched** and still callable from the
Supabase SQL editor. The Tier-2 E2E scaffolds that drove this mechanism need
re-grounding (seed via SQL + a reusable visit code) — annotated in
`e2e/clinician.spec.ts`.

<details><summary>What it used to be (historical)</summary>

A `/dev/scenarios` page that reset demo data, signed you in as the right
account, opened the clinician session, and landed you on the screen. Pieces:
`lib/dev/scenarios.ts`, `app/[locale]/dev/scenarios/page.tsx`,
`app/api/dev/scenario/route.ts` (service-role: reseed + `generateLink` +
reusable `visit_code`), migration `0066`. Gated by the two `*_DEV_TOOLS` env
vars. Never reliably verified end-to-end.
</details>

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
- **Caveat:** the Method-D harness stubs RLS/auth, so it proves the SQL logic and
  the RPC guards, NOT the real RLS policies. **As of `rls-denial-tests-1` the real
  policies ARE now exercised** by the RLS-denial suite (§5.14) — a separate harness
  that applies the real bootstrap + all migrations, makes `auth.uid()`
  impersonatable, and asserts denial under the actual policies. Live Supabase is
  still the final word, but "looks right" is now "verified in CI" for the core
  isolation properties.

### 5.14 RLS-denial test suite (`rls-denial-tests-1`, CI)
Runtime proof that the database denies what it should — the highest-value check
for a clinical app holding real patient data. Files: `supabase/ci/rls-test-setup.sql`
(claim-aware `auth.uid()` reading a `test.uid` GUC; Supabase-like grants so any
denial is RLS, not a missing GRANT; an `_assert()` that raises; deterministic
fixtures) and `supabase/ci/rls-tests.sql` (the assertions). Runs in CI's
`migrations` job after the schema snapshot; reproduce locally with
`supabase/ci/run-rls-tests.sh`. Each impersonates a user via `SET ROLE` +
`set_config('test.uid', …)` so the **real** policies decide visibility; every
denial is paired with a positive control. Covers: cross-patient isolation
(patient/profile/notes), clinician-session gating including the **1-hour
staleness cutoff**, anonymous denial, the **0096** care-team-note right-of-access
boundary (own rows yes, others no), and **admin-only `study`/`study_membership`**
(0110). Negative control verified: injecting a `using(true)` patient policy makes
the suite fail; removing it returns to green. **No app/migration change** — test
infra + CI only.

### 5.13 Physician → therapist handoff note (`physician-therapist-note`, 0088)
The **one** sanctioned downward channel (clinic → therapist). The treating
physician can attach, to a cycle's treatment, a short note for the patient's
weekly community therapist plus a **"did the treatment change this visit?"**
flag (Adjusted / No change / Not specified). Closes the therapist-audit gaps:
no feedback on a physician action, and no since-last-session delta.

- **⚠️ Patient visibility changed in 0096 (`patient_care_team_notes`).** §5.13
  was written for 0088/0095, when the handoff/therapist notes had **no patient
  SELECT policy**. Migration **0096 deliberately added a patient self-read** on
  all three care-team channels (`treatment_handoff`, `goal_handoff_note`,
  `therapist_note`) — `using (patient_id = current_patient_id())` — on the
  GDPR right-of-access rationale (the patient may see records about their own
  care, surfaced read-only on the patient page). So these notes are **patient-
  readable for the patient's OWN rows** (never another patient's; clinician
  access unchanged). The phrasing below ("never patient-visible", "no patient
  SELECT policy at all") describes the *original* 0088/0095 design and is
  **superseded by 0096** — caught by the RLS-denial tests (§5.14).
  **Confirmed intended 2026-06-16:** patient-readable is the wanted behaviour
  (the patient's own care record); author-private notes are explicitly NOT
  wanted. The authoring UI already tells note authors the patient can read it.
- **(Original 0088/0095 design, for context — superseded by 0096:)**
  Never patient-visible was enforced by the data model, not just the UI.
  The patient already has row-level read on `treatment_session` (treated-muscles
  pop-up) and Postgres RLS is row- not column-level, so the note **cannot** sit
  on `treatment_session`. It lives in **`treatment_handoff`** (1:1 with the
  cycle; §4.2). Read =
  `clinician_can_access_patient(patient_id)` (role-agnostic → physician +
  therapist) plus the 0096 patient self-read. Write = `set_treatment_handoff`
  (SECURITY DEFINER, **clinician-only** — a physiotherapist cannot author it).
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

### 5.15 Wearable ingestion via an EU aggregator (`0120`) — ships OFF

Patients link a wearable (default Garmin) through an EU data **aggregator** (one
integration → many providers; the aggregator holds the Garmin partnership). The
aggregator pushes data to `POST /api/wearables/webhook`, which normalizes into
the existing `observation` store (0069) — the clinician "wearable trend" (§5.8 /
`VisitChanges`) already renders it. **Descriptive only**: no scores/alerts.

- **DB (0120):** `wearable_connection` (patient↔aggregator link, status enum,
  consent/sync timestamps; RLS patient-owns + clinician-read). Two SECURITY
  DEFINER RPCs **granted to `service_role` only**: `set_wearable_connection_status`
  (auth/deauth path) and `ingest_wearable_observations` (data path — resolves
  patient from a `connected` row, forces `observation.source` from the provider,
  dedups like `import_observations`). Needed because `import_observations`
  authorizes a USER session and a webhook has none. Validated in the PG16 harness.
- **Metric selection (0121):** `wearable_connection.metrics text[]` allowlist;
  the webhook ingests only listed metrics (clinician choice + data-minimisation;
  default steps/heart_rate/sleep_duration, empty = none). Set via
  `set_wearable_import_metrics` (authorizes patient/clinician/admin, updates only
  the allowlist, granted to `authenticated`). Clinician edits on the patient page
  (`WearableImportSettings`); patient sees what's shared on `/profile`.
  **Auth hardening note:** that RPC coalesces each authorization disjunct to
  false — the same `... or current_app_role()='admin'` pattern in **0069
  `import_observations`** can evaluate to NULL and skip its guard when the role
  is NULL (not exploitable for real users, who always have a role); a forward
  hardening migration for 0069 is worth doing if you want belt-and-braces.
- **App:** `lib/wearables/{types,normalize,aggregator}.ts`,
  `app/api/wearables/{connect,webhook,disconnect}/route.ts` (nodejs runtime),
  `lib/supabase/wearableConnections.ts`, `components/patient/WearableConnectPanel.tsx`
  (on `/profile`). **`aggregator.ts` is the only file with the external wire
  contract** — written to a representative pattern; reconcile with the chosen
  aggregator's live docs.
- **Gating:** OFF by default. `NEXT_PUBLIC_WEARABLES_ENABLED` shows the UI; the
  connect API 503s until the server env vars are set. Full env list, the
  reconciliation checklist, and the **DPIA / DPA / sub-processor** gates are in
  **`lib/wearables/README.md`**.
- **Types:** `wearable_connection` + the two functions were hand-added to the
  generated `lib/database.types.ts`; `npm run gen:types` after applying 0120
  reproduces them.
- **Provisional codings:** HR / resting HR / steps / SpO₂ / respiration use
  confirmed LOINC; sleep / HRV / stress / calories / distance are provisional
  (`urn:tc:wearable-metric`) pending terminology sign-off.

### 5.16 Offline-resilient check-in (outbox) — `0` migrations

A patient whose connection drops while submitting a check-in doesn't lose it.
Draft answers already persist (`useCheckinDraft`, localStorage). The submit now
falls back to a durable **outbox**: `lib/checkinOutbox.ts` (localStorage queue),
`lib/offline.ts` (`isOnline` / `isOfflineError`), `lib/useCheckinOutbox.ts`
(flush on mount + `online`), surfaced by `components/patient/CheckinOutboxBanner.tsx`
on the patient home. Idempotency needs no migration: `submit_weekly_checkin_v4`
rejects a non-pending prompt, so a replay after a lost ack can't duplicate —
the flusher treats that as success (`isAlreadySubmittedError`). The check-in
page shows an `OfflineSavedView` and skips questionnaires on the offline path
(they need the server id; they stay due). **Deferred:** the PWA/service-worker
app-shell (opening the app with zero connection) — needs preview-deploy testing
before it's safe to ship. **DPIA flag:** the outbox stores patient check-in data
on the device until it syncs (cleared on success); note it before real data.

### 5.17 Auth-guard NULL hardening (`0122`)

`import_observations` (0069) used `... or current_app_role() = 'admin'`, which
evaluates the whole OR to NULL when the role is NULL, and `if not NULL then
raise` doesn't fire — an unauthorized caller could slip through (not exploitable
for real users, who always have a role). **0122** re-creates it with each
disjunct `coalesce`d to false (harness-verified: unauthorized now blocked, 0
rows leaked). Same fix shipped inline in `set_wearable_import_metrics` (0121).
The wearable webhook was also hardened: 2 MB body cap → 413, Sentry on
signature/JSON failures, and a 500-on-unexpected-error so the aggregator's
(idempotent) retry redelivers rather than dropping a batch.

**Grant-gap fix (0123):** production verification found the two 0120 webhook
RPCs (`ingest_wearable_observations`, `set_wearable_connection_status`) still
had the default EXECUTE-to-PUBLIC grant (anon + authenticated could call them);
0120's service-role-only lockdown hadn't taken. Migration
`0123_assert_wearable_rpc_service_role_only.sql` re-asserts it forward
(revoke from public/anon/authenticated, grant to service_role; idempotent,
harness-verified). Exposure was theoretical (wearables off, no connected rows).
**Apply 0123 to production AND staging.**

### 5.18 PWA service worker — offline shell (`public/sw.js`)

There was already a push-only SW (`public/sw.js`) that registered *only* when a
patient opted into notifications. It now also does conservative offline
caching, and registers for **everyone** on load via
`components/pwa/ServiceWorkerRegistrar.tsx` (mounted in the locale layout) →
`ensureServiceWorkerRegistered()` in `lib/pwa.ts`. The `manifest.json` + icons
already existed, so the app is installable.

Deliberately cautious because the SW controls every user:
- **Navigations are network-first** — online users always get the freshest app;
  the cache is only a fallback. This is what prevents a stale-code lock-in.
- **Never cached:** `/api/*`, cross-origin (Supabase/aggregator), non-GET, and
  authenticated HTML pages. No patient/clinical data lives in a device cache.
- **Cached:** content-hashed `/_next/static/` (cache-first, can't go stale),
  icons/manifest (precache), other static GETs (stale-while-revalidate).
- **Offline navigation** serves `public/offline.html` (static, bilingual, no
  patient data) — paired with the check-in outbox so a patient keeps saved data
  and sees a clear message. It does **not** make the authed app usable offline
  (that would mean caching authed pages — intentionally not done).

**Recovery / kill-switch:** bump `CACHE_VERSION` in `sw.js` + redeploy to purge
caches; the file's header comment carries a copy-paste self-unregistering SW for
emergencies. **Verify on a Vercel PREVIEW first** (DevTools → Application →
Service Workers / Lighthouse PWA, then airplane-mode a navigation → offline
page) before it reaches production patients — it can't be tested locally here.

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

- **`v1.0.0` — versioning locked for the testing phase (cumulative; deploy this ONE zip; no migration).** Establishes the version baseline:
  - **Stack-gap hardening added before lock (this build):** `X-Robots-Tag: noindex` + `app/robots.ts` (clinical app must not be indexed); `/api/health` liveness endpoint (point an uptime monitor at it); in-memory rate limiting (`lib/rateLimit.ts`) on `redcap-sync` (per admin, 5/min), `create-account` + `reset-password` (per IP, 20/min) — best-effort per-instance, seam for KV/Upstash; `eslint-plugin-jsx-a11y` wired as **warnings** (0 errors kept; 244 warnings now, ~164 a11y — fodder for the WCAG pass; deprecated `label-has-for` disabled). **Typed DB layer LIVE** — `lib/database.types.ts` (30 tables/25 enums/175 functions, via local-PG replay + `postgres-meta`) generated AND all three clients typed `<Database>`; every `.from()`/`.select()`/`.rpc()` is schema-checked at compile time. Adoption surfaced 57 mismatches, all resolved with **no runtime change** (value-preserving casts for required RPC params Postgres accepts null on; `?? undefined` only where the SQL param `default null`, verified per function; `as unknown as` for PostgREST embedded selects the generator can't resolve; enum casts). Full verify incl. vitest (41 tests) green. Patterns documented in `docs/DB-TYPES.md`. **Auth-email gap documented** in `OPS.md` go-live checklist (Supabase default SMTP → configure a real provider; reset-password route already hands a temp password because of this). OPS checklist refreshed (CSP/Next marked done; uptime + SMTP items added).
  - **`CHANGELOG.md`** added — readable Keep-a-Changelog distilled from this log; single `[1.0.0] — 2026-06-17` "pilot test baseline" entry (Added / Changed-Fixed / Known limitations). This file is the by-version summary; §7 here stays the build-by-build engineering log.
  - **`lib/version.ts`** — single source of truth (`APP_VERSION='1.0.0'`, `BUILD_DATE='2026-06-17'`). **Bump both on every released build and keep `package.json` "version" in sync** (now `1.0.0`, was `0.1.0`).
  - **Version surfaced in-app** via `components/layout/VersionTag.tsx` (`v1.0.0 · 2026-06-17`, locale-neutral) on the **login** and **profile** footers — so a tester can report the exact build.
  - **Localization fix:** the login "Your data & privacy" link was hardcoded; now `login.privacyLink` (en/da/sv/nb). Parity **1730**.
  - **Lock step for Nikolaj (GitHub Desktop):** after deploying, create a tag/release `v1.0.0` (Repository → History → right-click the commit → *Create Tag* `v1.0.0`, then push tags; or GitHub web → Releases → *Draft a new release* → tag `v1.0.0`). Tag immutably marks the build under test.
  - tsc/lint(0)/i18n(1730)/font-stub build green; `layout.tsx` SHA restored.

- **`admin-collapsible-nav-1` — admin floating side-nav + collapsible sections, login language-switcher fix, REDCap sync result fixes (cumulative; no migration).** Folds in the deploy-hardening workflow.
  - **Login language switcher — "can't switch back to English" FIXED.** Root cause: `i18n/routing.ts` has `localeDetection: true`, and `components/settings/LanguageSelect.tsx` switched locale with the raw `next/navigation` router **without setting the `NEXT_LOCALE` cookie**. So after switching to a prefixed locale (e.g. `/da`), switching back to English (the *unprefixed* path) was redirected straight back by the detection middleware (cookie still pointed at `da`). Other languages worked because their explicit `/xx` prefix overrode detection. Fix: `choose()` now sets `document.cookie = NEXT_LOCALE=<target>; path=/; max-age=1y; samesite=lax` before `router.replace`. Affects both the segmented (login) and cards (profile) variants.
  - **Admin page — floating overview menu + collapsible sections.** New `Collapsible` (native `<details>`, accessible, chevron rotates via Tailwind `group-open:rotate-180`) wraps **Accounts list, Create account, Research export, Studies, Consent pending-deletion**; *Active access* keeps its own built-in show/hide toggle (not double-wrapped). **Accounts + Create account collapsed by default; the rest open.** Sections render an `embedded` prop so the collapsible header owns the title (no double heading / no inner card). Navigation: a **fixed floating side menu in the left gutter on `xl`+** (grouped *Accounts & access* / *Research data*), with the inline link-row kept as the `<xl` fallback; both call `goTo(id)` which opens a collapsed `<details>` and smooth-scrolls. Replaced the old `#anchor` `<a>` jump-links.
  - **Localization fixes (admin).** Localized the hardcoded `'Back'` header label and three hardcoded `CreateAccountSection` field helpers (email / display-name / temp-password). New `admin.*` keys: `back`, `navLabel`, `emailHelper`, `displayNameHelper`, `tempPasswordHelper` (en + da/sv/nb first-pass — flag for native review). Parity **1729** keys.
  - **REDCap sync result reporting — truthful + correct units.** (1) The "Synced N rows" message reported rows **built from the DB**, not REDCap's confirmed count, and the route returns HTTP **207** on errors (counts as `res.ok`) so errors were swallowed. (2) `returnContent=count` returns **records** (patients), not rows, so comparing `imported`(records) `< rows` was a false-partial alarm. Fix: success = `errors.length === 0`; message now `syncResult` = "Synced to REDCap — {patients} patients, {rows} rows ({imported} records confirmed)"; `syncPartial` only on real errors, showing REDCap's message (`syncNoDetail` fallback). **REDCap pipeline confirmed working end-to-end** — Record Status Dashboard shows TC-0001…TC-0007 with enrolment + repeating instruments populated (TC-0001 enrolment-only = the unseeded patient; ITB forms empty = no ITB patients, expected).
  - **REDCap project-setup lessons (no code):** repeating instruments must be enabled in the REDCap project itself (dictionary import doesn't do it) — enable **every form except `enrolment`** as repeating; `enrolment` must stay non-repeating. The URL `https://redcap.regionh.dk/api/` is **server-wide** (same for every project); only the **token** is project-specific, so the token is the sole thing deciding which project data lands in — keep Preview→test, Production→its own. **Cutover plan (decided): same project, REDCap "Move project to production" with delete-all-data** (wipes the test records; token + repeating instruments unchanged). Caveat: staging (Preview) currently points at this same project, so before go-live repoint/remove the Preview `REDCAP_API_*` or never sync from staging, else test patients land in live data. Production mode locks the dictionary (later changes need draft+approval) — finalise it first. **Analysis-readiness dry-run PASSED** on the 7 test records (`redcap_dryrun.R`, base-R, no REDCapR/dplyr deps): 7 records, 0 orphan muscles, 0 undecoded coded values — the long/tidy export joins + decodes cleanly. Re-run after the production move.
  - tsc/lint(0 errors)/i18n(1729)/font-stub build all green; `layout.tsx` SHA restored.

- **`deploy-hardening-2` — inject build-time public env from CI secrets (no app-code change).** Making `NEXT_PUBLIC_*` non-Sensitive should have let `vercel pull` deliver them, but the 500s persisted, so the workflow no longer depends on `vercel pull` for them: `deploy.yml` now writes `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` (from **GitHub repo secrets**) into `.vercel/.env.production.local` before `vercel build`, removing the sensitivity/scope dependency entirely. Keeps the fail-fast (missing secrets) and the post-build `supabase.co`-inlined check. **One-time setup: add repo secrets `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (production values; public, safe in CI).** Doc: `docs/STAGING-AND-CI-GATE.md` → Troubleshooting + "injected from CI secrets". CONFIRMED WORKING in production.

- **`deploy-hardening-1` — fix the deploy-on-green double-deploy + 500s (no app-code change; CI workflow + docs only).** Symptom: two production deploys per commit — Vercel's own `main`/~1 min build (worked) and the Action's `HEAD`/~12 s prebuilt (500'd, "URL and Key are required"), flapping the live alias. Cause: (a) Vercel's automatic production deploys were never turned off, so both mechanisms ran; (b) the prebuilt CI build inlined **blank** `NEXT_PUBLIC_SUPABASE_*` because `vercel pull` doesn't download vars marked **Sensitive**, so the build baked in empty values → runtime 500. Fix shipped: `.github/workflows/deploy.yml` now **fails closed** — aborts the deploy (keeping the last good build live) if `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are missing after `vercel pull`, or if the built `.vercel/output` contains no Supabase URL. Dashboard steps for Nikolaj (in `docs/STAGING-AND-CI-GATE.md` → Troubleshooting, **in order**): make those two public vars non-Sensitive; let the Action run and confirm the site works; **then** set the Ignored Build Step to skip production git builds (`if [ "$VERCEL_ENV" = "production" ]; then exit 0; else exit 1; fi`) so only the gated Action deploys production. No app code, tsc/lint/i18n unchanged from `admin-overview-search-1`.

---

## 7-prev. `admin-overview-search-1` — admin-page restructure + search (cumulative; no migration) Deploy this single zip; it folds in every 2026-06-16 delivery below. Admin page reorganised into an **overview band** (title + lead, at-a-glance account counts reused from the existing filter labels, and a jump-link row) + **two grouped domains** — *Accounts & access* (Accounts list · Create account · Active access) and *Research data* (Research export · Studies · Consent pending-deletion); research export promoted from the bottom, consent-deletion queue moved to the end of its group, each section given an `id` for the jump-links. **Free-text search added to the Studies section:** studies list (key/name/description) and study-patients (display name / REDCap `studyCode`) — the latter applied on top of the existing membership-filter dropdown. The Accounts list already had its own name/email search. 7 new `admin.*` i18n keys (en/da/sv/nb; da/sv/nb first-pass — flag for native review); parity **1722** keys. tsc/lint/i18n/font-stub build all green; `layout.tsx` SHA restored.

### 2026-06-16 session — the deliveries folded into the cumulative zip above

- **`admin-tool-rail-1`** — added an **Admin** entry (gear icon) to the clinician patient **Tools rail** (Training/Consent/History/Export), gated to admins via a new `showAdmin` prop on `PatientActionRow`; navigates to `/clinician/admin`. New `clinician.patient.actionAdmin`/`actionShortAdmin` keys. (A prior `admin-button-actionrow-1` that put the button on the clinician-home header was reverted — wrong action row.)
- **`relocate-export-ux-1`** — moved the REDCap **research export + sync** off the unlinked wearable/observations page onto the **admin page** (`ResearchExportSection`), which is linked from the clinician home + account menu. ⚠ The earlier `retire-dev-scenarios-1` and `fix-export-guidance-0111` zips were built *before* this edit and are half-relocated (export removed from observations, not yet on admin) — **do not deploy them**; the cumulative `admin-overview-search-1` is the only correct artifact.
- **`fix-export-guidance-0111`** — migration **`0111_fix_export_guidance.sql`**: `export_research_dataset()` read `m.guidance`, but `0009` moved that column to the session — fixed to `s.guidance`. Surfaced as a live sync failure (*"column m.guidance does not exist"*); the JS tests don't exercise the SQL RPC, so it slipped through. Method-D verified (reproduced the error, confirmed the fix returns cleanly). **Run in staging** (already run in production — sync then succeeded, 187 rows / 2 patients). Standalone SQL in outputs.
- **`retire-dev-scenarios-1`** — removed the dev scenario launcher (`/dev/scenarios`, `/api/dev/scenario`, `lib/dev/scenarios.ts`). It called `signOut()` then tried to sign back in via a magic-link token, and failed *after* signing out — the "bounces to login even when logged in" report. `ENABLE_DEV_TOOLS`/`NEXT_PUBLIC_ENABLE_DEV_TOOLS` are now dead — delete from Vercel. `dev_reseed_all()` SQL untouched. Tier-2 E2E scaffolds referenced this mechanism — annotated in `e2e/clinician.spec.ts` as needing re-grounding (seed via SQL + reusable visit code).
- **Live ops (dashboard-side, by Nikolaj):** REDCap sync proven end-to-end against the production *test* patients → a REDCap **test** project. **Production outage resolved** — the **Production** Supabase env vars had been un-scoped during the staging split (`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` + `SUPABASE_SERVICE_ROLE_KEY`); fixed by restoring Production-scoped values + a fresh build. **Standing rule: never edit/uncheck the shared Supabase vars — only ADD Preview-scoped entries for staging.** Hobby Instant Rollback only goes one step back → fix-forward, not rollback. Env changes require a fresh build.

---

## 7-prev-5. `hooks-refactor-1` — fixed the treatment-page rules-of-hooks violation

- **`hooks-refactor-1` — fixed the treatment-page rules-of-hooks violation.** Resolves the finding from `eslint-ci-1`. `app/[locale]/clinician/treatment/page.tsx` is split into a thin shell `TreatmentRecordInner` (data fetching + the auth/role/no-session redirect effects + the loading/error guards) and a child `TreatmentRecordLoaded({ data, session, onSessionRefetch })` that mounts only once data is loaded and holds **all** the loaded-data hooks (form state, hydrate effect, the two previously-offending effects, derived values, handlers, JSX). Because the child mounts only after the guards pass, every hook now runs unconditionally in a constant order — the latent "rendered more hooks than during the previous render" crash is gone. The move is wholesale (hooks keep their order and run under the same loaded-only condition as before), so behaviour is preserved; props are typed via `NonNullable<ReturnType<typeof useClinicianPatientData>['data']>` etc. so nothing is loosened. The scoped ESLint warning is **removed** — `react-hooks/rules-of-hooks` is now a hard **error** everywhere, including this file, and lint is green (0 errors; ~77 warnings, the 2 hooks warnings gone). Verified: tsc clean, `eslint .` 0 errors with the violation absent, font-stub build compiled (treatment route builds for all locales), `layout.tsx` SHA restored, no stub remnants. **No migration.** **Please QA the treatment screen** (the one thing I can't run): load it for a patient, confirm record/edit/new-cycle, save, "copy from previous", the left-rail scroll highlight, and Total-units auto-fill all still behave — these are what the relocated effects/hydrate drive.

---

## 7-prev-4. `eslint-ci-1` — ESLint flat config wired into CI + a latent-bug finding

- **`eslint-ci-1`.** Adds `eslint.config.mjs` (ESLint 9 flat config: `@eslint/js` + `typescript-eslint` recommended, `eslint-plugin-react-hooks`, `@next/eslint-plugin-next` core-web-vitals), a `lint` npm script (also folded into `verify`), and a **Lint** step in CI's `verify` job. devDeps + lockfile updated (eslint 9, typescript-eslint 8, react-hooks 7, @next plugin, globals). **Green baseline by design:** correctness-class rules are **errors** (React hooks rules, Next footguns, broken code); stylistic/gradually-tightenable rules are **warnings** that surface without blocking (the developer ratchets them to error over time). Current state: **0 errors, ~79 warnings** (50 `no-non-null-assertion`, 25 `no-unused-vars`, 2 `exhaustive-deps`, 2 the scoped hooks rule below). `no-empty` allows the intentional empty-catch pattern. Verified: `npm run lint` exits 0; font-stub build still compiles clean with ESLint present (`layout.tsx` SHA restored `d6901997…`, no stub remnants); tsc clean; configs parse.
  - **★ Finding — a real rules-of-hooks violation in `app/[locale]/clinician/treatment/page.tsx`.** Two `useEffect`s are called **after** the loading/error early-returns, so on the loading render they're skipped and on the loaded render they run — React's "rendered more hooks than during the previous render" hazard, a latent crash on that core clinician screen. It can't be fixed by moving code (line ~351 destructures non-null loaded data the guard guarantees, so the guards can't drop below the hooks; the hooks depend on values derived after that destructure, so they can't rise above the guards). **Correct fix:** extract the loaded view into a child component so the parent's guards precede all hooks — a focused, separately-tested refactor. Until then `rules-of-hooks` is a **scoped warning for that one file only** (commented in the config, not silenced); it remains a hard **error** everywhere else. **Recommend doing the refactor as its own task** — I can take it next.

---

## 7-prev-3. `e2e-coverage-1` — clinician E2E paths + grounded write-journey scaffolds

- **`e2e-coverage-1`.** Test files + CI env only; **no app or migration change**, nothing to run. Adds `e2e/clinician.spec.ts` in two tiers. **Tier 1 (robust, runnable now, read-only):** signed-out redirects on `/clinician` and `/visit-code`, and a clinician sign-in — mirrors the proven patient tests; self-skips without `E2E_CLINICIAN_EMAIL`/`_PASSWORD`; `e2e.yml` now passes those secrets through (safe against prod). **Tier 2 (`test.fixme`, do not run yet):** "clinician approves a pending suggestion" and "therapist-note round-trip" — multi-actor flows that mutate data via the visit-code unlock, so they must run against **staging** (disposable data) with the dev scenario API, not prod. Authored as grounded scaffolds (real mechanism: `POST /api/dev/scenario` → reusable `visitCode`; real scenarios `clinician-suggestions` / `physio-suggestions`) but left as `test.fixme` because they couldn't be run here — **deliberately not faked as green**, to be finished against staging with the developer (steps in `e2e/README.md`). Both specs typecheck clean against real `@playwright/test` types; `package.json`/lockfile untouched (Playwright stays opt-in). Honest limit: Tier-1 selectors mirror already-proven ones but a first real run is still the acceptance, as with the existing smoke.

---

## 7-prev-2. `staging-ci-gate-1` — deploy-on-green + staging guide

- **`staging-ci-gate-1`.** Docs + one inert CI workflow; **no app or migration change**, nothing to run, safe to drop in. Adds `.github/workflows/deploy.yml` (deploys production via Vercel CLI **only after the `CI` workflow passes on `main`** — a real gate even with direct-to-main commits; **inert** until `VERCEL_TOKEN`/`VERCEL_ORG_ID`/`VERCEL_PROJECT_ID` secrets are set, guarded so it skips cleanly otherwise) and `docs/STAGING-AND-CI-GATE.md` (click-path to activate the gate + stand up a staging Supabase project and a Vercel Preview env pointed at it, so changes are tested off real patient data first). `OPS.md` §4 points to it. Rationale captured: requiring PRs/branch-protection is the right end state but breaks the zip-upload flow, so it's deferred to the developer; deploy-on-green is the friction-free interim that still gates production. YAML validated. **Nikolaj's actions (dashboard):** turn off Vercel auto-deploy for `main`, add the three secrets, create the staging Supabase project (migrate-staging-first becomes the rule). Closes the "deploy not gated on CI + no staging" P1 risk once activated.

---

## 7-prev-1. `rls-denial-tests-1` — runtime RLS-denial suite + a finding

- **`rls-denial-tests-1`.** Test infrastructure + CI only; **no app or migration change**. Adds `supabase/ci/rls-test-setup.sql` + `supabase/ci/rls-tests.sql`, a local runner `supabase/ci/run-rls-tests.sh`, and a step in CI's `migrations` job (full detail §5.14). The suite applies the real bootstrap + every migration, makes `auth.uid()` impersonatable, and asserts denial under the **real** policies: cross-patient isolation, clinician-session gating incl. the 1-hour staleness cutoff, anonymous denial, the 0096 care-team-note boundary, and admin-only `study` tables — each with a positive control. **Negative control verified** (a `using(true)` patient policy makes it fail; removing it passes). Verified locally on a throwaway PG16: all assertions pass; the prior `studies-and-fixes-1` build/tsc are unchanged (no app code touched) and tsc re-confirmed clean.
  - **★ Finding the suite surfaced — care-team notes are patient-readable.** The docs said the physician→therapist handoff note and therapist notes are **never patient-visible** (HANDOVER §5.13, TRANSFER_PROMPT "the only sanctioned downward channel… never patient-visible"). That was true at 0088/0095 but **migration `0096_patient_care_team_notes` deliberately added a patient self-read** on `treatment_handoff`, `goal_handoff_note`, and `therapist_note` (`patient_id = current_patient_id()`), on a GDPR right-of-access rationale. So a patient **can** read the notes about their own care (never another patient's — that isolation is intact and tested). This is not a code bug — 0096 is intentional and documents itself — but it **contradicts the stated invariant** and has clinical-privacy weight: a clinician or physiotherapist writing one of these notes should know the patient can read it. §5.13 is corrected. **Resolved 2026-06-16 — Nikolaj confirmed patient-readable IS intended** (it is the patient's own care record; their data). The note-authoring screens already tell the author "the patient can read it too" (the handoff hint, the per-goal hint, and the therapist-note helper), and the patient-facing UI surfaces the notes ("Notes from your care team"), so the product is internally consistent — **no app change needed**; only the handoff docs were stale, now fixed.

---

## 7-prev. `studies-and-fixes-1` — study membership + five patient-surface fixes

- **`studies-and-fixes-1`.** App code + one new migration. Deploy = upload zip → Vercel; run `0110` in the Supabase SQL editor.
  - **Studies (migration `0110_studies.sql`, RUN THIS).** Two tables — `study` (admin-managed; immutable `key` slug, `name`, `description`, `active`) and `study_membership` (many-to-many patient↔study, unique per pair, `on delete cascade`). Both RLS admin-only (`current_user_is_admin()`, mirrors `patient_admin_all`). Admin-gated SECURITY DEFINER RPCs (all `set search_path = public`, `revoke from public` + `grant to authenticated, service_role`): `create_study`, `update_study` (name/description/active; key immutable), `add_patient_to_study` (idempotent; mints a `study_code`/REDCap record_id for a member that is consented + not purged + lacks one, reusing `study_code_seq` from 0106), `remove_patient_from_study`, and `study_overview()` (one read → studies with member counts + every consented-or-enrolled patient with record_id, consent status, cycle count, study_ids). **Membership is orthogonal to research consent and does NOT change the export** — `export_research_dataset` (0106) is untouched and still consent-gated. **Method-D verified** (throwaway PG16, stubbed `current_user_is_admin`/`current_app_role`/`auth.uid` via `_test_ctx`): 15 cases — admin guards on all five RPCs, blank-key rejection, idempotent re-add, code minted only for consented patients, multi-study membership, not-found guards, immutable key on update, cascade FK present, audit trail.
  - **Admin UI:** `/clinician/admin` gains a **Studies** manager (create / rename / activate-deactivate) and a filterable **Study patients** list (all members · consented-no-study · members-who-withdrew · by study), each row showing the REDCap record_id, consent-status chip, cycle count, study chips with remove, and an add-to-study control. Hooks in `lib/supabase/admin.ts` (`useStudyOverview` + four mutations). **Scope note:** a patient appears here only once research-consented or already enrolled (the overview returns consented-or-member) — the realistic flow is *patient consents → shows under "consented, no study" → admin adds to a study*. Enrolling a never-consented patient is intentionally not offered (keeps the consent-gate posture).
  - **Fix — profile language.** `LanguageSelect` (cards) now hands the choice to the profile page via `onChoose`; the page **awaits** the `preferred_locale` write before reloading (so it can't be lost to the page unload), routes through the unsaved-changes guard, then hard-navigates to the new-locale path. Profile **Back** now goes to the locale-aware role home (was `router.back()`, which returned to the English `/` you came from). No floating Save needed.
  - **Fix — login language.** `i18n/routing.ts` `localeDetection` flipped to **true**: a Danish/Swedish/Norwegian browser now lands on its localized entry instead of English. First explicit switcher choice sets the `NEXT_LOCALE` cookie which then pins it (so EN is still forceable by picking it once). **Behaviour change — QA:** confirm an English browser still lands on `/`.
  - **Fix — DOB picker.** `BirthdatePicker` row moved from a squished `flex` to a 3-track grid (`minmax(0,…)`, month widest) so month names show on a phone.
  - **Fix — profile from check-in.** `AccountMenu` destinations now use `window.location.assign` (hard nav). The check-in wizard swallows soft client-router navigations (same reason home-exit there already uses `window.location`), which left Profile/Admin doing nothing from that screen. `signOut` post-redirect also hardened.
  - **Not a bug (no change):** goal text shows in the language the clinician typed it — it is stored data, not a UI string, so it isn't auto-translated.
  - **Deferred (spec-now-build-later):** biometric login + 2FA. Recommendation captured — TOTP 2FA (Supabase MFA, GA, free; enforce for clinicians/admin, gate sensitive RPCs at `aal2`); biometric as a native-app convenience (device biometrics unlocking a stored session), web passkeys held until Supabase WebAuthn leaves experimental. Best done with the native track, after backups + the external gates.
  - **Sandbox verification:** font-stub build compiled clean (zero warnings; `layout.tsx` SHA restored `d6901997…`, zero `BUILD-STUB` remnants), `tsc --noEmit` clean, i18n parity across en/da/sv/nb (da carries its pre-existing `_meta` review marker). **Cannot verify here (please QA):** rendered screens / real-device DOB layout, the live locale persist + Back round-trip, `localeDetection` on real browsers, the account-menu nav from the actual check-in wizard, and `0110` RLS/RPC behaviour under live auth.

---

## 7-prev. Handover snapshot (2026-06-15) — six security/ops deliveries

- **SECURITY DEFINER audit follow-ups F2 + F3 (`audit-followups-1`).** SQL + docs only — no app code change, no Vercel deploy needed for this batch.
  - **F2 — `supabase/migrations/0109_tighten_anon_execute.sql` (least privilege on `anon`).** EXECUTE defaulted to PUBLIC, so `anon` could invoke every SECURITY DEFINER function (harmless on its own — they self-gate — but needless reach). 0109 does `REVOKE EXECUTE … FROM PUBLIC, anon` then `GRANT … TO authenticated, service_role` on **67** functions. **The 6 kept on `anon`** are the only ones any RLS policy references (proved via `pg_depend`), all via `TO PUBLIC` policies, and policy expressions run as the querying role — so `anon` must keep EXECUTE or anon queries would error instead of returning nothing: `clinician_can_access_patient`, `current_app_role`, `current_clinician_id`, `current_patient_id`, `current_role_is_care_professional`, `current_user_is_admin`. The 10 `dev_seed_*` stay service-role-only (0108). Every one of the 67 is called only from a logged-in surface (the only pre-login path is Supabase Auth, not a custom RPC), so no behaviour change. **Verified:** harness post-0109 shows 67 targets `anon`=0/`authenticated`=67/`service_role`=67, the 6 helpers still carry `anon`, dev fns unchanged; from-scratch replay of all migrations clean. **Live-only check** (the harness can't run the logged-out UI): after applying, load the app signed out + run the visit-code/clinician-session flows signed in, and confirm no `permission denied for function` errors.
  - **F3 — FORCE RLS: reviewed, NOT enabled (analysis, no migration).** Measured: 28 tables, all RLS-enabled, none forced; 76 `TO PUBLIC` + 16 role-scoped policies; 3 tables have only role-scoped policies. FORCE RLS guards against the *owner* bypassing RLS — a path this app doesn't have (it connects only as `authenticated`/`service_role` or via definer functions). Enabling it would subject the trusted, gated SECURITY DEFINER functions (which run as owner and intentionally read across row-scoping) to RLS → silent default-deny on the 3 owner-uncovered tables, and `TO PUBLIC` patient-scoped policies would wrongly filter clinician functions to nothing. Recommendation: keep the current posture (RLS on + gated definers + F2). Full reasoning + the staged recipe (if ever revisited) in `docs/audits/security-definer-audit-2026-06.md` §F3.
  - **Files:** `supabase/migrations/0109_tighten_anon_execute.sql` (+ standalone copy), `docs/audits/security-definer-audit-2026-06.md` (F2/F3 updated). **Apply:** run `0109` in the Supabase SQL editor. Independent of the still-pending 0108 / Next-16 / deps-secfix / Sentry items.

- **Sentry turned on (`sentry-enable-1`).** tsc clean, build 109/109. No dependency or app-logic change — one file rename plus a runbook.
  - **Why it wasn't working:** the app had `sentry.client.config.ts`, but with **no `withSentryConfig`** in `next.config.ts` nothing imported it into the browser bundle, so **client-side errors were never captured** (server/edge were fine via `instrumentation.ts`). Per Sentry's guidance, renamed it to **`instrumentation-client.ts`**, which Next.js loads natively — browser capture now works without adding the build plugin. `app/global-error.tsx` already calls `Sentry.captureException`, so root render crashes report too once the client SDK initialises.
  - **Privacy (clinical-grade, unchanged):** DSN = `NEXT_PUBLIC_SENTRY_DSN` (correct prefix so browser+server both resolve it); `sendDefaultPii:false`; `beforeSend` in `lib/sentry.shared.ts` strips request data, cookies, headers, query strings, user identifiers, and breadcrumb URLs; `tracesSampleRate:0` (errors only, no replay/profiling). CSP in `next.config.ts` already allows `*.ingest.de.sentry.io`. **Caveat noted in the runbook:** the scrubber can't strip PII embedded inside an exception *message* — keep patient data out of `throw` strings.
  - **Runbook `docs/SENTRY_SETUP.md`:** (1) create an **EU-region** Sentry org/project (DSN ends `ingest.de.sentry.io`); (2) set `NEXT_PUBLIC_SENTRY_DSN` (required) + `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` (recommended) in Vercel; (3) redeploy; (4) confirm via a deliberate throwaway error; (5) three alert rules (new issue / regression / spike >10 in 1h, scoped to production, email). DPIA: Sentry = EU data processor, add to the processing inventory. Optional later: source maps via `withSentryConfig` + `SENTRY_AUTH_TOKEN` (makes browser stack traces readable — the one upgrade worth doing next); `onRouterTransitionStart` only if tracing is ever enabled.
  - **Files:** `instrumentation-client.ts` (new), `instrumentation.ts` (comment), `docs/SENTRY_SETUP.md`. **Deploy:** add `instrumentation-client.ts` and **DELETE `sentry.client.config.ts`** (a zip can't remove it), commit, push; then the dashboard steps in the runbook. All Sentry dashboard/env work is yours to do.

- **next-intl security patch + Dependabot (`deps-secfix-1`).** Build 109/109, tsc clean, parity 1668, 41/41 tests; `npm ci` verified on Node-20 npm (10.2.4 + 10.8.2).
  - **next-intl 4.4.0 → 4.13.0 (security).** 4.4.0 is vulnerable to **GHSA-8f24-v5vv-gm5j** — an open redirect in the next-intl middleware (`sanitizePathname` mishandles ASCII control chars → protocol-relative redirects to arbitrary domains; CVSS 5.3, unauthenticated, public PoC). Patched in **4.9.1**; we take latest **4.13.0**. **Honest note:** the prior batch pinned 4.4.0 to dodge the native `@swc/core` dep (lockfile portability), but that version carries this CVE — for a clinical app security wins, so the pin is reversed. `@swc/core` is back, but the lock was **clean-regenerated and `npm ci`-verified on the exact Node-20 npm versions that produced the earlier failure** — a clean, correctly-committed lock is fine. The earlier breakage was a stale/incremental lock, not an inherent 4.13.0 problem. **Still: drop `package.json` + `package-lock.json` together.**
  - **Dependabot (`.github/dependabot.yml`).** Weekly PRs for npm (root) + github-actions. Minor/patch grouped into one PR; majors separate; limit 5. Every PR updates `package.json` + `package-lock.json` together and is checked by CI (verify + migrations run on `pull_request`), so a green PR is safe to merge — this is the durable fix for both keeping deps current and never hand-syncing the lockfile again. **Also enable** (Settings → Code security, one-time toggles): **Dependabot alerts** + **Dependabot security updates** — the latter auto-opens fix PRs (it will propose the `@supabase/supabase-js` bump that clears the `@supabase/auth-js` advisory GHSA-8r88-6cj9-9fh5).
  - **Remaining audit items (not blockers):** `@supabase/auth-js` (moderate; fixed by bumping supabase-js — left to Dependabot + CI rather than a blind hand-bump of the data layer) and a transitive `postcss` under `next` (moderate; clears when next ships a newer postcss — not directly fixable).
  - **Files:** `package.json`, `package-lock.json`, `.github/dependabot.yml`. **Deploy:** drop all three (package.json + lock **together**), commit, push to `main`; then flip the two Dependabot toggles in settings.

- **E2E smoke now auto-runs (`e2e-autorun-1`).** Workflow-file change only (`.github/workflows/e2e.yml`); no app, schema, or dependency change. YAML validated (triggers + concurrency + job condition parse).
  - **Was:** `workflow_dispatch` only (manual). **Now:** manual **+** a daily `schedule` (cron `0 6 * * *`, 06:00 UTC — synthetic monitoring that catches prod/login breakage even with no deploy) **+** `deployment_status` (runs after a successful **Production** Vercel deploy — catches deploy-introduced regressions).
  - **Still off push/PR by design** — a browser-level flake must never red-gate a normal commit. The CI workflow's verify job (typecheck/i18n/test/build) stays the push/PR gate; this is post-deploy + scheduled monitoring.
  - **Safety:** a `concurrency` group (`e2e-smoke`, `cancel-in-progress: false`) prevents overlapping runs mid-check-in; the `deployment_status` job has an `if` guard so it only fires on `state == success && environment == 'Production'` (adjust the env name if your Vercel labels prod differently).
  - **Prereqs (unchanged from the manual workflow):** repo Variable `E2E_BASE_URL` + Secrets `E2E_PATIENT_EMAIL` / `E2E_PATIENT_PASSWORD`. Without `E2E_BASE_URL` a run fails fast; without creds the two patient tests self-skip. **Data note:** each auto run completes a weekly check-in as the test patient (the check-in test self-skips once that week's prompt is consumed), so use a DEDICATED e2e test account, not one you demo with.
  - **Files:** `.github/workflows/e2e.yml`. **Deploy:** drop it on `main` (GitHub Desktop -> commit -> push). `schedule` and `deployment_status` only take effect from the default branch. Confirm the three repo Variables/Secrets above are set, then optionally trigger once from the Actions tab to confirm it's green.

- **SECURITY DEFINER audit + hardening (`secdef-harden-1`).** **CUMULATIVE zip** (also carries the uncommitted `next16-upgrade-1`: `package.json`, `package-lock.json`, `proxy.ts` — and you must **delete `middleware.ts`**). NEW migration **`0108_harden_secdef_functions.sql`**. Build state unchanged from `next16-upgrade-1` (Turbopack 109/109, tsc clean, parity 1668, 41/41). Full audit in `docs/audits/security-definer-audit-2026-06.md`.
  - **Count reconciled:** the assessment said "134 SECURITY DEFINER functions" — wrong; it counted Supabase's system schemas. The app has **83** in `public` (10 are dev-seed helpers). Treat 83 as the real number.
  - **0108-A — search_path:** 66/83 already pinned `search_path = public`; the other **17** had a mutable path (the `current_*` auth helpers, the clinician-session fns, the visit-code fns, `clinician_can_access_patient`, `register_device_push_token`, `ensure_profile_for_auth_user`). 0108 `ALTER`s all 17 to `SET search_path = public` (no body change; bodies use bare public names so it's safe). Verified: 0 mutable-path fns remain; all 17 still execute cleanly.
  - **0108-B — dev-seed lockdown (the real finding):** EXECUTE defaults to PUBLIC, so all 83 fns were `anon`/`authenticated`-callable. The 73 app fns are protected by internal gates, **but the 10 `dev_seed_*` fns have no gate and are destructive** (`dev_reseed_all()` deletes + re-seeds a patient's data) — i.e. an anonymous caller could wipe seeded prod data. 0108 revokes their EXECUTE from PUBLIC/anon/authenticated and grants only `service_role`; the app's `/api/dev/scenario` route uses the service-role client, so it's unaffected. Verified: anon/authenticated EXECUTE = false, service_role = true, normal RPC grants unchanged.
  - **Caller-gate review:** the **22** functions taking `p_patient_id` are all gated — almost all via `clinician_can_access_patient(p_patient_id)`, which requires an **active, <1-hour** clinician session for that patient (enforced at the DB, not just the app); admin ops gate on `current_user_is_admin()`; self-service fns use `current_patient_id()`. No ungated cross-user write path found.
  - **FORCE RLS — deliberately NOT enabled.** It would subject the postgres-owned definer functions to RLS, and on the **16 `TO authenticated`-only** policies there's no policy for the definer context → silent default-deny across the write path. Also unverifiable in the harness (postgres there is superuser + BYPASSRLS), and low marginal value (writes already go through the gated RPCs). Documented with a safe staged-rollout recipe in the audit §F3.
  - **Follow-ups (audit §F2/§F3):** (F2) tighten the broad EXECUTE-to-PUBLIC grants to least-privilege — needs a per-function role-usage map because RLS policies invoke some of these fns, so blind revokes would break RLS; (F3) staged FORCE RLS. Both are separate, carefully-tested changes.
  - **Files:** `supabase/migrations/0108_harden_secdef_functions.sql` (+ standalone SQL in the zip root) and the audit doc — plus the carried Next 16 files. **Apply:** run `0108` in the Supabase SQL editor (independent of the Next 16 deploy; safe to run before or after). Verified by a from-scratch CI replay including 0108.

- **Framework upgrade — Next.js 16 (`next16-upgrade-1`).** Build (Turbopack) 109/109, tsc clean, parity 1668, 41/41 tests, e2e spec type-clean. No schema change.
  - **Why:** Next.js 15.1.9 was missing multiple patched security advisories — a CVSS-10 RCE in the React Server Components protocol (CVE-2025-66478, Dec 2025), the Dec-2025 RSC fixes, and the May-2026 coordinated batch (DoS / middleware-proxy bypass / SSRF / cache-poisoning / XSS). The middleware-bypass class was already largely defanged by our RLS-at-the-DB model, but the RCE is framework-level. (Per the assessment, 15.5.18 was the minimal patch; we chose 16.2.7 to be current since the developer isn't imminent.)
  - **What changed:** `next 15.1.9 → 16.2.7`, `next-intl 3.26.5 → 4.4.0` (pinned at 4.4.0 — the first Next-16-compatible release. **4.5+ adds the native deps `@swc/core` + `@parcel/watcher`** for an SWC message-extractor the app doesn't use; those make the lockfile non-portable and caused an `npm ci` 'Missing @swc/helpers' failure in CI. 4.4.0 has no native deps → portable lock), `@sentry/nextjs 8.42.0 → 10.58.0` (8→10; required for the Next-16 peer). `react`/`react-dom` stay at 19.0.1 (satisfies Next 16's `^19`). The RSC patch ships bundled with Next 16.
  - **Migration surface was tiny** because the app was already forward-compatible: the only server component reading `params` (`app/[locale]/layout.tsx`) already used `params: Promise<…>` + `await params`; `lib/supabase/server.ts` already `await cookies()`; `NextIntlClientProvider` already mounted in the locale layout; `getRequestConfig` already returns `locale`; and we use **no** next-intl navigation APIs (the v4 pitfall that breaks others doesn't apply). All searchParams access is via the `useSearchParams()` hook (stays synchronous).
  - **Only real code edit:** `middleware.ts` → **`proxy.ts`** (Next 16 renamed the convention; the exported function is now `proxy`, the `config` matcher is unchanged, and the Supabase session-refresh + next-intl composition is byte-identical). **ACTION: delete `middleware.ts` from the repo** — the delivery zip adds `proxy.ts` but can't remove the old file; having both is an error in Next 16.
  - **Audit:** the two **high**-severity advisories are gone; `npm audit` now shows 6 (2 low, 4 moderate) in `@supabase/auth-js` (bump `@supabase/ssr`/`supabase-js` later) and `postcss` (dev-tooling). Tracked as dependency-currency follow-ups, not blockers.
  - **Build note:** runs on **Turbopack** (16's default — no custom webpack config to migrate); the static-pages marker is now **109/109** (was 110 on 15). Font-stub workflow unchanged.
  - **Files:** `package.json`, `package-lock.json`, `proxy.ts` (NEW). Delete `middleware.ts`. **Deploy:** ensure Vercel's Node is 20+ (Next 16 minimum; Vercel default is fine), drop the files, delete `middleware.ts`, push → Vercel rebuilds with Turbopack. **CANNOT verify runtime here** — after deploy: (1) re-run the E2E smoke (login/redirect/sign-in/check-in on 16); (2) click through **all four locales** (`/`, `/da`, `/sv`, `/nb`) — next-intl v4 + the proxy rename both touch locale negotiation; (3) confirm **login + session persistence** across navigation/refresh (the proxy does the session-cookie refresh); (4) confirm push still registers.

- **E2E check-in test — submit-transition fix (`checkin-e2e-fix-2`).** Follow-up to `checkin-e2e-fix-1`; test-only, no app/schema change. The previous version cleared the load race but then failed with `expect(...).toBeEnabled() … element(s) not found`: after clicking "Send my check-in" on the final step the wizard is replaced by the thanks screen, so the primary button vanishes — and the loop did one more pass (the submit was still pending when the top-of-loop thanks check ran, so it didn't break) and tripped on the gone button.
  - **Fix:** the walk now drives off the button text — every step shows "Continue" except the last, which shows "Send my check-in" — so it submits on the final step and BREAKS immediately, then waits for the thanks heading. (Confirmed via `isCheckinComplete` in `lib/checkinDraft.ts`: Send enables once every active goal is rated; the comment step is optional.)
  - **File:** `e2e/smoke.spec.ts` only. Re-run the smoke — expect **4 passed**, or **3 passed + 1 skipped** if test1's check-in was already consumed by an earlier run.

- **E2E check-in test fix (`checkin-e2e-fix-1`).** No app/schema change in this step — only the Playwright spec. (This zip ALSO carries the `auth-redirect-guard-1` app fix in `lib/supabase/auth.tsx`, in case it wasn't pushed yet — see the entry below.)
  - **Bug:** the `patient › can complete a weekly check-in` smoke timed out (60s) on the first "Continue" click — the button stayed `disabled`. Root cause was a race in the TEST, not the app: the loop checked the rating radiogroup's visibility on its first pass while the page was still behind its loading skeleton (no controls yet), so it SKIPPED setting a rating, then committed to clicking a Continue that can never enable without one — blocking the entire 60s on that single call, so the 12-iteration retry never got a second pass.
  - **Fix (test only):** wait for the wizard's primary button to render (past the skeleton) before interacting; then on each step, if a rating picker is present, click a value AND assert its `aria-checked='true'` so the selection is confirmed to register; then wait for the primary button to be `enabled` before clicking. A genuine future failure now surfaces as a precise "selection didn't register" / "button never enabled" rather than a silent click timeout. (Confirmed the app renders one step at a time with no animated transition, so `radiogroup.first()` always targets the current step; and both pickers — NRS 0–10 and GAS 5-level — expose `aria-checked`.)
  - **Now re-runnable:** a successful check-in CONSUMES that week's pending prompt, so a second run would otherwise fail at the door. The test now SKIPS (not fails) when no pending prompt exists (the app navigates home), with a clear message; seed a fresh prompt (e.g. test1@example.com) to exercise the full flow again.
  - **Files:** `e2e/smoke.spec.ts` (+ `lib/supabase/auth.tsx` and the hardened `playwright.config.ts` carried along). **Deploy:** drop files → push; if `auth.tsx` is new to your repo, Vercel rebuilds. Then re-run the E2E smoke — expect **4 passed** when test1 has a pending check-in, or **3 passed + 1 skipped** if that prompt was already consumed.

- **Global signed-out redirect guard (`auth-redirect-guard-1`).** Build 110/110, tsc clean, 41/41 tests. No schema change.
  - **Bug:** a signed-out visitor on a protected route didn't always reach /login — surfaced by the E2E smoke (a cold visit to `/checkin` while signed out stayed on `/checkin`). Root cause: the check-in wizard already switched `goHomeHard` to a hard `window.location` because soft `router` redirects "proved unreliable / were swallowed" from that page, but its signed-out redirect still used the soft `router.replace('/login')` — so that got swallowed too.
  - **Fix:** one global guard in `AuthProvider` (which wraps every page). Once auth resolves (`!loading`) with no `user` and the path isn't public, it **hard-navigates** (`window.location.replace`) to the locale-aware `/login`. Public allowlist = `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/privacy` (matched against the locale-stripped path; `as-needed` prefix, en unprefixed). Signed-in users are never touched (`if (user) return`). This is now the single source of truth for "no session → login" — cold load, session expiry, and sign-out from any page; the per-page redirects remain as harmless backstops.
  - **E2E:** `e2e/smoke.spec.ts` test 2 now asserts the redirect to `/login` (it had been temporarily relaxed during debugging), so the smoke run is the live acceptance check for this fix once deployed.
  - **Files:** `lib/supabase/auth.tsx`, `e2e/smoke.spec.ts`, plus the hardened `playwright.config.ts` from the E2E fixes. No migration. **Deploy:** drop files → push (Vercel rebuilds), then re-run the E2E smoke.
  - **Cannot verify the redirect live from here.** After deploy, click-test: log out from profile / a clinician page / mid-check-in → all land on /login; cold-load `/checkin` or `/` while signed out → /login; and confirm `/login`, `/signup`, `/reset-password`, `/privacy` stay reachable while signed out (no loop).

- **Playwright E2E smoke — login + weekly check-in (`e2e-smoke-1`)** · **CUMULATIVE zip** (also carries `consent-consolidation-1`, `suggestion-approve-redesign-1`, and migration `0107`). No app-code or schema change of its own. Build 110/110, tsc clean, 41/41 tests, parity 1668.
  - **What:** a browser-level smoke scaffold using Playwright — `playwright.config.ts` (dual mode: boots `npm run dev` locally, or set `E2E_BASE_URL` to test a deployed preview), `e2e/smoke.spec.ts`, `e2e/README.md`, `e2e/.gitignore`, and `.github/workflows/e2e.yml` (manual `workflow_dispatch` only — never gates pushes). Artifacts write under `e2e/.artifacts/`. `e2e` + `playwright.config.ts` are added to the app `tsconfig.json` `exclude` so `npm run verify`/`tsc` stay green whether or not Playwright is installed.
  - **Coverage:** (1) login page renders its form; (2) a protected route bounces to `/login` when signed out — both robust, no credentials. (3) a patient can sign in; (4) a patient can complete a weekly check-in (navigates to `/checkin`, walks the wizard — rates each goal via its `radiogroup`, presses Continue / Send my check-in, asserts the "Thank you" view). Tests 3–4 are **env-gated** (`E2E_PATIENT_EMAIL`/`E2E_PATIENT_PASSWORD`) and **skip** when unset, so the suite is green out of the box. The check-in test needs a seeded patient with a pending check-in (e.g. `test1@example.com`).
  - **Honesty:** authored **without being run** (this environment has no browser/live app). The e2e files **do type-check clean** against `@playwright/test` (verified). The authenticated tests' selectors are best-effort against the real UI and may need a small first-run adjustment — see `e2e/README.md`. Playwright is deliberately **not** added to `package.json`/the lockfile (zero build/Vercel impact); the README gives the one-time `npm i -D @playwright/test && npx playwright install chromium`.
  - **Files:** `playwright.config.ts`, `e2e/smoke.spec.ts`, `e2e/README.md`, `e2e/.gitignore`, `.github/workflows/e2e.yml`, `tsconfig.json` (exclude only). **Deploy:** these don't affect the running app; just run the carried `0107` in Supabase, then drop files → push. Do not overwrite package.json/lock.
  - **Roadmap:** this was the last item on the audit list — **test harness · privacy/DPIA · native-push runbook · sv/nb reminders · E2E smoke are all delivered.**

- **Consent consolidation — one home for all consent (`consent-consolidation-1`)** · **CUMULATIVE zip** (also carries `suggestion-approve-redesign-1` + migration `0107`). No new migration. Build 110/110, tsc clean, parity holds (1668 keys), 41/41 tests pass.
  - **Why:** consent was scattered — clinical video consent was buried in the recording flow, while educational + research consent sat on the Background card, and educational consent was even duplicated (a checkbox in the old Video panel *and* a row on the card).
  - **Now:** the patient-level toolbar action formerly "Video" is **Consent** (relabelled in all four languages; its icon is now a shield-check). The panel (`ClinicianVideoModal`, name kept for import stability) is the **single** home for all three consent dimensions — **clinical recording**, **educational use of video**, and **research participation** — each rendered as a status pill + grant/withdraw action (research keeps its three-state on/withdrawn/none + the withdraw-confirm).
  - **Background card stripped:** the entire "Care consents" block (research + educational rows), its consent props/labels, and the now-unused `ConsentRow` were removed from `BackgroundCard`. It now carries only demographics / treatment / medication / devices. **Consent lives only in the Consent panel.**
  - **Wiring:** the patient page passes `onSetConsent` (clinical+educational, via `set_patient_video_consent`) and the research toggle (with its `withdrawConfirm`, via `set_research_consent`) into the panel; the now-unused `tEC` hook was dropped. The per-goal recording gate and the separate `VideoEnableGuide` recording-flow consent step are unaffected (they read the same consent state).
  - **i18n:** new top-level `clinicalConsent` namespace (heading/statusOn/statusOff/grant/withdraw); `clinician.videoPanel.title` + `.intro` reworded for consent; `clinician.patient.actionVideo`/`actionShortVideo` → "Consent". All four languages (sv/nb first-pass). The old `videoConsentTitle`/`videoConsentClinical`/`videoConsentEducational` keys are left in place (still used by the recording-flow step / parity-safe).
  - **Files:** `components/clinician/ClinicianVideoModal.tsx`, `components/clinician/BackgroundCard.tsx`, `components/clinician/PatientActionRow.tsx`, `app/[locale]/clinician/patient/page.tsx`, `messages/{en,da,sv,nb}.json`. **Deploy:** run the carried `0107` in Supabase (for the suggestion batch) → drop files → push. Do not overwrite package.json/lock.
  - **Next:** Playwright E2E smoke (login → check-in) — the last roadmap item; a scaffold + run instructions, not provable-green from the sandbox.

- **Approve-suggestion page redesign — Approve (new / fold-in) + Set aside (`suggestion-approve-redesign-1`)** · **CUMULATIVE zip.** NEW migration `0107`. Build 110/110, tsc clean, parity holds (1663 keys), 41/41 tests pass. **0107 verified on a throwaway Postgres (Method D focused harness + full CI replay).**
  - **Why:** review happens *at* the visit, so the old five actions didn't map to real decisions. "Discuss at next visit" and "Not suitable this cycle" did the same thing (both just dropped the suggestion from the pending queue — no patient-visible difference, no recap), and "Combine with another goal" was hollow (it only stamped a status, with no link to any goal).
  - **New model — two actions.** **Approve as a goal** (primary) opens the form; **Set aside** (secondary) sets `notSuitableThisCycle` and returns. There is **no explicit defer button**: a suggestion the clinician doesn't act on stays `needsReview` and resurfaces next visit on its own.
  - **Approve now has a mode toggle.** **As a new goal** (default) = the existing NRS/GAS authoring flow → `approve_suggestion`/`approve_suggestion_gas`. **Add to an existing goal** hides the authoring fields and shows a picker of the patient's **active** goals; submitting **records the fold-in only** — status `combinedWithAnother` + `combined_into_goal_id` = the chosen goal. It creates **no** new goal and does **not** copy the patient's wording onto the target (the target is left exactly as-is). Empty state handled (no active goals → message, submit disabled).
  - **Migration `0107_combine_suggestion_into_goal.sql`:** (1) `alter table goal_suggestion add column combined_into_goal_id uuid references approved_goal(id) on delete set null`; (2) SECURITY DEFINER `combine_suggestion_into_goal(p_suggestion_id, p_goal_id)` — clinician-gated (`current_clinician_id()`), authorises via `clinician_can_access_patient`, **verifies the target goal belongs to the same patient** (no cross-patient folds), sets status + the column, writes an `audit_event`. A **dedicated** RPC so the existing `set_suggestion_status(uuid, suggestion_status)` signature and its callers stay untouched. **Harness:** column lands; happy path sets `combinedWithAnother` + target + audit row; cross-patient blocked; unknown goal blocked; no-access blocked; non-clinician blocked; idempotent re-apply; **full 0001→0107 chain applies, 0 failures**.
  - **i18n:** `clinician.review.approve` relabelled to "Approve as a goal"; new `clinician.review.setAside`; new `clinician.approve.{modeNew, modeCombine, combineIntro, combineChooseLabel, combineNoGoals, combineSubmit, combinedToast}` across en/da/sv/nb (sv/nb first-pass). The now-unused `editAndApprove`/`discuss`/`combine`/`notSuitable` keys are left in place (parity-safe).
  - **Files:** `supabase/migrations/0107_combine_suggestion_into_goal.sql` (new), `lib/supabase/clinicianPatient.ts` (new `useCombineSuggestionIntoGoal` hook), `app/[locale]/clinician/suggestion/page.tsx`, `messages/{en,da,sv,nb}.json`. **Deploy:** run `0107` in the Supabase SQL editor → drop files → push. Do not overwrite package.json/lock.
  - **Next in this thread:** the **Consent** consolidation (relabel the patient-level "Video" action → "Consent"; make `ClinicianVideoModal` the single home for clinical/educational/research consent and remove those rows from `BackgroundCard`). No migration. Design approved.

- **Native-push go-live runbook + doc correction (`push-golive-1`)** · **CUMULATIVE zip.** Documentation only — no code, build, or dependency changes (app remains at the last verified state: build 110/110, 41/41 tests).
  - **Finding (verified against the code):** native push is already **fully implemented** on both sides — phone-side token registration (`lib/nativePush.ts` + `NativePushRegistrar`, `register_device_push_token` RPC in 0102), the Android Gradle wiring + cloud APK build that injects `google-services.json` from the `GOOGLE_SERVICES_JSON` secret, and the **server send via FCM HTTP v1** with dead-token cleanup in the edge function (`getFcmAccessToken` + `sendFcmMessage`, gated on `FCM_SERVICE_ACCOUNT`). There was **no code gap**; the "last mile" is entirely account/credential setup that only the controller can do.
  - **`mobile/PUSH_GOLIVE.md` (new):** a single ordered end-to-end runbook — the **two distinct Firebase artifacts** made explicit (`google-services.json` = app config via the GitHub `GOOGLE_SERVICES_JSON` secret, vs the **service-account key** = server credential via the Supabase `FCM_SERVICE_ACCOUNT` secret), the exact function secrets (`CRON_SECRET`; `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` auto-injected; optional `VAPID_*`), the `--no-verify-jwt` deploy nuance, the pg_cron/pg_net + Vault + 0104 schedule steps, dry-run + single-test-push verification, and the iOS-later path (no edge-fn change — FCM relays to APNs once the iOS app + APNs key exist).
  - **`mobile/FIREBASE_SETUP.md` (corrected):** its "Next: step 4" section was **stale** (described the edge-fn FCM send as future); rewritten to state the send is implemented and point to the runbook.
  - **Files:** `mobile/PUSH_GOLIVE.md` (new), `mobile/FIREBASE_SETUP.md` (corrected).

- **Privacy notice (expanded) + DPIA draft (`privacy-dpia-1`)** · **CUMULATIVE zip.** Build 110/110, tsc clean, parity OK, 41/41 tests pass. Content only — no dependency or runtime changes.
  - Replaces the stub privacy page with a fuller, **app-accurate** plain-language patient notice: who is responsible, what is stored (account, condition/side, goals, weekly ratings & comments, treatments incl. drug/dose/muscles + ITB changes, optional video & wearable readings, professional notes), why, lawful basis (plain), who can see it (visit-code-gated; notes never patient-visible), the service providers (Supabase/Vercel/Sentry/push) and that reminder text is generic with no health detail, EU storage, research use (pseudonymised study code), retention, and the full GDPR rights incl. complaint to **Datatilsynet**. Controller-specific facts are left as `[bracketed]` placeholders.
  - **Honest posture:** still flagged as a **working draft pending DPO/legal review** — not legal advice, not final. Danish/Swedish/Norwegian versions must be done by a qualified translator (not machine-translated) before non-pilot use.
  - **`docs/DPIA.md` (new):** a full **DPIA draft** structured to GDPR Art. 35 / Datatilsynet expectations, grounded in the real data model and the app's actual safeguards — data-category table, recipients/processors table (transfer mechanisms `[to confirm]`), data flows, a reasoned (not determinative) lawful-basis section, necessity & proportionality (no diagnosis/dosing/prediction; per-patient RLS; visit-code gating + rate-limiting; notes withheld from patients; pseudonymised research export; generic push), a risk table with mitigations + blank likelihood/severity, and a sign-off + open-items checklist.
  - **`docs/PRIVACY_NOTICE_DRAFT.md` (new):** the **editable markdown** copy of the patient notice for the DPO/translators to finalise, then sync into the page (the page mirrors it).
  - **Files:** `app/[locale]/privacy/page.tsx` (rewritten), `docs/DPIA.md`, `docs/PRIVACY_NOTICE_DRAFT.md`.

- **Component-test layer + first component suite (`component-tests-1`)** · **CUMULATIVE zip.** Build 110/110, tsc clean, i18n parity OK, **41/41 tests pass** (35 + 6 new).
  - Adds the jsdom + Testing Library layer (`@testing-library/react` 16, `@testing-library/jest-dom`, `jsdom`, and `@vitejs/plugin-react` for the JSX transform). Component tests opt into jsdom per-file (`// @vitest-environment jsdom`), so the pure-logic suites stay in Node and fast.
  - **First component suite — `GoalRatingPicker`** (the patient's 0–10 tap scale): renders an 11-button radiogroup; a tap fires `onChange` once with that number; exactly one button reads as checked for the current value; the "tap a number" prompt shows only until a value is picked; and the endpoint **meaning is anchored to direction** (`higherIsBetter` → 0 = Worst / 10 = Best; `lowerIsBetter` flips them) — the consistency logic the control was built around. `ReadAloudButton` (next-intl + auth + speech) is mocked to a no-op so the control tests in isolation with no providers.
  - **`@types/node` bumped `22.10.0` → `22.19.21`** (devDep): Vitest 4 pulls `vite@8`, which peers `@types/node >= 22.12`. Bumping (rather than `--legacy-peer-deps`) keeps the lockfile clean so `npm ci`/`npm install` resolve everywhere, incl. Vercel. Verified safe — production build still 110/110. Runtime `dependencies` untouched.
  - **⚠ package.json / lock:** several new **devDependencies** + the `@types/node` bump. Easiest is to take the provided `package.json` + `package-lock.json` as-is (hand-diffing 5 new devDeps + a bump + ~800 lock lines is error-prone). Vercel runtime build unaffected (all dev-only); the `npm audit` warnings are entirely in the dev-tooling tree.
  - **CI:** no workflow change — the existing "Unit tests" step now runs the component test too, and `npm ci` installs the new devDeps from the lock.
  - **Files:** `tests/GoalRatingPicker.test.tsx`, `vitest.config.ts`, `package.json`, `package-lock.json`.

- **sv/nb reminder localization + crash-safety fix (`sv-nb-reminders-1`)** · **CUMULATIVE zip.** app tsc clean, i18n parity OK, 35/35 tests pass; the changed `COPY`/`copyFor` logic was type-checked in isolation (the edge function is Deno, excluded from the app build). The only new file vs `test-harness-2` is the edge function.
  - The check-in reminder push text (`send-checkin-notifications/index.ts`) had copy for **en/da only**, indexed directly as `COPY[kind][locale]` with no fallback. Since sv/nb were added (0103), a Swedish/Norwegian subscriber's `locale` resolved to `undefined` and would **throw mid-send**. Fixed three ways: (1) added **sv + nb** titles/bodies for both the initial and the late-reminder notifications (first pass — flagged for native review), matching the app's wording ("status" for check-in, "Mål" for goals); (2) widened the `Subscription`/`DeviceToken` `locale` type to all four locales; (3) added a `copyFor(kind, locale)` resolver that **defaults to English** for any unknown locale, so an unexpected value can never crash a send.
  - **Deploy note:** the edge function is **not** part of GitHub → Vercel — re-deploy `send-checkin-notifications` via the Supabase dashboard (or CLI) for the new copy to take effect.
  - **Files (new):** `supabase/functions/send-checkin-notifications/index.ts`. Cumulative: also carries the full test harness (35 tests), the chart consolidation, and the guarded `0104`.

- **EHR-export unit tests (`test-harness-2`)** · **CUMULATIVE zip.** tsc clean; **35/35 tests pass** (the existing 23 + 12 new). The only genuinely new file vs `consolidate-charts-1` is `tests/ehrExport.test.ts`.
  - Extends the harness to cover `buildEhrExport` — the text clinicians paste into the record, a high-stakes output. 12 cases, pure-logic (no new deps): header variant (injected vs neutral, by modality); treatment summary-line composition + free-text note pass-through; the dose-**reconciliation** guard (omitted when injections sum to the total, surfaced when they don't); body-muscle injections listed before face marks; and `buildGoalLines` — GAS peak level + achieved anchor + end level + wearing-off week, NRS direction handling (`lowerIsBetter` → best is the LOWEST score) with the baseline/target + worst-scale framing, sustained-benefit vs wearing-off, the no-ratings line, and no trailing blank lines. The translator is stubbed to echo `key(k=v,…)`, so each assertion pins both the message key chosen and the interpolated numbers.
  - No source change was needed — `buildEhrExport` + its `Export*` types were already exported; the test takes the arg type via `Parameters<typeof buildEhrExport>[0]`.
  - **Files (new):** `tests/ehrExport.test.ts`. **Carried (cumulative):** the full harness (`vitest.config.ts`, the other 4 `tests/*.test.ts`, `package.json`, `package-lock.json`, `.github/workflows/ci.yml`), the chart consolidation (`app/[locale]/clinician/patient/page.tsx`), and the guarded `0104`. ⚠ Same one-time `package.json`/`package-lock.json` exception as `test-harness-1` (vitest devDep + scripts; runtime `dependencies` untouched).
  - **Remaining test increments (when wanted):** component tests (jsdom + Testing Library) and a Playwright E2E smoke (login → check-in) — both add new dev tooling, so they're a deliberate next step rather than folded in here.

- **Test harness (Vitest) + first unit suite (`test-harness-1`)** · **CUMULATIVE zip.** Build 110/110, tsc clean (now also type-checks `tests/` + `vitest.config.ts`), **23/23 tests pass**.
  - Closes the biggest engineering gap (no automated tests). **Vitest**, Node environment, pure-logic first suite — the only new dependency is `vitest` itself; jsdom + Testing Library (component) and Playwright (E2E) can be layered on later.
  - **Config:** `vitest.config.ts` — Node env, `include: tests/**/*.test.ts`, and a `@/` -> repo-root alias mirroring tsconfig (regex form, so scoped packages like `@tanstack/react-query` are untouched).
  - **Suite (4 files, 23 cases):** `tests/nrsToGas.test.ts` (the five GAS bands, inclusive cut points, lowerIsBetter sign flip), `tests/dates.test.ts` (UTC date arithmetic + 1-based `weekOfCycle` clamp), `tests/goalChartImage.test.ts` (`buildSvg`: three series + legend for NRS goals, patient-only omits the extra series/legend rows, GAS goals plot the GAS field, height 372), `tests/redcapExport.test.ts` (`esc` RFC-4180 escaping; `patientRows` coding — demographics enums, repeat-instance numbering, side-effects checkbox expansion, submitter, GAS +3 -> 1..5; `toCsv` CRLF + consistent column count). Three module-internal pure fns were exported for testability: `buildSvg`, and `patientRows`/`toCsv`/`esc`.
  - **CI:** new **"Unit tests"** step (`npm run test`) in the `verify` job, after i18n parity and before the build — runs on every push + PR (so the suite runs even though it can't be run locally).
  - **⚠ EXCEPTION to the "never ship package.json/lock" rule (deliberate, necessary):** this batch DOES include `package.json` + `package-lock.json`. A test runner has to be a devDependency, and CI's `npm ci` needs the lock to match. The delta is minimal: `+vitest` (devDependency) and `+test`/`+test:watch` scripts; **`dependencies` are untouched** and the Vercel runtime build is unaffected (vitest is dev-only). If your committed `package.json` has drifted since you shared the repo, apply just that diff rather than overwriting — say the word and I'll produce the diff.
  - **Files:** `vitest.config.ts`, `tests/*.test.ts` (4), `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, plus the `export` additions in `lib/goalChartImage.ts` + `lib/redcapExport.ts`.
  - **Next test increments (when wanted):** `buildEhrExport` text assertions; component tests (jsdom + Testing Library); a Playwright E2E smoke (login -> check-in).

- **Consolidated goal charts + CI migration fix (`consolidate-charts-1`)** · **CUMULATIVE zip.** Build 110/110, tsc clean; full CI migration chain replays clean on vanilla Postgres 16 (104 applied, 0 failed).
  - **One chart per goal.** The clinic video is now a single series inside the goal's own trend, matched to the goal's scale — NRS goals show the clinic's 0–10 read, GAS goals show the clinic's GAS level (`plotVal` already selects the right field by chart kind). The separate "Clinic video assessment" chart and the redundant `clinicVideoByGoal` map are gone; `clinicPointsByGoal` now fills for every goal. The PNG export inherits this automatically (it already consumes `clinicPointsByGoal`). `clinicSeriesHeading`/`clinicSeriesHint` keys are now unused (left in messages; parity unaffected).
  - **CI fix — migration 0104.** It did `create extension pg_cron` unconditionally, which errors on the CI's stock `postgres:16` (no pg_cron) and stopped the whole migrations job. 0104 now **guards on extension availability**: it installs + schedules only where pg_cron/pg_net exist (Supabase), and otherwise no-ops with a NOTICE. Verified on a throwaway PG16: applies with `ON_ERROR_STOP=1`, idempotent, and the full numbered chain (0001–0106) applies cleanly. **Re-run the updated 0104 in Supabase** (idempotent — drops + recreates the job; it will still create the cron job there).
  - **Files:** `app/[locale]/clinician/patient/page.tsx`, `supabase/migrations/0104_schedule_checkin_notifications.sql`. (Cumulative: also carries the chart-fixes-1 + redcap-export-1 deltas + the retired `/physio/progress` route.)
  - **⚠ QA (cannot verify here):** open a clinician patient with clinic-video scores and confirm each goal now shows a single trend with the clinic series on the goal's own scale; export one PNG and confirm the three series + legend.

- **Goal-chart fixes (`chart-fixes-1`)** · **CUMULATIVE zip.** Build 110/110, tsc clean.
  - **Clinic-video line de-emphasised** in `GoalProgressView`: it was drawn in `--color-ink` (pure white in dark mode), so it dominated the patient's own (sage) line. Now `--color-ink-muted` + thinner stroke + matching legend swatch, so the patient self-report reads as primary and the clinic read recedes.
  - **PNG export now draws all three series.** `lib/goalChartImage.ts` gained optional `physioPoints` / `clinicPoints` + a `legend` label object and renders the physiotherapist (amber diamonds, dashed) and clinic-video (muted squares, dotted) series on the patient's axis, with a legend row (image height 350→372). The clinician patient page passes the same per-goal physio + clinic-NRS data the on-screen trend uses, so the exported chart mirrors what's on screen. Patient-only charts are unchanged (legend shows just Patient).
  - **Files:** `components/clinician/GoalProgressView.tsx`, `lib/goalChartImage.ts`, `app/[locale]/clinician/patient/page.tsx`. (Also carries the retired `/physio/progress` redirect + the full redcap-export-1 delta.)
  - **Open question (not changed): the duplicate per-goal chart.** For an NRS goal the clinic clip is scored on BOTH scales — its NRS read overlays the main trend AND its GAS read renders as a separate "Clinic video assessment" chart below, with the same goal title. Pending a decision on whether to consolidate to one chart per goal.
  - **⚠ QA (cannot verify here):** export a goal chart and eyeball the PNG — confirm the physiotherapist + clinic-video series and the legend render correctly.

- **Pseudonymised REDCap CSV export (`redcap-export-1`)** · **CUMULATIVE zip.** NEW migration `0106`. Build 110/110, tsc clean, parity holds. **0106 verified on a throwaway Postgres; client mapping statically verified.**
  - **Migration `0106_research_export.sql`:** (1) `study_code` — a stable per-patient pseudonym (`TC-0001`...) used as REDCap `record_id`; assigned by the app to research-consented patients, clinician-visible so the clinic holds the code<->identity mapping. NOT the app id, NOT a name. (2) SECURITY DEFINER `export_research_dataset()` — clinician-gated (`current_app_role() = 'clinician'`); for every patient with `research_consent` and `research_consent_purged_at IS NULL`, returns a JSONB object across all cycles + 11 instruments (enrolment, treatment_cycle, treatment, muscle, goal, checkin, goal_rating, physio_assessment, physio_goal_rating, itb, itb_dose_change) in RAW form, with a per-cycle `goal_index` reused by goals / goal_ratings / physio_ratings. Idempotent. **Harness:** non-consented + purged patients excluded; `TC-0001` assigned; all instrument arrays present; goal_index 1/2 and ratings link to index 1; side-effects preserved as array; training-days collapsed to a count; non-clinician blocked; re-apply clean.
  - **Schema grounding:** every column was checked against the LIVE app reads, not just migrations — this caught the medication rename to `current_medication`/`previous_medication`, that demographics/consent live on the `patient` table (not a separate patient_info table), that `treatment_cycle.modality` exists (0070), and that checkin training-days are arrays (exported as counts).
  - **Client `lib/redcapExport.ts`:** `useExportRedcapDataset()` calls the RPC, flattens each patient into REDCap rows (one non-repeating `enrolment` row + one row per instance of each repeating instrument with `redcap_repeat_instrument`/`redcap_repeat_instance`), maps every enum to the dictionary's numeric codes (GAS −2..+2 → 1..5, yes/no → 1/0, dates → YYYY-MM-DD), expands side-effects to `ci_side_effects___1..___5`, builds an RFC-4180 CSV (CRLF, no BOM), and downloads it. The coding lives here, mirroring `redcap/treatment_companion_datadictionary.csv`.
  - **UI:** a "Research data export" section + Download button on the clinician observations page (`clinician/observations`), clinician-gated. New i18n namespace `clinician.researchExport` × 4 langs; shows an exported-N-patients / N-rows confirmation and an error toast.
  - **Files:** `supabase/migrations/0106_research_export.sql` (new), `lib/redcapExport.ts` (new), `app/[locale]/clinician/observations/page.tsx`, `messages/{en,da,sv,nb}.json`.
  - **Two honest QA flags:** (1) `record_id` is approach A (app-assigned `TC-NNNN`); the DPO should approve it or replace it with a study-team-assigned list — the column is harmless if unused. (2) The CSV must be test-imported into a real REDCap project (codings / repeat-instrument config / date format) — live REDCap import cannot be verified from here. Withdrawn-but-not-purged patients are still included (a study decision — see the reconciliation report).

- **Pseudonymised REDCap CSV export (`redcap-export-1`)** · **CUMULATIVE zip** (carries `adjustment-loop-1` too). NEW migration `0106`. Build 110/110, tsc clean, parity holds. **0106 verified on a throwaway Postgres (Method D).**
  - **Migration `0106_research_export.sql`:** (1) `create sequence study_code_seq` + `patient.study_code text unique` — the REDCap `record_id` pseudonym (**approach A**: app assigns `TC-0001`, `TC-0002`, … to each research-consented patient; clinician-visible so the clinic holds the code↔identity mapping; not the app id, not a name). (2) SECURITY DEFINER `export_research_dataset()` — gated `current_app_role() = 'clinician'`; assigns codes to any consented patient lacking one; returns a JSONB array, one object per patient (research_consent AND research_consent_purged_at IS NULL), each embedding all cycles/sessions/muscles/goals/checkins/goal_ratings/physio/physio_ratings/itb/itb_doses with `cycle_number` denormalised onto children and a CTE giving stable per-cycle `goal_index` reused by goals + goal_ratings + physio_ratings. RAW values only (enum strings, ISO dates, numbers) — coding happens client-side. Idempotent.
  - **Harness results (seeded all 12 tables):** patients=1 (non-consented excluded); record_id=TC-0001; cycles=1; goals=2 with goal_index 1,2; goal_rating links goal_index 1; physio_rating links goal_index 2; side_effects array preserved; training_days = array cardinality (3); muscles=1; itb_doses=1; non-clinician refused; re-apply clean.
  - **Client `lib/redcapExport.ts`:** `useExportRedcapDataset()` calls the RPC, flattens each patient into REDCap rows (one non-repeating `enrolment` row + one row per instance of each repeating instrument), maps every enum to the dictionary's numeric codes (the single source of the coding, mirroring `redcap/treatment_companion_datadictionary.csv`), maps GAS −2..+2 → 1..5, yes/no → 1/0, dates → YYYY-MM-DD, expands side-effects to `ci_side_effects___1..___5`, builds an RFC4180 CSV (record_id, redcap_repeat_instrument, redcap_repeat_instance, then every field) and downloads it.
  - **UI:** a **Research data export** section on `app/[locale]/clinician/observations/page.tsx` (clinician-gated) — a button that runs the export and reports `{patients}`/`{rows}`. i18n `clinician.researchExport.{heading,intro,button,working,result,error}` × 4 langs.
  - **Files (new):** `supabase/migrations/0106_research_export.sql`, `lib/redcapExport.ts`. **(modified):** `app/[locale]/clinician/observations/page.tsx`, `messages/{en,da,sv,nb}.json`.
  - **QA gates (cannot verify from here):** (1) **record_id pseudonym = approach A** — DPO to approve or replace with a study-team list (the `study_code` column is harmless if unused). (2) **Import-test the CSV in a real REDCap project** — codings, date formats, checkbox columns, and the repeat-instrument config. (3) Withdrawn-but-not-purged patients are currently still exported (a study decision — see the reconciliation report).

- **Therapist adjustment-request status loop — option A (`adjustment-loop-1`)** · **CUMULATIVE zip.** NEW migration `0105`. Build 110/110, tsc clean, parity holds. **0105 verified on a throwaway Postgres (Method D).**
  - **Migration `0105_adjustment_request_status.sql`:** adds `adjustment_status` (default `open`, check open/addressed/dismissed) + `adjustment_resolved_at` + `adjustment_resolved_by` to `physio_goal_rating`, and a SECURITY DEFINER `resolve_adjustment_request(p_rating_id, p_status)` RPC — role-gated to the physician (`current_app_role() = 'clinician'`), validates status in (addressed, dismissed), authorises via `clinician_can_access_patient` on the rating's patient, stamps `now()` + `auth.uid()`. Idempotent. **Harness results:** apply clean; physiotherapist blocked; bad status blocked; no-access blocked; not-found handled; valid resolve sets dismissed+ts+uid; re-apply clean.
  - **Option A (clinician-side only):** resolving simply drops the request from the clinician's OPEN list. The therapist is NOT shown the outcome (no new downward channel); status/when/who are stored for audit only.
  - **UI:** Add/Dismiss buttons on BOTH clinician surfaces that render adjustment requests — the patient-page inline list and `TherapistInputPanel` (treatment page). Both read the same `['clinicianPatient']` data filtered to `needsAdjustment && adjustmentStatus === 'open'`, so resolving anywhere refetches and the item disappears from both. Errors surface a toast; success = the item vanishes.
  - **Data plumbing:** `physio_goal_rating` select + `ClinicianPhysioAssessment` type + mapping in `clinicianPatient.ts` now carry `id` + `adjustmentStatus`; same in `physioAssessment.ts` (the physio's own view) + a new `useResolveAdjustmentRequest` hook (invalidates `['physioAssessments']` and `['clinicianPatient']`). i18n: `clinician.patient.physioAdjustment{Address,Dismiss,Error}` × 4 langs.
  - **Files:** `supabase/migrations/0105_adjustment_request_status.sql` (new), `lib/supabase/physioAssessment.ts`, `lib/supabase/clinicianPatient.ts`, `app/[locale]/clinician/patient/page.tsx`, `components/clinician/TherapistInputPanel.tsx`, `messages/{en,da,sv,nb}.json`.
  - **Also in this delivery (separate, not web code):** `redcap/treatment_companion_datadictionary.csv` finalised (86 fields) — validated against the app enums; only 3 changes (sex split to 4 codes; added `affected_side` + `ambulation`) + PII tags on 17 free-text fields. `redcap/REDCAP_RECONCILIATION.md` documents it + the DPO decisions. Import-validated (variable names, first field, choices).
  - **Next (gated): the pseudonymised CSV export** that populates the dictionary. Blocker = where `record_id` (the study pseudonym) comes from — no such field exists in the app. Options: (A) app-generated stable per-patient study code [recommended]; (B) deterministic salted hash of patient id; (C) per-export sequential, study team maps. DPO-relevant — needs Nikolaj's pick before build.

- **Reminder scheduling (pg_cron) + auto-apply saved language (`reminder-cron-1`)** · **CUMULATIVE zip; carries everything since the translation (picker, EHR rework) + migration `0103`.** NEW migration `0104`. Build 110/110, tsc clean, parity holds.
  - **Auto-apply language on sign-in:** `app/[locale]/login/page.tsx` — the post-sign-in redirect now routes to `profile.preferredLocale` (falling back to the current locale) instead of whatever language the login page was in. So a returning user lands in their saved language. The pre-auth links (forgot-password / signup / privacy) still use the current-locale `prefix`. Closes the follow-up left open by `language-picker-1`.
  - **pg_cron reminder trigger (`0104_schedule_checkin_notifications.sql`):** schedules the `send-checkin-notifications` Edge Function once daily (07:00 UTC) via `cron.schedule` + `net.http_post`. The function already self-selects, each UTC day, the patients whose `notify_weekday == today` and sends initial + ~6-day-follow-up reminders — so one daily call is enough. **Secrets via Supabase Vault by name** (`cron_secret`, `checkin_fn_url`) so nothing sensitive is committed; the migration is idempotent (drops+recreates the named job). Requires pg_cron + pg_net (enable in Dashboard -> Database -> Extensions if CREATE EXTENSION errors).
  - **Manual steps (NOT in the zip->Vercel flow; in BUILD.txt):** (a) deploy the repo's current `supabase/functions/send-checkin-notifications/index.ts` via the Supabase dashboard Edge Functions editor — the rewritten weekday-aware version may not be live yet; (b) confirm the function's secrets are set (`CRON_SECRET`, `FCM_SERVICE_ACCOUNT`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`); (c) store the two Vault secrets by hand (real values, do NOT commit); (d) run `0104`; (e) dry-run test with `{"dryRun": true}` (reports the plan, sends nothing). I cannot execute or verify any of this from here.
  - **Function trigger contract (confirmed by reading it):** `Authorization: Bearer <CRON_SECRET>`; body `{}` = real run, `{"dryRun":true}` = plan only, `{"testProfileId":"<id>"}` = one test push.
  - **Files:** `app/[locale]/login/page.tsx`, `supabase/migrations/0104_schedule_checkin_notifications.sql` (new). Cumulative bundle also carries the EHR-export rework, the chart PNG, the language picker, and `0103`.
  - **Still gated (asked, awaiting input):** adjustment-request status loop (needs the state model decided before the migration); REDCap reconciliation (needs the actual REDCap data dictionary + study-team/DPO coding decisions).

- **EHR export — per-goal chart PNG (`chart-png-1`)** · **CUMULATIVE zip; carries the sv/nb translation + language picker + EHR text rewrite + migration `0103` (safe to re-run).** Build 110/110, tsc clean, en/da/sv/nb parity holds. Completes the EHR-export rework.
  - **New `lib/goalChartImage.ts`** — a framework-free `downloadGoalChartPng(input)` that builds a self-contained chart SVG (goal text + cycle header + chart + one-line response caption) and rasterises it to PNG via a 2× canvas, mirroring FaceMap's export technique. **Print-styled on purpose:** white background, dark ink, plain sans font, fixed 680px width — so it reads correctly pasted into a (usually white) record regardless of the app's theme. NRS goals plot the 0–10 line with baseline/target dashed reference lines; GAS goals plot the five attainment bands with a faint ≥-expected tint. A skipped week shows as a line gap; a dotted vertical marks wearing-off. Peak/wearing/best/end are recomputed on the direction-normalised GAS value, matching the text export.
  - **One image per goal**, surfaced in two places, both calling one shared renderer the patient page owns (`makeChartDownloader(g)`):
    - **On each goal graph** — `GoalProgressView` gained an optional `onExportChart?: () => void`; when set, a small download button renders beside the expand control. Wired on the active BoNT goal graphs (site A).
    - **In the export dialog** — `ExportModal` gained an optional `goalCharts?: {id, goalText, onDownload}[]`; it renders a ‘Goal response charts’ section with a PNG button per goal, covering **every** goal (active + archived, BoNT + ITB).
  - **i18n:** added 9 chart labels to `ehrExport` (chartWeek, chartBaseline, chartTarget, chartGasScale, chartGas{MuchBetter,Better,Expected,Worse,MuchWorse}), `clinician.export.chartsHeading`, and `treatment.saveChart` — all four languages, parity preserved. Chart captions/subtitles reuse the existing export strings, so they read identically to the pasted text.
  - **Verification:** beyond build + tsc, both chart types were rendered to PNG in-sandbox (via a faithful port + cairosvg) and visually checked — layout, gaps, markers, captions all correct. **Remaining QA (cannot be done here):** confirm the in-app browser-canvas PNG pastes and renders correctly in your actual EHR; the app substitutes a sans font during rasterisation, so spacing may differ slightly from the samples.
  - **Files:** `lib/goalChartImage.ts` (new), `components/clinician/GoalProgressView.tsx`, `components/clinician/ExportModal.tsx`, `app/[locale]/clinician/patient/page.tsx`, `messages/{en,da,sv,nb}.json`. Cumulative bundle also carries the EHR text rewrite (`lib/ehrExport.ts`), the language picker, i18n infra, and `0103`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **EHR export — text rewrite to a portable format (`ehr-export-text-1`)** · **CUMULATIVE zip; carries the sv/nb translation + language picker + migration `0103` (safe to re-run).** Build 110/110, tsc clean, en/da/sv/nb parity holds. SV/NB phrasing is first-pass — flag for native review.
  - **Rewrote `lib/ehrExport.ts`** to the agreed clinician-to-clinician handover shape. Drops the patient name header AND the verbatim patient-comments block (both already live in the EHR). Two sections only:
    - **Treatment** — one product line (`{product} · {total} U · {dilution} · {guidance}`, date now only in the header), then the muscle list as `{side} {muscle} — {dose} U` (face marks prefixed `face:`), optional session note, and the dose-reconciliation line if the listed doses don't match the recorded total. Doses use the clinical abbreviation (`U` en / `E` da/sv/nb).
    - **Goals & response** — NRS goals: `Baseline NRS X → target NRS Y  (0–10, 10 = worst|best)` then `Best NRS Z (wkN) · wearing off from wkM · end of cycle NRS W (wkK)`. GAS goals: `Best (wkN): <level in words> — "<achieved anchor description>"` then `End of cycle (wkK): <level> · <wearing-off|benefit sustained>`. The five GAS levels are spelled out (much worse…much better than expected), and the achieved anchor text is quoted, so a clinician who can't see the goal's setup still understands the result. Wearing-off / peak / end are computed on the direction-normalised GAS value, so the same logic serves both kinds.
  - **`ExportGoal` extended** with `nrsBaseline` / `nrsTarget` / `anchors`; the patient-page call site now passes `g.nrs?.baselineValue` / `g.nrs?.targetValue` / `g.gas`. Removed the unused `patient` arg.
  - **i18n:** rewrote the `ehrExport` namespace in all four languages — removed 21 obsolete keys, added 16 new ones (header/headerInjected, faceInjectionLine, nrsBaselineTarget, nrsScaleWorst/Best, nrsBestEnd, gasPeakLine/gasEndLine, the five gasLevel* phrases, wearingOffFrom, benefitSustained) and changed unitsTotal/injectionLine/reconciliation/goalsHeading. Danish keeps its `forløb` (cycle) / `uge` (week) conventions; sv/nb use period/periode.
  - **Still to do (next batch):** the **per-goal GAS/NRS chart PNG export** — a dedicated print-styled chart→PNG renderer (white bg, fixed width), one image per goal, with a button in `components/clinician/ExportModal.tsx` AND on each goal's graph (`GoalProgressView` in the patient page). Mockups approved. The text export is unchanged by that work.
  - **Files:** `lib/ehrExport.ts`, `app/[locale]/clinician/patient/page.tsx`, `messages/{en,da,sv,nb}.json`. Cumulative bundle also carries the language picker (`components/settings/LanguageSelect.tsx`, `lib/supabase/locale.ts`, `login`/`profile` pages) + i18n infra + `0103`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Four-language picker — login + settings (`language-picker-1`)** · **CUMULATIVE zip; carries the completed sv/nb translation + migration `0103` (safe to re-run).** Build 110/110, tsc clean.
  - New `components/settings/LanguageSelect.tsx` with two variants: a compact `EN · DA · SV · NB` segmented control pinned at the top of the **login** screen (pre-auth — switches the URL locale only), and endonym cards (English / Dansk / Svenska / Norsk) in **profile/settings**, placed above Appearance, that switch the URL locale AND persist `preferred_locale`.
  - New `lib/supabase/locale.ts` → `useSetPreferredLocale` (mirrors the appearance setters: optimistic `patchProfile` + `profile` self-update on `id` + `refreshProfile`). Applies live; **not** part of the save-gated profile form, so it never trips the unsaved-changes guard.
  - Locale switch is a manual path rewrite honouring `localePrefix: 'as-needed'` (English = no prefix; others carry `/<locale>`). Language names are endonyms, so they need no translation; added one heading key `profile.sectionLanguage` in all four languages (en/da/sv/nb), parity preserved.
  - **Files:** `components/settings/LanguageSelect.tsx` (new), `lib/supabase/locale.ts` (new), `app/[locale]/login/page.tsx`, `app/[locale]/profile/page.tsx`, `messages/{en,da,sv,nb}.json`.
  - **Known follow-up (not built):** `preferred_locale` is persisted but not yet auto-applied on sign-in — the login redirect uses the current URL locale, so a returning user lands in whatever language the login page was in, not necessarily their saved one. Small wire-up if wanted.
  - **Cumulative bundle** also includes (unchanged, still uncommitted): `messages/{en,da,sv,nb}.json` (full sv/nb translation), `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — STRING TRANSLATION COMPLETE (localization pass 12)** · **Tag:** `localization-sv-nb-12` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. **`missing in sv: 0`, `missing in nb: 0`, ISSUES: 0.** SV/NB first-pass — flag for native review.
  - **Translated this pass (final ~56 keys each, 1639 total — 100%):** the professional strings inside `intro` (clinician/physio welcome + how-it-works, reading the progress graph, the action row, recording-a-treatment / reporting-progress walkthroughs) and `help` (clinician & physio patient-page help, recording a treatment, reading the history, recording a goal, reviewing a suggestion).
  - **Milestone: the entire app — patient, both therapist surfaces, the full clinician console, admin, EHR export, all dialogs and helper text — is now translated into Swedish and Norwegian at full parity with English and Danish.** `messages/sv.json` and `messages/nb.json` are no longer partial; the `i18n/request.ts` deep-merge still safely backstops with English for any future-added key.
  - **Only remaining localization work:** build the **four-language picker UI** (login screen + profile/settings, persisting `preferred_locale`, offering en/da/sv/nb). The DB already accepts all four (migration 0103) and `lib/supabase/auth.tsx` already types the locale. Separate deferred item: localize push-notification text (the `send-checkin-notifications` edge fn + the 0017/0102 locale checks are still en/da only).
  - **Reminder:** all sv/nb strings are Claude's first pass and must be reviewed by native Swedish/Norwegian speakers before clinical use.
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — visit recap, ITB, clinical-data labels (localization pass 11)** · **Tag:** `localization-sv-nb-11` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~72 more keys each, ~1583 total):** `visitChanges` (the since-last-visit recap — check-in count, missed weeks, goal-movement chips, home-days/cadence/therapist/video stats, GAS descriptions, the videos list, wearable trend), `itb` (intrathecal-baclofen dose tracking — start track, current dose, log a dose change, titration timeline), and the small clinical-data label sets `etiology` (stroke, TBI, CP, MS, SCI, HSP, anoxic), `ambulation` (independent / with aid / wheelchair / non-ambulant), `side` (left/right/bilateral), and `careTeamNotes` (the patient-facing feed of notes the physician and therapist write to each other).
  - **Remaining (still English fallback):** only the professional strings still inside `intro` (the clinician/physio how-it-works walkthroughs) and `help` (clinician/physio page help) — ~56 keys. After that **every string is translated**, and the only remaining localization work is building the **four-language picker UI** (login + profile).
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — admin console + EHR export text (localization pass 10)** · **Tag:** `localization-sv-nb-10` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~122 more keys each, ~1511 total):** `admin` (the account-management console — create/edit/deactivate/delete accounts, roles & profession, search/filter/paginate, password reset, the active-access view, and the research-consent pending-deletion queue) and `ehrExport` (the copy-into-EHR summary text — treatment line, dilution/guidance, the injection list with sides, the goal/GAS course incl. peak, time-to-GAS≥0, wearing-off and end-of-period lines, and patient comments).
  - **Remaining (still English fallback):** `visitChanges` (~28 — the since-last-visit change list), `itb` (~23 — intrathecal-baclofen goals), plus the professional strings still inside `intro` (clinician/physio how-it-works walkthroughs) and `help` (clinician/physio page help) — ~107 keys. After that, every string is translated and only the **four-language picker UI** remains to be built.
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — clinician complete + therapist forms (localization pass 9)** · **Tag:** `localization-sv-nb-9` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~96 more keys each, ~1389 total):** the last of `clinician` — `wearable` (importing wearable/third-party measurements via CSV or manual entry), `export` (the copy-to-EHR panel), `goalHandoff` (per-goal notes to the therapist) — **so the entire `clinician` namespace (480) is now translated**; plus the whole `physioForms` namespace (54): the therapist's rate-this-visit form (per-goal rating, treatment-change flag, note to the physician), and the suggest-a-goal / suggest-a-muscle forms.
  - **Clinician + both physio surfaces are now fully covered in sv/nb.** Remaining English fallback: `admin` (~80 — the account-management console), `ehrExport` (~42 — the standalone export builder), `visitChanges` (~28), `itb` (~23 — intrathecal-baclofen goals), plus the professional strings still inside `intro` (clinician/physio how-it-works) and `help` (clinician/physio page help). ~229 keys left, then the language picker.
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — physician console, part 2: video & face map (localization pass 8)** · **Tag:** `localization-sv-nb-8` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~163 more keys each, ~1293 total):** the `clinician` video + face cluster — `video` (player, clinic-score levels, delete/archive), `videoProtocol` (the recording task), `baseline` (filming the start-of-cycle reference clip, incl. the consent gate), `videoQueue` (scoring clips in sequence), `archive` (archived clips with consent flags), `videoHub` / `videoPanel` / `videoGuide` (per-goal and patient-level video setup), and `faceMap` (the face injection map — marks, dose-by-colour/symbol, copy left/right, PNG export).
  - **`clinician` namespace is now 438/480.** Only the end remains: `wearable` (third-party/wearable data import, ~33), `export` (the EHR copy panel, 5), `goalHandoff` (per-goal notes to the therapist, 4) — these fold into the next batch alongside `physioForms` (~54), `admin` (~80), `ehrExport` (~42), `visitChanges` (~28), `itb` (~23), plus the professional strings in `intro`/`help`.
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — physician console, part 1 (localization pass 7)** · **Tag:** `localization-sv-nb-7` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~275 more keys each, ~1130 total):** the core of the `clinician` namespace — `unlock` (entering a visit code), `session` (open/switch/end patients), the `patient` dashboard (active goals, patient goal-suggestions, medication, therapist input, start-new-cycle controls, training/wearable/ITB panels, retire/reactivate/archive goal flows), `review` (acting on a patient suggestion), `approve` (writing the patient text + SMART + NRS question/direction + GAS anchors), and `history` (the cross-cycle trends view: dose-per-cycle, benefit duration, dose-per-muscle, re-treatment timing, goals-by-cycle).
  - **Remaining (still English fallback):** the rest of `clinician` (~205 — the video player + scoring queue, the face injection map, wearable/third-party data import, the EHR export panel, goal-handoff notes, baseline video, video hub), then `physioForms` (~54), `admin` (~80), `ehrExport` (~42), `visitChanges` (~28), `itb` (~23), plus the professional strings inside `intro`/`help`. Done in 2 more clinician sub-passes + the rest.
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — physician console part 1 (localization pass 7)** · **Tag:** `localization-sv-nb-7` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~168 more keys each, ~1023 total):** the first slice of the `clinician` namespace — `clinician.unlock` (enter visit code), `clinician.session` (end/switch/reopen patients), `clinician.history` (the full cross-period analytics: dose-per-period, benefit duration, dose-per-muscle, re-treatment timing, goals-by-period, the period-by-period detail), and `clinician.patient` rows 1–n (viewing context, active goals, medication editor, patient-suggestion + therapist-input panels, start-new-period dialog, goal archive / retire-with-outcome / reactivate).
  - **Remaining in `clinician` (~312, still English fallback):** the rest of `clinician.patient` (beyond medication/retire), plus suggestion-review, dashboard, and any other clinician sub-namespaces (lines ~361–672). Then `physioForms` (~54), `admin` (~80), `ehrExport` (~42), `visitChanges` (~28), `itb` (~23), and the professional strings inside `intro`/`help`. 1–2 more clinician sub-passes.
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — recording treatments & goals (localization pass 6)** · **Tag:** `localization-sv-nb-6` · **CUMULATIVE zip; includes migration `0103` (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~151 more keys each, ~855 total):** the two most-used physician screens — `treatment` (recording an injection: product, dilution, guidance modality, muscles + doses, totals, areas, the therapist handoff note, the reference chart) and `newGoal` (recording/calibrating a goal: NRS question + direction, GAS outcome levels, the optional video task).
  - **Remaining (still English fallback):** `clinician` (~480 — the console shell, dashboards, suggestion review, cross-cycle history, shared clinician UI), `physioForms` (~54), `admin` (~80), `ehrExport` (~42), `visitChanges` (~28), `itb` (~23), plus the professional strings inside `intro`/`help`. The `clinician` block is large — do it in 2–3 sub-passes.
  - **Cumulative bundle** (same fileset): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — physio surface + goal-management sub-namespaces (localization pass 5)** · **Tag:** `localization-sv-nb-5` · **CUMULATIVE zip** (everything since onboarding-copy-1). **Includes migration `0103` — run in Supabase if not already (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~158 more keys each, ~704 total):** the full **physio** surface (unlock, report progress, suggestions, muscle flags, clinic note, recap), the clinical-background editor (`patientInfo`), the clinician's since-last-visit note (`visitNote`), goal editing/history/linking (`editGoal`, `goalHistory`, `linkGoal`), the therapist→clinic note (`therapistNote`), and `lastTreatment`.
  - **Remaining (still English fallback):** the physician console core — `clinician` (~480), `treatment` (~95), `newGoal` (~56), `physioForms` (~54), `admin` (~80), `ehrExport` (~42), `visitChanges` (~28), `itb` (~23) — plus the professional-only strings inside `intro`/`help`. (Big clinical-terminology block; next passes.)
  - **Terminology note:** kept "period" for *treatment cycle* (matching the patient strings) and left NRS / GAS / SMART / AFO untranslated as clinical standards. Flag for native review.
  - **Cumulative bundle:** `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — patient settings + check-in components: patient surface COMPLETE (localization pass 4)** · **Tag:** `localization-sv-nb-4` · **CUMULATIVE zip** (carries everything since onboarding-copy-1). **Includes migration `0103` — run in Supabase if not already (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~141 more keys each, ~546 total):** patient **settings** (`appearance`, `profile`, `notifications`) and the two remaining patient **check-in components** (`goalVideo` — the optional video; `training` — the weekly training-days marker).
  - **Patient surface is now fully localized in sv + nb** — home, weekly check-in (incl. training days + optional video), goals, visit code, onboarding, help, auth, consents, settings, and shared chrome.
  - **Remaining (still English fallback): the professional console only** — `clinician` (~480), `physio`, `admin`, `treatment`, `newGoal`, `physioForms`, `ehrExport`, `visitChanges`, `itb`, `editGoal`, `goalHistory`, `linkGoal`, `therapistNote`, `lastTreatment`, plus `patientInfo` (clinical-background editor) and `visitNote` (clinician's since-last-visit note), and the professional-only strings inside `intro`/`help`.
  - **Cumulative bundle** (same fileset as pass 3, updated translations): `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`, `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql`, `messages/sv.json`, `messages/nb.json`. Deploy: run 0103 (safe to re-run) → drop files → push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — sign-in, sign-up, password reset & consents (localization pass 3)** · **Tag:** `localization-sv-nb-3` · **CUMULATIVE zip** (carries every file changed since onboarding-copy-1, as it's not yet committed). **Includes migration `0103` — run it in Supabase if you haven't (safe to re-run).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~100 more keys each, ~405 total):** the full auth/entry flow — `signup` (patients + therapists self-register), `login`, `forgotPassword`, `resetPassword` — and the **consent screens in full** (`videoConsent`, `researchConsent`, `educationalConsent`, both patient-facing and clinician-facing strings, since consent text should be fully localized).
  - **Patient surface coverage:** with this pass the patient-facing app is essentially fully localized (home, check-in, goals, visit code, onboarding, help, auth, consents, shared chrome). Still English (next): **settings** (`appearance`/`notifications`/`profile`/`patientInfo`) and the **clinician/physio/admin console** (incl. the professional `intro`/`help` strings).
  - **This zip is cumulative** — it contains: `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx` (the onboarding-copy-1 patient-help changes); `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `supabase/migrations/0103_allow_sv_nb_locales.sql` (the sv/nb infrastructure + migration); and `messages/sv.json` + `messages/nb.json` (all three translation passes). If you already committed some of these, re-copying is harmless.
  - **Deploy:** run `0103` in Supabase (safe even if already run) → drop all files → commit & push. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — onboarding, patient help & shared chrome (localization pass 2)** · **Tag:** `localization-sv-nb-2` · **Message-only — no migration, no infra, no new deps. Builds on `localization-sv-nb-1` (which added routing + migration 0103 — deploy that first).** Build 110/110, tsc clean. SV/NB first-pass — flag for native review.
  - **Translated this pass (~113 more keys each, ~305 total):** the patient onboarding wizard steps (`intro` — welcome, comfort/appearance, weekly-check-in explainer, “a few details” + sex + months, “at your appointment”) and shared wizard nav; the patient-facing per-page **help** (`help.patientHome`, `help.goals`, `help.checkin`) + help dialog chrome; and shared chrome: `sex`, `months`, `weekday`, `a11y` (screen-reader labels), `accountMenu`, `errorState`.
  - **Still English (next passes):** the *professional* onboarding steps inside `intro` (clinician/physio how-it-works + graph/record/actions walkthroughs) and the *professional* `help` entries (clinicianPatient/treatment/history/newGoal/suggestion/physioPatient/physioProgress) — these go with the clinician/physio console pass. Also still English: auth (`login`/`signup`/`forgotPassword`/`resetPassword`), settings (`appearance`/`notifications`/`profile`/`patientInfo`), consents.
  - **Files (2):** `messages/sv.json`, `messages/nb.json`. Drop in, commit, push — no SQL, no `npm install`. Do not overwrite package.json/lock.

- **Swedish + Norwegian Bokmål — patient app core (first localization pass)** · **Tag:** `localization-sv-nb-1` · **Includes migration `0103` (run in Supabase) — first SQL in several batches.** Build **110/110** (re-baselined from 62 — two new locales ≈ doubled the per-locale static pages), tsc clean. SV/NB are Claude's first pass — flag for native review (same convention as Danish).
  - **Two new locales live:** `sv` (`/sv`) and `nb` (Norwegian Bokmål, `/nb`) added to `i18n/routing.ts`. English stays at `/`, Danish `/da`. `AppLocale` widens automatically; middleware picks them up.
  - **Graceful English fallback:** `i18n/request.ts` now deep-merges each locale's messages over the English baseline, so any key a locale hasn't translated yet — or any English key added later — renders in English instead of throwing a missing-message error. This is what lets `sv.json`/`nb.json` ship partial and grow over time.
  - **Translated this pass (≈192 keys each):** the entire **patient app surface** — home, visit code, the suggest-a-goal flow, and the weekly check-in flow — plus shared `feedback`/`safety`/`domain`/`importance`/`app`. A Swedish/Norwegian patient can do their weekly check-in and suggest goals fully in-language.
  - **Falls back to English for now (next passes):** onboarding wizard (`intro`), per-page help (`help`), auth (`login`/`signup`/`forgotPassword`/`resetPassword`), settings (`appearance`/`notifications`/`profile`/`patientInfo`), consents, training/goalVideo, and the entire clinician/physio/admin console. Nothing breaks — it shows English until translated.
  - **Migration `0103_allow_sv_nb_locales.sql`:** relaxes the `profile.preferred_locale` CHECK (was `('en','da')`) to allow `sv`/`nb`, so the upcoming language picker can store them. (Push-token locale checks in 0017/0102 left as-is — push text isn't localized to sv/nb yet; separate follow-up.) **Run this in the Supabase SQL editor.**
  - **Also widened:** `preferredLocale` type in `lib/supabase/auth.tsx` to `'en'|'da'|'sv'|'nb'`.
  - **Files:** `i18n/routing.ts`, `i18n/request.ts`, `lib/supabase/auth.tsx`, `messages/sv.json`, `messages/nb.json`, `supabase/migrations/0103_allow_sv_nb_locales.sql`. **Deploy: run 0103 in Supabase → drop files → commit & push.** Do not overwrite package.json/lock.
  - **Build marker note:** static-page count is now **110/110** for four locales (was 62 for two). Future builds expect 110.

- **Onboarding / per-page help copy refresh (patient)** · **Tag:** `onboarding-copy-1` · **Web only — no migration, no new deps.** EN + Danish (Danish is first-pass — flag for native review). Build 62/62, tsc clean.
  - **Audit finding:** the clinician & physio *patient-page* help (`clinicianPatient`/`physioPatient`) is already correctly mounted (`clinician/patient/page.tsx:834`, `physio/patient/page.tsx:373`) — not orphaned. The genuine gaps were all patient-side.
  - **`help.patientHome` rewritten** to describe the whole home screen (the weekly check-in at the top, the *Your goals* row, *Show visit code*, and the care-team notes) — it previously mentioned only check-ins.
  - **New `help.goals` (Title+Body)** for the goals page, which had been reusing the home help. `app/[locale]/goals/page.tsx` now passes `helpPageKey="goals"` (was `"patientHome"`).
  - **`intro.patientBody`** (patient onboarding wizard, first step) now notes the home screen also shows their goals and any care-team notes.
  - **Files (3):** `messages/en.json`, `messages/da.json`, `app/[locale]/goals/page.tsx`. Drop in, commit, push — no `npm install`, no SQL. **Do not overwrite package.json/lock.**
  - **Deferred to the next batch:** **Swedish + Norwegian Bokmål** — add `sv` + `nb` to the i18n routing/config + middleware, widen `preferredLocale` to `'en'|'da'|'sv'|'nb'`, generate full first-pass `messages/sv.json` + `messages/nb.json` (~1640 keys each, flagged for native review), and offer all four in the upcoming login/profile language picker. **Adding 2 locales raises the static-page count above 62 — re-baseline the build marker then.**

- **Patient front-page fixes + account-menu bug** · **Tag:** `frontpage-fixes-1` · **Web only — no migration, no new deps, no i18n change.** Six contained fixes; build 62/62, tsc clean.
  - **Care-team notes no longer crash on expand.** `lib/dates.ts` `formatLongDate` assumed a date-only input (`iso + 'T00:00:00Z'`), but `CareTeamNotes` passes a full `created_at` timestamp → `...ZT00:00:00Z` → invalid date → `Intl.format()` threw → the "Something went wrong" route boundary (crash only on expand, since the collapsed view never formats a date). Now accepts both forms (only synthesizes midnight-UTC when there's no `T`) and returns `''` instead of throwing on a bad value. Same guard added to `formatMonthYear`.
  - **Account-menu stuck highlight (text size + day/night).** The text-size save called `qc.invalidateQueries(['auth'])`, but the auth profile is plain React state — not a query by that key — so the invalidate was a no-op: the profile never updated, the highlight stuck on the old size, and you couldn't re-pick it until choosing another. Fix: new **`patchProfile(partial)`** on `AuthProvider` does an instant in-memory merge; `useSetTextScale` now patches + `refreshProfile()`s (dead invalidate removed). `useSetNightMode`/`useSetPalette`/`useSetLayoutPreference` (which already `refreshProfile`d, so were only briefly laggy) now also patch optimistically, so every appearance highlight flips immediately instead of after the round-trip.
  - **Bigger back arrow + brand → home.** `AppHeader`'s back control is now a 22px SVG chevron with a real tap target (was a 14px `←` glyph); the brand (mark + wordmark) is wrapped in a role-aware, locale-prefixed home `Link` (patient `/`, clinician `/clinician`, physio `/physio`). `AppHeader` now reads `useAuth()`/`useLocale()` — safe, as every usage is under `[locale]` (inside `AuthProvider`); `global-error` doesn't use it.
  - **Bigger card chevrons.** The "Your goals" and "Show visit code" rows (front page) and the missed-check-ins week rows (`CatchUpCard`) swapped small `→` text glyphs for properly sized chevron SVGs.
  - **Divider gap fixed.** `CareTeamNotes` drew its own `border-t` on top of the visit-code row's `border-b`, making two parallel rules with a gap whenever notes exist; it now drops its own top rule (same pattern `SafetyNotice` already uses), leaving a single clean hairline.
  - **Files (9, web repo — drop in, commit, push; no `npm install`, no SQL, no message changes; do NOT overwrite package.json/lock):** `lib/dates.ts`, `lib/supabase/auth.tsx`, `lib/supabase/textScale.ts`, `lib/supabase/colorScheme.ts`, `lib/supabase/layoutPreference.ts`, `components/layout/AppHeader.tsx`, `app/[locale]/page.tsx`, `components/patient/CareTeamNotes.tsx`, `components/cards/CatchUpCard.tsx`.

- **Zip:** `treatment-companion-simplify-cockpit-96.zip`  ·  **Tag:** `simplify-cockpit-96`  ·  **No migration — nothing to run in Supabase.** **Ops hardening (monitoring / alerting / backups / incident response).**
  - **NEW `OPS.md`** (repo root, cross-linked from `DEPLOY.md`): the operations runbook. Covers — Sentry: what's captured (errors only, PII-scrubbed) and the **alert rules to create in the dashboard** (new issue / spike >10 in 1h / high volume >50 in 1h / regression) plus triage; **Supabase backups & restore**: verify backups+retention, how to restore (destructive), and a **test-restore procedure** to run into a scratch project (the step everyone skips), plus the gaps a DB snapshot misses (Storage bucket, secrets); **secrets/env** inventory; **deploy rollback** (Vercel promote previous; migrations are forward-only → compensating migration or restore); **lightweight incident response** checklist; **routine** weekly/monthly/quarterly checks. Honest about deferred items (staging, E2E, Report-Only CSP).
  - **Code — Sentry env/release tagging** (`lib/sentry.shared.ts`): events are now tagged with `environment` and `release`, resolved from `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_RELEASE` (falling back to Vercel's `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA`). Unset → tag left empty (harmless). Makes production errors separable from preview-deploy noise and attributable to a deploy. **The privacy-first `beforeSend` PII scrubbing + `sendDefaultPii: false` were already in place and are unchanged.**
  - **User action (dashboards, can't be done in code):** set `NEXT_PUBLIC_SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` in Vercel; create the Sentry alert rules (see OPS.md §1); verify Supabase backups are on and do one test restore (OPS.md §2.3).
  - **Verified:** build 62/62; tsc clean; parity unchanged (1637). No schema/i18n change.
- **Mobile Milestone 2 — push, STEP 2: web app registers the device token** · **Tag:** `simplify-cockpit-98` — web-app code; **no new dependencies**; deploys to Vercel safely (inert in browsers).
  - **NEW `lib/nativePush.ts`**: `registerNativePushToken(locale)` — inside the native shell, requests push permission, registers for FCM, and on the `registration` event calls the `register_device_push_token` RPC (0102) with token + platform + locale. Reaches the Capacitor `PushNotifications` plugin via the injected `window.Capacitor` global instead of importing `@capacitor/push-notifications`, so the web app gains **no Capacitor build dependency** and the file is a complete no-op in a normal browser.
  - **NEW `components/feedback/NativePushRegistrar.tsx`**: render-null client component (same pattern as `ThemeApplier`) that calls `registerNativePushToken` once the user is signed in (`useAuth` + `useLocale`); mounted in `app/[locale]/layout.tsx` inside `AuthProvider`.
  - **Why no web deps:** with `server.url`, the native shell injects the Capacitor runtime + plugins into the webview; the web app just reads `window.Capacitor.Plugins.PushNotifications` at runtime. This sidesteps the "module not found" build risk entirely. Verified: build 62/62, tsc clean, **no package.json change**.
  - **Deploy:** drop the changed files to the web repo (no `npm install`); Vercel rebuilds green. Inert until the native shell has the plugin (step 3). Ensure migration `0102` is applied first (harmless if not — the RPC is only called inside the native app, which doesn't have the plugin yet).
  - **Remaining push steps:** (3) add `@capacitor/push-notifications` to `mobile/` + wire Firebase `google-services.json` (Android) so the plugin exists and tokens actually flow; (4) extend `send-checkin-notifications` to push to native tokens via the FCM HTTP v1 API. iOS push: Apple push key + Mac (deferred).

- **Mobile Milestone 2 — push, STEP 1: backend token store (migration `0102`)** — the foundation for native push reminders.
  - **`0102_device_push_token.sql`**: new `device_push_token` table (`profile_id`, unique `token`, `platform` android/ios, `locale`, timestamps) — the native-FCM counterpart to the Web-Push `push_subscription` table (0017), which is left untouched. RLS: users self-select / self-delete; writes go through the RPC; the reminder sender uses the service role (bypasses RLS). New RPC **`register_device_push_token(p_token, p_platform, p_locale)`** (SECURITY DEFINER) upserts on `token`, so a refreshed token or an account-switch on the same device updates in place rather than duplicating.
  - **Verified:** Method-D 5/5 (register, refresh-in-place, account-switch reassignment, invalid-platform rejected, bad-locale clamped to `en`); full from-scratch apply now **100 migrations** clean; schema-contract passing.
  - **No ordering constraint / no app change this step:** it's additive (new table + RPC, nothing calls it yet), so run `0102` in the Supabase SQL editor whenever.
  - **Architecture:** Firebase Cloud Messaging on BOTH Android and iOS → every device yields an FCM token → one delivery path to extend. **Remaining push steps:** (2) the web app registers its FCM token after login via this RPC — needs `npm install @capacitor/core @capacitor/push-notifications` in the web repo; (3) add `@capacitor/push-notifications` to `mobile/` + wire Firebase `google-services.json` (Android); (4) extend `send-checkin-notifications` to also push to native tokens via the FCM HTTP v1 API. iOS push additionally needs an Apple push key + a Mac (deferred).

- **Build fix — exclude `mobile/` from the web type-check (`tsconfig.json`)** — adding the `mobile/` Capacitor folder broke the Vercel build. `next build`'s type-check scans all `.ts` (root `include` is `['**/*.ts', ...]`), so it compiled `mobile/capacitor.config.ts`, which imports `@capacitor/cli` — only present in `mobile/node_modules`, which Vercel never installs at the repo root. **Fix:** add `"mobile"` to `exclude` → `["node_modules", "supabase/functions", "mobile"]` (mirrors the already-excluded `supabase/functions`, which has its own Deno toolchain). Reproduced by hiding `mobile/node_modules` (Vercel-identical) → the exact error; after the fix, 62/62. **Deploy `tsconfig.json` to main.** The Dependabot "group with 14 updates" PR is an OLDER branch that still has the pre-fix `lib/pwa.ts` (`urlBase64ToUint8Array`), so it fails on the original `Uint8Array` type error — it simply predates the fix. Once main has BOTH the pwa.ts fix and this tsconfig fix, `@dependabot recreate` rebuilds that PR off current main and it should pass (or just close it — production depends on main, not the PR).

- **Mobile app — Milestone 1 (new `mobile/` folder; not a web-app build; no migration)** — the App Store / Play Store track has started.
  - **Approach:** a **Capacitor** native shell (v8.4.0) whose webview loads the live site via `server.url` → `https://treatment-companion.vercel.app`. Everyday web deploys reach the app instantly; only native changes need a resubmission. Chosen because the app is SSR Next.js and can't be static-exported.
  - **Delivered (`mobile/`):** `capacitor.config.ts` (`appId: dk.mprc.treatmentcompanion` (MPRC research group; **permanent once published**)), `package.json` + lockfile (Capacitor core/cli/android/ios pinned `^8.4.0`), `www/index.html` (themed offline/connecting fallback), `.gitignore`, and `mobile/README.md` — the full build guide. **Verified:** `npx cap add android` scaffolds cleanly. The generated `android/` folder is NOT shipped (regenerate locally with `cap add`).
  - **Run it (Android, Windows):** `cd mobile && npm install && npx cap add android && npx cap sync && npx cap open android` (needs Android Studio + SDK). **iOS needs a Mac** or a cloud-Mac build service (Codemagic / Ionic Appflow / EAS).
  - **Hard constraints (in README):** no iOS build on Windows; Apple $99/yr + Google $25; Apple rule 4.2 can reject a pure wrapper → needs native push; health-app review (privacy labels, reviewer demo login).
  - **Camera** (goal-video recorder) needs `CAMERA`/`RECORD_AUDIO` in AndroidManifest and `NSCameraUsageDescription`/`NSMicrophoneUsageDescription` in iOS Info.plist — exact lines in the README; it's the one feature that won't work without them.
  - **Milestone 2 (next):** native push reminders (FCM + APNs via `@capacitor/push-notifications`; store each device token against the user in Supabase; change `send-checkin-notifications` to send native push) — the main native feature and the thing that satisfies Apple 4.2 — plus real icon/splash, store listings, and submission.

- **Ops runbook (changed-files only — no full zip; no migration; no dashboard action now)** · **Tag:** `simplify-cockpit-97`.
  - **NEW `OPS.md`** (repo root, linked from `DEPLOY.md`): the operations runbook. Sentry (what's captured + the alert rules to create + triage); Supabase backups & restore — now framed as **deferred until the real-patient milestone**, with a **§0 go-live checklist** capturing every switch-on (Pro/backups, test restore, Sentry DSN, CSP enforce, Next upgrade, compliance, Danish review); secrets/env; deploy rollback; incident response; routine checks.
  - **Code — Sentry environment/release tagging** (`lib/sentry.shared.ts`): events get `environment` + `release` tags (from `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_RELEASE`, falling back to Vercel's `VERCEL_ENV` / `VERCEL_GIT_COMMIT_SHA`). **Completely inert until a Sentry DSN is set** — `Sentry.init` no-ops without `NEXT_PUBLIC_SENTRY_DSN`, which stays unset until go-live. The privacy-first `beforeSend` PII scrubbing was already in place and is unchanged.
  - **Includes `lib/pwa.ts`** (the cockpit-96 build fix) so this is a self-sufficient deploy: green whether or not cockpit-96 was applied. Re-dropping the file is a harmless no-op if it was.
  - **Decision captured:** backups + Sentry + CSP-enforce are intentionally deferred to the first-real-patient milestone (dev/test data until then). The §0 checklist is the single place that tracks it.
  - **Why no full zip / no package.json:** this workdir's lockfile predates the repo's dependency bump (from the build fix). Deploy the changed files only; never overwrite `package.json` / `package-lock.json`.
  - **Verified:** build 62/62; tsc clean; no schema or i18n change.
- **Build fix (no zip — single changed file `lib/pwa.ts`)** · **Tag:** `simplify-cockpit-96` · deploy **only** `lib/pwa.ts` (drop it in via GitHub Desktop; do NOT overwrite `package.json`/`package-lock.json`).
  - **Symptom:** Vercel `npm run build` failed type-checking — `lib/pwa.ts:124 TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'string | BufferSource | null | undefined'` at `pushManager.subscribe({ applicationServerKey })`.
  - **Root cause:** a dependency bump in the last commit moved the toolchain (TypeScript and/or `@types/node`) past the pinned versions to where `new Uint8Array(n)` is typed `Uint8Array<ArrayBufferLike>`. Because `ArrayBufferLike` includes `SharedArrayBuffer` (which lacks the ES2024 resizable-ArrayBuffer methods), it no longer satisfies the Push API's `BufferSource`. The pinned 5.7.2 in the cockpit-95 base did not yet infer this, which is why earlier builds here passed.
  - **Fix:** `urlBase64ToUint8Array` → `urlBase64ToApplicationServerKey`, which allocates a concrete `new ArrayBuffer(len)`, fills it through a `Uint8Array` view, and **returns the `ArrayBuffer`**. An `ArrayBuffer` satisfies `applicationServerKey: BufferSource` on every TypeScript / `@types` version — no generics syntax, no casts. The single call site was updated.
  - **Verified:** reproduced the exact error on TS 5.9.3 / @types/node 22.19; the fix type-checks with **0 errors on both TS 5.9.3 and the locked 5.7.2**; full build 62/62; no other files touched.
  - **Why no full zip:** this workdir's `package.json`/lockfile predate your Dependabot bump, so a full zip would silently downgrade your toolchain. Deploy the one file only.
  - **Separately flagged:** `npm ci` warns `next@15.1.9` has a security advisory (Dec 2025). Recommend upgrading Next to the patched 15.x as its own change — not bundled here.
- **Zip:** `treatment-companion-simplify-cockpit-95.zip`  ·  **Tag:** `simplify-cockpit-95`  ·  **MIGRATION 0101 — must run (see order below).** **Security — visit-code unlock brute-force throttle.**
  - **`0101_visit_code_unlock_rate_limit.sql`**: new `visit_code_unlock_attempt` table (RLS: admin-read only; written solely by the RPC) + rewritten `unlock_with_visit_code`. It prunes the caller's stale attempts, counts FAILED attempts in the last 15 min, and raises `too many failed code attempts` at ≥10. Successful unlocks are recorded but never count, so opening several patients is never throttled.
  - **Contract change (important):** the RPC now **returns NULL** on an invalid/expired code instead of `raise`-ing. Reason: a RAISE rolls back the transaction, which would also roll back the failure record we need to persist for counting. The hook converts null → a thrown "invalid or expired code", so both unlock screens show the same invalid-code UX as before. The rate-limit case still raises (nothing to persist there) so a distinct "wait a few minutes" message can be shown.
  - **App changes:** `useUnlockWithCode` throws on a null result (the one mandatory change); `clinician/page.tsx` and `physio/page.tsx` gained a rate-limit branch (matched before the invalid-code branch, since the rate-limit message contains the word "code"). New i18n `clinician.unlock.errorRateLimited` + `physio.unlockErrorRateLimited` (en+da).
  - **⚠️ DEPLOY ORDER (reverse of usual): deploy the APP first, let Vercel finish, THEN run 0101.** If 0101 runs while the old app is still live, an invalid code would silently bounce the user back to the unlock screen instead of showing an error (transient, non-corrupting). Deploying the app first avoids it; the new app works against both the old and new RPC.
  - **Verified:** Method-D harness 6/6 (single-use, reusable, invalid→null, 10-failure block, window-expiry unblock, successes never throttled); full from-scratch apply now 99 migrations clean; schema-contract passing; build 62/62; tsc clean; parity 1637.
- **Zip:** `treatment-companion-simplify-cockpit-94.zip`  ·  **Tag:** `simplify-cockpit-94`  ·  **no migration.** **Security — response headers + dependency scanning.**
  - **`next.config.ts`** now sets, on every response: `Strict-Transport-Security` (1y, includeSubDomains), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(self), geolocation=(), browsing-topics=()` (camera/mic stay enabled for `GoalVideoRecorder`), `X-DNS-Prefetch-Control: on`, and `poweredByHeader: false`. All enforced and low-risk.
  - **CSP** is included as `Content-Security-Policy-Report-Only` (a single policy string in `next.config.ts`). Report-Only means it reports violations to the devtools console but blocks nothing, so it can't break the app. **To enforce:** validate in a browser (click through all roles, record a video, watch the console for violations, widen any wrongly-blocked origin), then rename the header to `Content-Security-Policy`. connect-src already allows Supabase REST + realtime (wss) and Sentry ingest; media/img allow Supabase Storage + blobs.
  - **`.github/dependabot.yml`** — monthly, grouped npm + github-actions update PRs (limit 5), low-noise. One-time: also enable **Dependabot alerts + security updates** in repo Settings → Advanced Security for urgent fixes outside the schedule.
  - Verify headers after deploy: browser devtools → Network → click the document request → Response Headers, or run the URL through securityheaders.com.
  - Build 62/62; tsc clean. (Pre-existing benign `@opentelemetry`/Sentry "Critical dependency" warning is unrelated.)
- **Zip:** `treatment-companion-simplify-cockpit-93.zip`  ·  **Tag:** `simplify-cockpit-93`  ·  **no migration.** **Stability — global query-error handling (no more infinite skeletons).**
  - Problem: data pages gated on `query.isLoading || !query.data`. When a query *errors*, `isLoading` is false and `data` is undefined → the page rendered the loading **skeleton forever** with no error and no retry. This was the real mechanism behind the "stuck on loading" reports during the consent-column / `length_weeks` 400s.
  - **`components/feedback/ErrorState.tsx`** (new): calm, on-brand, accessible (`role="alert"`) error panel with a "Try again" button; copy matches the app's error voice. New `errorState` i18n namespace (en + da).
  - **`app/[locale]/error.tsx`** (new): route-level error boundary that catches *render-time* crashes within locale routes in place (keeping layout/theme/fonts), reports to Sentry, and shows `ErrorState` with retry via `reset()`. The whole-document `app/global-error.tsx` stays as the last-resort fallback.
  - **7 data pages** got an additive `if (query.isError) return <ErrorState onRetry={refetch} />` placed before their existing loading/redirect gate: `clinician/patient`, `clinician/history`, `clinician/treatment`, `clinician/suggestion`, `patient-info`, `checkin`, `physio/progress`. The branch only fires on an error state that was previously mishandled, so the happy/loading paths are unchanged. `suggest-goal` needs none (its skeleton gates on local draft hydration, not a server query). The 8 files that already handled `isError` inline were left as-is.
  - **Verified:** tsc clean (confirms every referenced query exposes `isError`/`refetch`), build 62/62, i18n parity 1635, schema-contract still passing.
- **Zip:** `treatment-companion-simplify-cockpit-92.zip`  ·  **Tag:** `simplify-cockpit-92`  ·  **no migration.** **Schema-contract check (production-readiness item #2, smoke-test layer).**
  - **`scripts/check-schema-contract.mjs`** — scans the data layer (`lib/`, `app/`, `components/`) for `.from('table')` + the paired `.select('…')` and for `.rpc('fn')`, and verifies against a schema snapshot that (a) the table exists, (b) each selected bare column exists on it, (c) the function exists. Embedded PostgREST resources (`alias:fk (cols)`) are skipped to keep it false-positive-free.
  - **`supabase/ci/dump-schema.sql`** — emits the public schema as JSON (`{tables:{name:[cols]}, functions:[…]}`); invoke `psql -tA -f … > schema.json`.
  - **CI wiring:** the `migrations` job now gains a Node step; after applying migrations it snapshots the schema and runs the contract check. Pure-Node script (no deps, no npm install, no backend).
  - **Why this is the right smoke test for our bug class:** the page breakages this session were app↔DB contract mismatches — `treatment_cycle.length_weeks` (dropped in 0010, still selected) and the consent columns (selected before 0098 was applied). This check catches both *before* deploy, deterministically, with no running backend or test accounts. It complements (doesn't replace) browser E2E.
  - **Browser-level E2E (Playwright) deferred — on purpose.** Login is email+password (`signInWithPassword`), so the three role journeys (patient check-in; clinician unlock-via-visit-code → patient + history; physiotherapist note) are scriptable — but they need a running app + a seeded backend with real accounts. The clean place to run that without risking prod is the **staging environment** (next item). Building E2E together with staging means it can actually be executed and verified, rather than shipped blind.
  - **Verified locally:** migrations apply → schema snapshot (26 tables, 139 functions) → contract check passes with **0 mismatches** (confirming no other dropped/missing-column references remain). Build 62/62; tsc clean; parity 1632.
- **Zip:** `treatment-companion-simplify-cockpit-91.zip`  ·  **Tag:** `simplify-cockpit-91`  ·  **no migration to run.** **CI + migration validation (critical-path item #1).**
  - **`.github/workflows/ci.yml`** — runs on every push to `main` and every PR, no secrets:
    - **verify** job: `npm ci` → `npm run typecheck` → `node scripts/check-i18n-parity.mjs` → `npm run build` (placeholder public Supabase env). Catches type errors, i18n drift, and build breaks before Vercel.
    - **migrations** job: `postgres:16` service → apply `supabase/ci/bootstrap.sql` → apply every `supabase/migrations/[0-9]*.sql` in order with `ON_ERROR_STOP`, skipping any file containing `ci:skip`. Validates the schema migration set applies cleanly from scratch. Never touches the production DB.
  - **`supabase/ci/bootstrap.sql`** — recreates the Supabase primitives the migrations assume: `anon`/`authenticated`/`service_role` roles; a minimal `auth` schema (`auth.users` + `auth.uid/jwt/role` stubs); a minimal `storage` schema (`storage.buckets`, `storage.objects`, `storage.foldername()`). CI-only; never run against Supabase.
  - **`scripts/check-i18n-parity.mjs`** — flattens `messages/{en,da}.json`, fails on any key mismatch (ignores `_meta`). New npm scripts: `check:i18n` and `verify` (typecheck + i18n + build).
  - **Pre-existing migration bugs the CI surfaced and we fixed** (these never applied cleanly from scratch — they'd been hand-patched in the Supabase editor, so the committed files had drifted):
    - `0004_fix_current_role.sql`: `drop function if exists current_role()` → `"current_role"()` (the word is a reserved keyword; unquoted it's a *syntax error*, not a no-op).
    - `0006_submit_checkin_rpc.sql`: a `COMMENT ON … IS '…' || '…'` used the `||` operator, which COMMENT doesn't accept; switched to implicit adjacent-string concatenation.
    - `0011_reseed_test_patient.sql`, `0015_reseed_nrs.sql`: marked `-- ci:skip` — they execute reseed logic that requires test accounts and can't run in a from-scratch apply (they are dev data, not schema).
  - **Verified locally:** all 98 schema migrations apply cleanly from scratch (2 dev-seed skipped); build 62/62; tsc clean; parity 1632.
  - **`DEPLOY.md`** gained three sections: the migration-before-app release rule (+ schema_audit.sql), how to read the CI checks, and an optional future path to auto-applying migrations via the Supabase CLI (with the baseline-reconciliation caveat, since migrations have been hand-run).
  - ⚠️ **When uploading this build, include the `.github` folder** so CI activates. No SQL to run on the live DB — the 0004/0006 fixes only affect future from-scratch applies; your live DB is already past them.
- **Zip:** `treatment-companion-simplify-cockpit-90.zip`  ·  **Tag:** `simplify-cockpit-90`  ·  **no migration.** **Consent-button labels + dictionary v3.**
  - Background card: `researchConsent.withdraw` "Withdraw research consent" → **"Withdraw"** (matches the educational row's button); `educationalConsent.grant` "Allow educational use" → **"Record consent for educational use"** (matches "Record research consent"). en + da. `tRC('withdraw')` is only used on this card, so nothing else is affected.
  - **REDCap dictionary v3** (`treatment_companion_datadictionary_v3.csv`, 84 fields): removed `cycle_length_weeks` and `cycle_review_date` — both mapped to `treatment_cycle` columns that were dropped in migration 0010, so the export could never have populated them. treatment_cycle form is now cycle_index / cycle_start_date / cycle_status / cycle_modality. Repo `redcap/` copy refreshed to v3.
  - Build 62/62, tsc clean, parity 1632/1634.
- **Zip:** `treatment-companion-simplify-cockpit-89.zip`  ·  **Tag:** `simplify-cockpit-89`  ·  **no migration.** **History page 400 fix — stale `length_weeks` column.**
  - Symptom: `GET /treatment_cycle?select=...,length_weeks,...` → 400, history page blank. Cause: `treatment_cycle.length_weeks` (and `review_date`) were **dropped in migration 0010** and never re-added, but the cockpit-81 history hook (`patientHistory.ts`) still selected `length_weeks`. PostgREST rejects the whole request, so history never loaded — on **any** current DB, not a missing-migration issue.
  - `lengthWeeks` was only selected and stored on the cycle object; nothing rendered it (`weeksToNext`, which *is* shown, is computed from session dates, not from `length_weeks`). Removed it from the select string, the row mapping, and the `HistoryCycle` type. No behaviour lost.
  - **Known related issue (not yet fixed):** the REDCap dictionary v2 still has `cycle_length_weeks` and `cycle_review_date` sourced from these dropped columns — they can't be populated by the app. They should be removed or remapped before the export is wired. Flagged for a dictionary v3.
  - If history still 400s after this, the remaining candidate in that select is `clinician_note` (migration 0065) — run 0065 if outstanding.
- **Zip:** `treatment-companion-simplify-cockpit-88.zip`  ·  **Tag:** `simplify-cockpit-88`  ·  **no migration.** **Background card: both consents + layout fix.**
  - The Background card showed only research consent. Added a second consent row — **educational use of video** (`patient.video_consent_educational`) — with its own status pill + grant/withdraw button. The toggle calls `set_patient_video_consent` preserving the existing `clinical` (recording) value, so it only flips the educational flag.
  - **Layout fix:** the old consent row used `items-start justify-between`, so when the label + pill wrapped to two lines the action button floated up beside the label (the misalignment in the screenshot). Replaced with a small `ConsentRow` component: label on its own line, then status pill + button on one line aligned together (`items-center`). Both consents use it, so the block is consistent. New `educationalConsent` i18n namespace (en + da, first-pass Danish).
  - No schema change. Build 62/62, tsc clean, parity 1632/1634.
- **Zip:** `treatment-companion-simplify-cockpit-87.zip`  ·  **Tag:** `simplify-cockpit-87`  ·  **migration `0100_fix_goal_lineage_trigger.sql` (HOTFIX).** **Repairs the goal-lineage trigger.**
  - Symptom: dev reseed (and any goal creation) failed with `null value in column "lineage_id" of relation "approved_goal" violates not-null constraint`. Root cause: 0086 made `approved_goal.lineage_id` NOT NULL and added a BEFORE INSERT trigger (`approved_goal_lineage_default` → `approved_goal_set_lineage()`) that defaults `lineage_id := new.id` when omitted — but on this DB the constraint applied while the trigger did not (a partial/older 0086 run). Every insert that doesn't name lineage_id (approve_suggestion, create_goal_for_patient, the GAS RPC, the dev seed) then violates the constraint.
  - 0100 re-creates the function + trigger verbatim (idempotent: `create or replace` + `drop trigger if exists` + create) and backfills `lineage_id = id` for any stray nulls. Method-D verified: reproduced the exact error with the trigger absent, then the same insert succeeded (`lineage_id = id`) after applying 0100. **Run 0100, then reseed.** Not app-specific — this also unblocks normal goal creation on an affected DB.
  - Context: surfaced while bringing this DB current — 0098 (consent model) was the missing piece that had the clinician patient page stuck on its skeleton (the query selected the renamed/new consent columns that didn't exist yet); running 0098 fixed that, then the reseed exposed the lineage-trigger gap.
- **Zip:** `treatment-companion-simplify-cockpit-86.zip`  ·  **Tag:** `simplify-cockpit-86`  ·  **migration `0099_dev_seed_history_extras.sql` (DEV SEED ONLY).** **Demo patients now populate the history page.**
  - The base dev seed (`dev_seed_b1..b8`) created cycles/goals/check-ins + the patient's own goal ratings, but **none** of the history-specific fields. New `dev_seed_history_extras()` fills them for test1–test6: `patient.etiology` + `etiology_detail` (diagnosis pill) and `current_medication`/`previous_medication`; per-goal **clinician video ratings** (`weekly_goal_rating.clinic_video_rating/_nrs`); a **physio_assessment** per cycle + **physio_goal_rating** per goal (the therapist column on the trend); a **side effect** on one mid-cycle check-in (amber flag); and a per-cycle **treatment_handoff** note. Diagnosis varies per patient (test6 = anoxic).
  - Wired into `dev_reseed_all()` (now runs b1–b8 then the extras). **Run 0099 in Supabase, then trigger a reseed** (dev Scenarios page, or `dev_reseed_all()`); the `test6` "longitudinal" scenario is the richest for history. Method-D verified (all fields populate; re-running doesn't duplicate — the base seed cascades cycle deletes, and the function clears its own rows defensively). **Depends on 0097** (the `anoxic` etiology value) — run 0097 first.
  - No app/build change — SQL only. Separately: a **REDCap data-dictionary completeness review** was done (see chat) — two accuracy bugs flagged (`sex` is app-stored but marked study-team-entered; `diagnosis` field-note contradicts its annotation) plus several optional gaps (goal baseline NRS, clinician video ratings, "other" side-effect text, face-module fields). Not yet applied to the dictionary — awaiting scope decision.
- **Zip:** `treatment-companion-simplify-cockpit-85.zip`  ·  **Tag:** `simplify-cockpit-85`  ·  **no migration.** **Clinician-page consistency fixes (suggestion response + handoff note).**
  - **Suggestion response collapsed to one action.** The therapist-suggestion review had two buttons — *Mark considered* and *Dismiss* — that set different statuses but had no functional difference downstream. Now a single **Mark considered** action (sets `accepted`/`reviewed`); the `needsReview` item leaves the queue and shows *Considered*. Applied in all four places: both `TherapistInputPanel` widgets (goal + muscle) and both inline cockpit lists on the patient page (the goal one's *Accept* label is now *Mark considered* for consistency). The status-display branch still renders *Dismissed* for any pre-existing dismissed records; the dismiss i18n keys are left in place (harmless).
  - **Handoff note simplified.** The physician→therapist note on the treatment page drops the *"Did you change the treatment this visit?"* (Adjusted / No change / Not specified) toggle — just the free-text focus note remains. The save now always sends `treatment_changed = null`; the RPC/column are untouched (no migration), so old values are preserved and any patient-facing "Treatment adjusted" chip simply won't appear for new notes.
  - **Audience label fixed.** Removed the **"Therapist only"** badge on that note — it contradicted the hint right below it, and it was factually wrong: migration 0096 gives the patient read access to `treatment_handoff` / `goal_handoff_note` / `therapist_note` (a patient's right to their own care record). The hint ("Shared with the therapist… the patient can read it too") is accurate and stays. Also corrected the now-stale "never patient-visible" comment in `GoalHandoffNotes.tsx`. Removed the dead `handoffChanged*` / `handoffAudienceBadge` i18n keys (en + da).
  - **Note on direction:** I resolved the badge/hint contradiction toward *patient-can-read* because that's the deliberate 0096 design. If you actually intended these notes to be therapist-only, that's the opposite change (remove the 0096 patient-read policies) — say so and I'll flip it.
- **Zip:** `treatment-companion-simplify-cockpit-84.zip`  ·  **Tag:** `simplify-cockpit-84`  ·  **no migration.** **Admin research-consent purge queue — closes the cockpit-83 lifecycle.**
  - cockpit-83 shipped the withdraw → admin-confirmed-purge lifecycle and the `confirm_research_purge` RPC, but nothing **called** it. This adds the caller: a **purge queue** section on the existing `/clinician/admin` page listing patients with `research_consent_withdrawn_at` set and `research_consent_purged_at` null, each with a guarded **Confirm deletion** button.
  - **No schema change.** The queue reads the `patient` table directly through the admin's existing `patient_admin_all` RLS (0037); confirmation goes through the existing `confirm_research_purge` RPC (0098). New hooks `useResearchPurgeQueue` / `useConfirmResearchPurge` in `lib/supabase/admin.ts` (first browser-client reads in that file, which is otherwise API-route based — fine, since this is RLS-readable patient data). New `admin.purge*` i18n (en + da, first-pass Danish).
  - **Semantics:** confirming stamps `research_consent_purged_at` and clears the row from the queue. It records the admin's **authorisation** to delete; the actual REDCap delete is carried out by the (not-yet-built) export job. The queue is forward-looking — it stays empty until the export exists and a consented patient withdraws.
  - **QA:** dark-mode contrast of the amber queue card; native-DA review of the new strings; confirm uses native `window.confirm`.
- **Zip:** `treatment-companion-simplify-cockpit-83.zip`  ·  **Tag:** `simplify-cockpit-83`  ·  **migration `0098_consent_model.sql`.** **Consent model: general research consent + video-consent rename.**
  - **Three consents, three meanings.** (1) `research_consent` — NEW general consent, the gate for the REDCap export. (2) `video_consent_clinical` — record & store videos (unchanged). (3) `video_consent_educational` — use videos for educational purposes; this is the **rename** of the old `video_consent_research` (and `archived_goal_video.consent_research` → `consent_educational`), so a future export can never gate on a video column by mistake.
  - **Lifecycle.** consented (`research_consent=true`) → withdrawn (`research_consent=false`, `research_consent_withdrawn_at` set — export stops immediately) → purged (`research_consent_purged_at`, stamped by an **admin** via `confirm_research_purge`). Export filter = `research_consent=true`; admin purge queue = `withdrawn_at not null and purged_at is null`.
  - **DB (0098):** rename the two video columns; add `research_consent` + `research_consent_recorded_at/_by/_source/_withdrawn_at/_purged_at`; recreate `set_patient_video_consent` / `set_own_video_consent` (param `p_research`→`p_educational`) and `archive_goal_video` (reads/writes the renamed cols) against the new names; new RPCs `set_patient_research_consent` (clinician), `set_own_research_consent` (patient), `confirm_research_purge` (admin). **Method-D ALL PASS** (rename took effect, grant→withdraw→purge, non-admin/non-clinician guards raise, patient self-consent, video RPC writes educational col, archive RPC still works).
  - **App:** renamed `videoConsentResearch`→`videoConsentEducational` / `consentResearch`→`consentEducational` across `clinicianPatient.ts`, `patientInfo.ts`, `goalVideo.ts`, `ClinicianVideoModal`, `VideoEnableGuide`, `ArchivedVideosModal`, `VideoConsentSettings`, `PatientVideoConsentGate`, and the clinician page; new hooks `useSetPatientResearchConsent`, `useOwnResearchConsent`, `useSetOwnResearchConsent`. Clinician control = a research-consent row on **BackgroundCard** (sage/amber/stone status pill + grant/withdraw, withdraw guarded by `window.confirm`); patient control = a staged checkbox in **profile**, saved by the page's Save button. New `researchConsent` i18n namespace (en + da, first-pass Danish).
  - **Deploy note:** old app + new DB (or vice-versa) mismatch on the renamed column until both are live — run 0098 together with this build. **QA:** dark-mode contrast of the BackgroundCard status pill; native-DA review of the new strings; the withdraw uses native `window.confirm` (styled-confirm is a polish follow-up).
- **Zip:** `treatment-companion-simplify-cockpit-82.zip`  ·  **Tag:** `simplify-cockpit-82`  ·  **migration `0097_etiology_anoxic.sql`.** **Diagnosis capture completed + surfaced in history.**
- **Context / correction:** the plan was to "add a diagnosis field." On inspection the field **already exists** — `etiology` (enum, from 0047) + `etiology_detail` (free text) on `patient`, written by `set_patient_info`, edited in the patient-info form. So this build did **not** add new columns. It (a) added the one **missing enum value** the clinician picklist lacked — `anoxic` (anoxic / hypoxic brain injury) — and (b) surfaced the diagnosis in the clinician **history** header, which cockpit-81 had left as a placeholder.
- **Migration 0097:** `alter type etiology add value if not exists 'anoxic';` — run on its own in the Supabase SQL editor (an enum `add value` shouldn't share a transaction). Idempotent. No data change.
- **App changes:** `Etiology` type + `ETIOLOGY_VALUES` picklist gain `anoxic` (placed just before "Other"); `etiology` i18n namespace gains the label (en + da). The history header now shows a **diagnosis pill** (etiology label + optional detail) when present, alongside the medication pill.
- **Bug fixed (introduced in cockpit-81):** `usePatientHistory` read `patient.current_antispastic_medication`, but migration **0061** renamed that column to `current_medication`. The medication pill would have been blank/erroring. Corrected to `current_medication`; `usePatientHistory` now also returns `etiology` + `etiologyDetail`.
- **REDCap:** the dictionary's "diagnosis" maps to the app's `etiology` (coded) + `etiology_detail` (free text, de-ID on export). This is recorded for the deferred dictionary revision — the live export is still not built.
- **QA for you:** pick `anoxic` in the patient-info form and confirm it saves and shows; confirm the diagnosis pill renders in history; dark-mode contrast of the sage diagnosis pill.

- **Zip:** `treatment-companion-simplify-cockpit-81.zip`  ·  **Tag:** `simplify-cockpit-81`  ·  no new migration. **Clinician history redesigned into a per-cycle clinical record.**
- **Why:** the old history page was five abstract cross-cycle views (dose-per-cycle chart, goals breakdown, benefit-duration table, muscle-dose chart, retreatment-timing table). It answered aggregate questions but buried the one thing a reviewing clinician actually reads a history for — *the shape of each cycle's response*: onset, peak, and especially when benefit faded.
- **New shape:** newest-first **cycle cards**. The current cycle is expanded by default; older cycles collapse to a row and open on click. A **summary strip** on top still carries the cross-cycle numbers (start date, units, goal count, benefit, interval, outcome chips).
- **Per cycle:** the injection (side · muscle · dose); for each goal a **GAS sparkline** of the weekly self-reports with the **peak** point (sage-deep) and **fade** point (amber-deep) annotated, a peak/fade/outcome line, and the **latest patient / clinician / physio** rating side by side; a one-line symptom course (pain, stiffness) with **side effects always surfaced** as an amber flag; notes; weeks-to-next-cycle.
- **New files:** `lib/supabase/patientHistory.ts` (`usePatientHistory(patientId)` — one comprehensive read assembling cycles, injections, per-goal trajectories with peak/fade, the three latest raters, symptoms, intervals) and `components/clinician/GoalSparkline.tsx` (compact themeable SVG line). `app/[locale]/clinician/history/page.tsx` rewritten to consume only `usePatientHistory`; scaffolding (auth/role gate, session guard, AppHeader, wide layout, skeleton) preserved.
- **Physio ratings** now appear on the history page (third rater) once physio data exists for a goal.
- **Deliberately deferred (v1):** enum-label rendering for guidance / modality / spasm-frequency / daily-care (kept off to avoid raw enum codes — easy follow-up once a label map exists); the **diagnosis** header (the column doesn't exist yet — pending the diagnosis-capture field, decided but not built). The old history hooks/components (`usePatientTrend`, `usePatientCycleAnalysis`, the five chart/table components) are now unused but left in the repo.
- **QA for you:** dark-mode contrast of the sparkline points + summary chips; confirm the per-cycle record reads correctly against real multi-cycle data; the physio rater column stays blank until physio ratings exist.

- **Zip:** `treatment-companion-simplify-cockpit-80.zip`  ·  **Tag:** `simplify-cockpit-80`  ·  no new migration. **Bugfix — therapist ratings now persist visibly.**
- **Symptom:** on the physio cockpit, rating a goal showed the value before “Save visit”, but after saving the badge disappeared and reopening the goal/chart showed nothing — as if it never saved.
- **Root cause (two faults, both real):**
  1. **Stale read.** The save mutation (`useSubmitPhysioAssessment`) invalidates `['physioAssessments']`, but the cockpit reads everything (goals, charts, the therapist points in `physioRatingsByGoal`) from `usePhysioPatientData` (key `['physioPatient', profileId]`). `<PhysioProgressForm>` was rendered with **no `onSaved`**, so nothing refetched that query — the RPC *did* insert the row, but the screen kept showing pre-save data until a full reload.
  2. **Local-only badge.** The row's “✓ value” badge and sage left-edge derived purely from local `ratings`/`gasRatings` state, which `doSubmit` clears (`setRatings({})` … `setOpenGoals({})`). So even with a refetch, the just-saved goal would collapse back to “Rate”.
- **Fix:**
  1. `app/[locale]/physio/patient/page.tsx` — pass `onSaved={() => void patientData.refetch()}` to `PhysioProgressForm`. After a save the cockpit re-reads `physio_assessment`, rebuilds `physioRatingsByGoal`, and the chart shows the new therapist point.
  2. `components/physio/PhysioProgressForm.tsx` — the row's display `rated`/`ratedLabel` now fall back to the **latest persisted** physio rating (`physioRatingsByGoal.get(id)` last point: `nrs` for NRS goals, signed `value` for GAS) when there's no pending local pick. So a saved goal keeps its “✓ value” badge and sage edge after the form collapses. **Submit inclusion is unchanged** — it still uses the local-only `isRated`/`isIncluded`, so a previously-saved goal is never silently re-submitted on the next save.
- **Verified:** tsc clean; `next build` 62/62. NOT verifiable here: the live save→refetch round-trip (needs an unlocked patient + a real therapist rating) — QA item.

- **Zip:** `treatment-companion-simplify-cockpit-79.zip`  ·  **Tag:** `simplify-cockpit-79`  ·  no new migration (needs **0096** run from cockpit-78). Slice 2 — the patient-facing read of the care-team notes.
- **Patient read** `lib/supabase/careTeamNotes.ts` — `usePatientCareTeamNotes()` reads all three channels for the signed-in patient (`treatment_handoff`, `goal_handoff_note` joined to `approved_goal.patient_facing_text`, `therapist_note`) and merges them newest-first into `CareTeamNote { id, kind: 'physicianCycle'|'physicianGoal'|'therapist', date, text, treatmentChanged?, goalText? }`. No `patient_id` filter — RLS (0096) already limits each table to the patient's own rows. Read-only; the patient cannot write to any of these tables.
- **Patient section** `components/patient/CareTeamNotes.tsx` — a quiet, collapsed **“Notes from your care team”** disclosure (with a count), hidden entirely when there are no notes. Expanded: a short plain-language intro, then each note verbatim with author (Your physician / Your physiotherapist), date, a sage left-edge for physician notes / amber for the therapist, a “Treatment adjusted” chip on a flagged cycle handoff, and a “Goal · …” chip on a per-goal note. Mounted low on the patient home (`app/[locale]/page.tsx`) just above the safety/privacy footer.
- **Clinician copy flipped** (en + da) — the three places that promised the note was patient-hidden now say the patient can read it too: `therapistNote.helper`, the per-goal `goalHandoff.hint`, and the per-cycle `handoffHint`. (`smartHelper` for goal smart-text is unchanged — smart-text is not a note channel and is still not patient-visible.)
- **i18n** — new `careTeamNotes` namespace (heading/intro/authorPhysician/authorTherapist/treatmentChanged/goalContext) en + da; parity 1576. Danish first-pass, pending native review.
- **Verified:** tsc clean; `next build` 62/62. NOT verifiable here: the live read (needs 0096 run + real rows) and dark-mode contrast of the section — both QA items.

- **Zip:** `treatment-companion-simplify-cockpit-78.zip`  ·  **Tag:** `simplify-cockpit-78`  ·  **Migration: 0096 — must run in Supabase.** Slice 1 of patient access to care-team notes.
- **Migration `0096_patient_care_team_notes.sql`** (standalone also at `/mnt/user-data/outputs/0096_patient_care_team_notes.sql`): adds a patient self-read RLS policy to **treatment_handoff**, **goal_handoff_note**, and **therapist_note** — `for select to authenticated using (patient_id = current_patient_id())`. Additive: each table keeps its `clinician_can_access_patient(patient_id)` policy, and permissive SELECT policies OR together, so clinician/therapist reads are unchanged. `current_patient_id()` is NULL for clinician callers, so the new policy grants them nothing. No data is modified — read access only.
- **Verified locally (Method D, real Postgres):** built the three tables with their clinician policies + stubbed `current_patient_id` / `clinician_can_access_patient` / `current_app_role`, applied 0096 verbatim, seeded two patients. Results: patient A → own rows only (1,1,1); clinician → all (2,2,2); unknown patient → none (0,0,0); patient A reading B's rows → 0. No cross-patient leak.
- **Next slice (the app):** a patient-side read of the three channels merged chronologically; the quiet, collapsed **“Notes from your care team”** section on the patient home (per `patient-care-team-notes.html`, verbatim notes, read-only, labelled by author + date + context); and the **clinician copy flip** — the therapist note box currently says “the patient never sees this” and the physician notes are presented as patient-hidden; both must change to say the patient can read them.
- **⚠ ACTION:** run `0096_patient_care_team_notes.sql` in the Supabase SQL editor. (Until then nothing changes; the policy only takes effect when the next slice's patient read ships.)

- **Zip:** `treatment-companion-simplify-cockpit-77.zip`  ·  **Tag:** `simplify-cockpit-77`  ·  **Migration: none (needs 0095 if not yet run).** Clearer "rated this session" indicator.
- **Problem:** the rated-state chip added in cockpit-76 was a soft pill (`bg-sage-soft`/`text-sage-deep`) — too low-contrast to notice, and worse in dark mode, so the therapist couldn't tell which goals they'd already rated.
- **Fix** (`components/physio/PhysioProgressForm.tsx`): the status badge is now **solid** — `bg-sage-deep` + `text-on-accent` for `✓ <value>` when rated, `bg-amber-deep` + `text-on-accent` for `Flagged` when only a change was suggested (cream text reads in both themes). The goal **row now also carries a 3px colored left edge** — sage when rated, amber when flagged — running the row's full height, so the state is obvious whether the goal is expanded or collapsed and is scannable down the list. Unrated rows are unchanged (stone border, quiet "Rate" hint).
- No schema, no new i18n.
- **⚠ QA (cannot verify here):** rating a goal puts a solid sage `✓ value` badge on its row and a sage left edge; goals you haven't rated look plainly different; a flagged-only goal shows amber. Check contrast in dark mode specifically.

- **Zip:** `treatment-companion-simplify-cockpit-76.zip`  ·  **Tag:** `simplify-cockpit-76`  ·  **Migration: none (needs 0095 if not yet run).** Therapist goals → collapsed, click-to-rate list (Variant A from `therapist-goal-list-options.html`).
- **Collapsible goal rows** (`components/physio/PhysioProgressForm.tsx`, rewritten): each goal is a closed row — goal name + a status chip + chevron. Tapping it expands to the trend chart (`GoalProgressView bare hideTitle`), the physician's per-goal note, and the compact rating + treatment-change flag. New state `openGoals` (all closed by default; cleared on submit). Rationale (per Nikolaj): a therapist usually assesses only some goals, so opening one is a deliberate "I worked on this" act; un-opened/un-rated goals are simply not reported, and the list stays short as goal counts grow.
- **Status chip on the row:** once rated, the row shows `✓ <value>` (e.g. `✓ 7`, `✓ +1`) in sage; if only a treatment change was suggested (not rated), it shows `Flagged` in amber; otherwise a quiet `Rate` hint. So progress is visible without expanding.
- **`GoalProgressView` `hideTitle` prop** (`components/clinician/GoalProgressView.tsx`): optional, default false. Suppresses the goal-title line (the row already names the goal); `weeksReported` and the chart still render. Clinician-page uses unaffected.
- i18n: added `physioForms.rateShort` ("Rate") and `physioForms.flaggedShort` ("Flagged"), en/da (parity 1570). No schema.
- **⚠ QA (cannot verify here):** goals show as a list of closed rows; tapping one opens its chart + rating; rating a goal shows a `✓ value` chip on the collapsed row; the chart no longer repeats the goal name; Save still counts rated/flagged goals; on submit everything (incl. open state) resets. Works for NRS and GAS; the standalone `/physio/progress` (no trend) opens straight to the rating.

- **Zip:** `treatment-companion-simplify-cockpit-75.zip`  ·  **Tag:** `simplify-cockpit-75`  ·  **Migration: none (needs 0095 if not yet run).** Therapist-cockpit refinements.
- **Suggest a goal moved up** (`PhysioProgressForm.tsx` + `app/[locale]/physio/patient/page.tsx`): the form gained two optional slots — `dateAside` (rendered beside the visit-date field) and `afterDate` (a panel beneath the date row). The page now passes the quiet "Suggest a goal" button as `dateAside` and the suggestion form + sent-list as `afterDate`, and the old bottom block is gone — so **the page ends on the note-to-clinic Send**, and the suggest action is visible up top rather than buried.
- **Chart legend always identifies the patient series** (`GoalProgressView.tsx`): the legend was gated on `physioWeeks.length > 0 || clinicWeeks.length > 0`, so a goal with only patient self-reports rendered dots with no "Patient self-report" label. Gate is now `reportedCount > 0 || physioWeeks… || clinicWeeks…`, so the patient swatch shows whenever there's patient data; therapist (amber diamond) and clinic (ink square) entries still appear only when present.
- **Treated muscles collapsed by default** (`TreatedMusclesSection` in the page): when it lived behind the old Muscles chip it rendered open (the chip controlled visibility). Now that it sits always-present in the left context column, it has its own foldout — header button (title + count + date + chevron) collapsed by default, list revealed on tap. New local state `musclesOpen`.
- No schema, no new i18n keys (parity 1568).
- **⚠ QA (cannot verify here):** "Suggest a goal" sits beside the Date of visit and opens the form there; the last thing on the page is the note-to-clinic Send; a goal with only patient data now shows a "Patient self-report" legend; the treated-muscle list starts collapsed and expands on click.
- **Open design question (not built):** when a patient has many goals, a full trend chart per goal makes the right column very long. Candidate directions logged for discussion — compact summary rows that expand to rate, a show-graph toggle, or a patient-page-style list. No decision yet.

- **Zip:** `treatment-companion-simplify-cockpit-74.zip`  ·  **Tag:** `simplify-cockpit-74`  ·  **Migration: none (needs 0095 if not yet run).** Compact, clinician-oriented rating control on the therapist form.
- **Problem:** the therapist visit form was reusing the *patient's* check-in pickers (`wizard/GoalRatingPicker`, `wizard/GasGoalRatingPicker`) — so a clinician doing quick entry got the patient's second-person question as a heading, big two-row pills, "0 · WORST / 10 · BEST", and "Tap a number to choose your rating".
- **New `components/physio/CompactGoalRating.tsx`:** a dense therapist control. **NRS** = one wrapping row of small 0-10 buttons with a quiet "Higher is better / Lower is better" line above (reuses `clinician.approve.higherIsBetter|lowerIsBetter`). **GAS** = one row of small −2…+2 buttons (sage for better, amber for below, neutral for expected); the picked level's meaning (`patient.checkin.gasMeaning*`) and the goal's own anchor sentence appear in a small line on selection, with a faint "much less … much better than expected" hint before. Stored values are unchanged (0-10 / −2..2). No patient-facing question, reassurance labels, or helper text.
- **`PhysioProgressForm.tsx`:** swapped the two wizard pickers for `CompactGoalRating` (both NRS and GAS branches); the patient wizard pickers are untouched and still used on the patient check-in.
- **No schema, no new i18n keys** (reuses existing `clinician.approve.*` and `patient.checkin.gasMeaning*`; parity 1568). The clinician-label-per-goal idea was considered and dropped — would have needed a column + RPCs + a clinician edit surface.
- **⚠ QA (cannot verify here):** the therapist's per-goal rating is now a single compact row of buttons, not the patient's big picker; NRS shows "Higher/Lower is better" not the patient question; GAS shows the meaning when you pick a level; the patient's own check-in still uses the full guided picker. DA copy is the existing (already-translated) strings.

- **Zip:** `treatment-companion-simplify-cockpit-73.zip`  ·  **Tag:** `simplify-cockpit-73`  ·  **Migration: none (needs 0095 if not yet run).** Trend-chart size fix.
- **Bare trend chart shrunk** (`components/clinician/GoalProgressView.tsx`): the chart is a fixed-aspect viewBox rendered `w-full`, so in the therapist's wide right column it scaled up to ~280px tall. In `bare` mode the viewBox width is now 560 (was 360) while height stays 160 — same 0-10 / GAS coordinate layout, just a flatter aspect, so it renders short (~180px) and full-width with no distortion. Non-bare (clinician page) charts are untouched at 360.
- No i18n, no schema, no other changes. Builds on cockpit-72.
- **⚠ QA:** on the therapist page the per-goal chart should now be a short, wide trend strip rather than a tall block; the clinician treatment page chart should look exactly as before.

- **Zip:** `treatment-companion-simplify-cockpit-72.zip`  ·  **Tag:** `simplify-cockpit-72`  ·  **Migration: none (needs 0095 if not yet run).** Therapist page reworked to information-left / actions-right (approved from `therapist-layout-options.html`, option B).
- **Two-column split** (`app/[locale]/physio/patient/page.tsx`): when a cycle is active and there's context to show, the body is a `lg:grid lg:grid-cols-[330px_minmax(0,1fr)]`. **Left (sticky)** = the clinical picture, read once and kept in view while rating: cycle-week line, the since-last-visit recap, the physician's clinic note, the treated-muscle list, and the patient's recent comments. **Right** = the visit: the rating form, the note-to-clinic card, and a quiet "Suggest a goal" button. Collapses to a single column when `!wide` (phones) or `!leftHasContent` (new patient with no note / no treatment / no comments) — `leftHasContent` gates both the grid and the sticky wrapper, so there's no empty-rail.
- **History removed.** The `openPanel === 'history'` panel and the action-row chip are gone; the inline per-goal trend chart already is the rating history (tap a dot for the value). The `AssessmentHistoryPanel` function is left defined but unused (no lint/tsc failure; can be deleted later).
- **Treated muscles folded into the left column** via the existing `TreatedMusclesSection` (still collapsed-by-default), instead of living behind the `muscles` chip.
- **Suggest goal demoted**: no more 3-chip `PhysioActionRow` (import removed); a single dashed "Suggest a goal" button in the right column toggles `PhysioGoalSuggestionForm` + the sent-suggestions list. State is now `suggestGoalOpen: boolean` (was `openPanel`). The no-cycle branch keeps its own pre-cycle suggest form.
- **Goals: bands → stacked cards** (`components/physio/PhysioProgressForm.tsx`): the right column is ~half width, too narrow for chart-beside-rating, so each goal is a card with the trend chart on top (via `GoalProgressView bare`), a hairline, then "Your rating today" + the picker + the treatment-change flag. The `bare` prop and the standalone `/physio/progress` plain cards are unchanged.
- No i18n keys added (parity 1568). `physioForms.action*` / `actionShort*` and `actionHistory` keys are now unused (left in place).
- **⚠ QA (cannot verify here):** wide screen shows info on the left, the visit on the right, and the left stays in view as you scroll the goals; History is gone; the treated-muscle list is in the left column; "Suggest a goal" is one quiet button that opens the form. Brand-new patient (no note/treatment/comments) and phones fall back to a single column. Each goal is a stacked card (chart above rating). DA copy first-pass.
- **Deployment note (still open from the screenshot):** the live site was showing a pre-cockpit-70 build ("Record a visit", "working on", side-loaded layout). That's a deploy/cache issue, not the code — confirm the zip actually replaced the repo source and that Vercel rebuilt (and hard-refresh Firefox). This zip is correct at the source level.

- **Zip:** `treatment-companion-simplify-cockpit-71.zip`  ·  **Tag:** `simplify-cockpit-71`  ·  **Migration: none (needs 0095 if not yet run).** The 1080 therapist cockpit layout (the approved v2 mockup).
- **Horizontal goal bands** (`components/physio/PhysioProgressForm.tsx`): when trend data is present, each goal renders as one wide band — the **trend chart on the left half, the rating on the right half**, split by a hairline (`lg:grid lg:grid-cols-2`, `lg:border-r`). One short row per goal instead of a tall stack. Below `lg` the two halves stack (border-top divider). The standalone `/physio/progress` page (no trend) still renders the plain single-column cards.
- **`GoalProgressView` `bare` prop** (`components/clinician/GoalProgressView.tsx`): new optional `bare?: boolean` (default false). When true the outer `<article>` drops its border/background/padding, so the chart embeds inside the band's left cell with no card-in-card. Existing clinician-page uses are unaffected.
- **Top context row, rail retired** (`app/[locale]/physio/patient/page.tsx`): the two-pane grid + sticky left rail (cockpit-64/69) are gone. The cycle-week line + late-cycle hint sit at the top, then the **physician's clinic note and the patient's recent comments sit side by side as a 2-col row** across the top (`lg:grid lg:grid-cols-2`), then the visit/work column runs full-width below. This frees the full width for the bands and removes the empty-rail problem entirely. Page + header widened **720 → 1080** (`--max-w-page-mid` → `--max-w-page-wide`). `railHasContent` removed (unused).
- **Bug fix (was shipped in cockpit-70):** the rewritten form referenced `physioForms.suggestChange` / `changeNoteLabel` / `changeNotePlaceholder`, which were never defined — the treatment-change flag label, its prompt, and its placeholder would have rendered as raw key strings. Now correctly using the defined `needsAdjustment` / `adjustmentNoteLabel` / `adjustmentNotePlaceholder`. (If you deployed cockpit-70, this is the fix; deploy 71.)
- No i18n keys added (parity unchanged, 1568).
- **⚠ QA (cannot verify here):** on a wide screen each goal is one horizontal band (chart left, rating right); the clinic note + patient comments are a row across the top, not a side column; nothing shows a huge empty gap; on a phone the band halves stack and the context stacks. The treatment-change flag now shows real wording (not `needsAdjustment` etc.). The page is ~1080 wide and matches the header width.

- **Zip:** `treatment-companion-simplify-cockpit-70.zip`  ·  **Tag:** `simplify-cockpit-70`  ·  **Migration: none (needs 0095 if not yet run).** Therapist visit-rating feature model, simplified.
- **Per-goal interaction simplified** (`components/physio/PhysioProgressForm.tsx`, rewritten): **(a)** dropped the **"Working on this"** toggle — rating a goal *is* the report that you engaged with it; **(b)** the rating picker now shows **directly** (removed the "Rate" expand step and the open/collapse state); **(c)** **"Needs adjustment"** recast as the constructive **"Suggest a treatment change for this goal"** with prompt **"What change might help?"** and a recommending placeholder; **(d)** the visit's own free-text **note removed** — the standalone **note-to-clinic** card is now the single free-text channel; **(e)** the inline **recent-assessments list removed** (the trend chart already is the rating history; the per-visit log stays behind the Visit-history entry). A goal is included in the visit when it's rated *or* carries a treatment-change suggestion. Submission no longer sets `working_on`.
- **Physician side** (`app/[locale]/clinician/patient/page.tsx`): `workingOnGoalIds` now **derived from having any therapist rating** for the goal (not the retired flag), so the "working on" tag still lights up. The therapist-input panel heading **"Adjustment requests" → "Treatment-change suggestions from the therapist."**
- i18n: reworded `physioForms.sectionTitle`/`sectionHint`, repurposed `needsAdjustment`/`adjustmentNoteLabel`/`adjustmentNotePlaceholder` to the constructive copy, added `ratingHeading`/`ratingOptional`, renamed `clinician.patient.physioAdjustmentsHeading` (en/da). `/physio/progress` standalone still works (renders the plain rating cards).
- **Next (the 1080 layout, build 2):** rebuild `/physio/patient` wide layout into the horizontal goal bands (trend left, rating right), context as a top row (clinic note + patient comments) rather than a side rail, page widened to 1080, the note-to-clinic full-width below. Mockups: `therapist-1080-proposal-v2.html`.
- **⚠ QA (cannot verify here):** per goal you see the trend then the rating directly (no extra tap); there's no "working on" button; "Suggest a treatment change" reveals "What change might help?"; the only free-text note is the note-to-clinic card; Save commits the rated/flagged goals. Physician: the goal still shows the "working on" tag once you've rated it; the panel heading reads "Treatment-change suggestions from the therapist". DA copy is first-pass.

- **Zip:** `treatment-companion-simplify-cockpit-69.zip`  ·  **Tag:** `simplify-cockpit-69`  ·  **Migration: none (needs 0095 if not yet run).** Therapist cockpit layout fix.
- **Fixed the empty-rail layout.** The two-pane grid reserved a fixed 300px context rail unconditionally, but the rail only carries the clinic note, recent patient comments, and the late-cycle hint. For a patient with none of those (e.g. mid-cycle, no handoff note, no recent comments), the rail held only the week line and the page rendered as a 300px empty gutter (44% of the 720px mid-width page) with everything crammed into the ~388px work column. Now a `railHasContent` flag (`showLateCycleHint || handoff || recent comments`) gates **both** the `lg:grid` wrapper and the `lg:sticky` rail; when false, the rail and work `div`s simply stack as a single comfortable column. `app/[locale]/physio/patient/page.tsx`.
- No data, copy, or width-token change — purely conditional layout.
- **NB for later:** when the rail *does* have content, the cockpit is still the 720px mid width (rail 300 + work ~388). That's the existing proportion and renders fine, but if the work column ever feels tight, widening the cockpit to the wide token (1080) for the two-pane case is the follow-up (it would also need the header width matched).
- **⚠ QA (cannot verify here):** a patient with no clinic note and no recent comments now shows a single centred column (week line on top, then actions + the record-a-visit cards) — no empty left gutter. A patient *with* a clinic note or recent comments still shows the two-pane cockpit (context rail left, work right).

- **Zip:** `treatment-companion-simplify-cockpit-68.zip`  ·  **Tag:** `simplify-cockpit-68`  ·  **Migration: none (needs 0095 if not yet run).** Therapist surface slice 4 (polish).
- **Localised the last hardcoded English in the physio area.** `app/[locale]/physio/page.tsx`: `tFeedbackMessage` now returns i18n *keys* (`unlockErrorInvalidCode` / `unlockErrorNetwork` / `unlockErrorGeneric`) wrapped at the call site with `tPhysio(...)`. `app/[locale]/physio/patient/page.tsx`: the load-error block now uses `t('loadErrorTitle' | 'loadErrorBody' | 'loadErrorRetry')`. New i18n under `physio.*` (en/da first-pass).
- **"Since your last visit" recap.** A small banner at the top of the therapist patient work column: the date of the therapist's last assessment + (ICU-plural) the number of patient check-ins since then. Computed inline from `assessments` + `checkins`; renders only when a prior visit exists. New `physio.recapHeading` / `recapLastVisit` / `recapNewCheckins`.
- **Deleted dead code:** `components/physio/PhysioPlanSection.tsx` (defined, never imported).
- **Therapist epic status:** the cockpit (rail + unified goal cards + inline optional ratings + note channel), the note round-trip (therapist → physician → Seen receipt), and the physician's therapist-input panel are all in. **Remaining for this area:** native Danish review of every first-pass DA string (notably `therapistNote.*`, `physioForms.thisWeek`, `clinician.patient.physio*`, `physio.unlockError*/loadError*/recap*`); optionally standardise a few remaining small uppercase headings to the `eyebrow` class.
- **⚠ QA (cannot verify here):** trigger an unlock error on `/physio` (bad code) → localised message; force a load error on the patient page → localised block + "Try again"; with at least one prior therapist assessment, the recap shows the last-visit date and the new-check-in count; with none, no recap.

- **Zip:** `treatment-companion-simplify-cockpit-67.zip`  ·  **Tag:** `simplify-cockpit-67`  ·  **Migration: none (needs 0095 if not yet run).** Fixes the physician page (the missing therapist-input panel).
- **Built the physician's `'physio'` panel.** The `'physio'` action button on the clinician patient page had a count badge but no panel — clicking did nothing. Now `openPanel === 'physio'` renders a `CockpitPanelDrawer` showing: **therapist visit count** this cycle; **goal suggestions** (each with **Accept**/**Dismiss** → `set_physio_goal_suggestion_status` via `useSetPhysioGoalSuggestionStatus`); **muscle suggestions** (**Mark considered**/**Dismiss** → `set_physio_muscle_suggestion_status`); **adjustment requests** (read-only, amber, goal + note + date); and an empty state. The two status hooks were added top-level (before the early returns); the `openPanel` state type was widened to include `'physio'`. The therapist's free-text notes still show in the left column (cockpit-66); their goal ratings still draw as the amber chart line. `app/[locale]/clinician/patient/page.tsx`.
- New i18n `clinician.patient.physio*` (panel title, visits, headings, accept/dismiss/considered, toasts, empty, error; en/da first-pass).
- This **resolves the cockpit-66 finding** — the therapist→physician structured input now has a home. The therapist suggestion data was always being fetched + counted; only the panel render was absent.
- **⚠ QA (cannot verify here):** click "Therapist input" on a patient with pending suggestions → Accept/Dismiss a goal suggestion (toast; it drops off the list); the visit count reads sensibly; adjustment requests (set via the therapist's "needs adjustment" flag) show read-only; empty patients show the empty line. DA `physio*` strings read naturally.

- **Zip:** `treatment-companion-simplify-cockpit-66.zip`  ·  **Tag:** `simplify-cockpit-66`  ·  **Migration: none (needs 0095 if not yet run).** Therapist surface, slice 3 (physician side) — note round-trip complete.
- **Physician sees the therapist's notes + mark-seen-on-open.** New `useMarkTherapistNotesSeen()` (rpc `mark_therapist_notes_seen`) in `lib/supabase/therapistNote.ts`, and a new `components/clinician/TherapistNotesReview.tsx` rendered at the foot of the clinician patient page's **left context column** (`app/[locale]/clinician/patient/page.tsx`). It lists the therapist's notes (date + body, read-only, newest first), renders nothing when there are none, and on open marks any unseen notes seen **once** — which flips the therapist's receipt from **Delivered** to **Seen · <time>** (no name; seen_by audit-only). The note channel now round-trips end to end.
- New i18n `therapistNote.reviewHeading` (en/da first-pass).
- **⚠ Finding (for the incoming dev / a future slice):** on the clinician patient page the `'physio'` action button + count badge exist (`PatientActionRow physioCount`), but **no `openPanel === 'physio'` panel is rendered** — clicking it does nothing. The therapist-activity values `adjustmentRequests`, `hasTherapistActivity`, `therapyVisitCount` are computed (~lines 566-602) but **never rendered**, and there are orphaned `PhysioGoalSuggestion`/`PhysioMuscleSuggestion` action-row components at the foot of the file (~1995+). The physician's structured therapist-input surface (suggestions to accept, adjustment requests, visit count) appears half-built/mid-refactor. Therapist goal suggestions still surface as the amber line on each goal chart (`physioRatingsByGoal`), so assessments are visible; only the structured-input *panel* is missing. Worth a dedicated slice.
- **⚠ QA (cannot verify here):** as a therapist, send a note; as the physician, open that patient → the note shows under "From the therapist" in the left column; reopen as the therapist → the receipt now reads "Seen · <time>". A patient still sees nothing. DA `reviewHeading` reads naturally.

- **Zip:** `treatment-companion-simplify-cockpit-65.zip`  ·  **Tag:** `simplify-cockpit-65`  ·  **Migration: none (needs 0095 if not yet run).** Therapist surface, slice 2b-ii (inline unified cards) — the Direction-3 cockpit, structurally complete.
- **Ratings folded inline as unified per-goal cards (Direction 3).** `/physio/patient` now renders `PhysioProgressForm` **inline** in the work column, replacing both the old "Report progress" button (→ `/physio/progress`) AND the separate read-only goals section. Each goal card shows its **trend** (`GoalProgressView`) + the physician's **per-goal handoff note**, then the rating controls under a **"This week"** label. Rating stays genuinely optional per goal (skip → no rating sent); one **Save** submits one assessment for the rated goals. The note-to-clinic card sits below the goals.
- **`PhysioProgressForm` gained optional trend props** — `currentWeek`, `ratingsByGoal`, `physioRatingsByGoal`, `goalHandoffNotes`. When present (inline use), it renders the unified trend+rating cards; when absent it renders the plain rating cards it always did, so the **dormant `/physio/progress` route still works** (it's just no longer linked). `components/physio/PhysioProgressForm.tsx`.
- New i18n `physioForms.thisWeek` (en/da first-pass).
- **Therapist surface so far:** context rail (cycle/week, clinic note, patient comments) · work column = action-row chips + unified goal cards (trend + inline optional rating + per-goal physician note) + visit date/note + Save + recent assessments + the note-to-clinic channel. Still ahead: **slice 3** (physician side — therapist-notes stream + mark-seen-on-open, lights up the "Seen" receipt) and **slice 4 polish** ("since your last visit" recap; i18n the hardcoded English in the physio pages; standardise headings to eyebrow; delete dead PhysioPlanSection; redirect/retire `/physio/progress`; native DA review).
- **⚠ QA (cannot verify here):** with a cycle, each goal shows its chart then a "This week" rate block; rating one goal and Saving records an assessment; skipping a goal sends nothing for it; the physician's per-goal note shows above the rate block; the note-to-clinic card sits at the bottom; on a phone it all stacks. The standalone `/physio/progress` (if hit directly) still works.

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

**Roadmap & current status — see `docs/ROADMAP.md`** (the **living** forward plan; tracks done-vs-open, who owns each item, and the standing rules). It grew out of `docs/ASSESSMENT-2026-06-15.md` (the dated snapshot, which supersedes `ASSESSMENT-2026-06.md`); when the two disagree, `ROADMAP.md` is newer.
Headline: framework-RCE risk closed (Next 16.2.7), SECURITY DEFINER surface audited + hardened, Sentry
live, E2E auto-runs, Dependabot in - and as of 2026-06-15 all of this is **applied live**. What still
gates real patients is **not code**: (1) regulatory + DPO sign-off (external), (2) backups + a tested
restore (the one open ops item), (3) native-Danish clinical-string review.

**★ ONE DEPLOY ITEM REMAINS: BACKUPS.** Confirm Supabase Pro + point-in-time recovery is on, and **test
one restore** into a scratch project at least once (procedure in `OPS.md`). A backup never restored is a
hope, and patient data is the one thing that cannot be recreated - this is the highest data-loss risk.

**Applied live by Nikolaj (2026-06-15):** `0108` + `0109` run in the Supabase SQL editor; Sentry DSN set
in Vercel (EU project); `package.json` + `package-lock.json` committed together + `.github/dependabot.yml`
+ the two Dependabot toggles on; the renamed-away `middleware.ts` / `sentry.client.config.ts` removed.
*One thing worth a quick eyeball if not already done: load the app logged-out and run a visit-code /
clinician-session flow once, to confirm `0109` surfaced no `permission denied for function` (static
analysis says it won't - the app makes no anon RPC calls - but it's a 10-second confirm for a clinical app).*

**Done this session (in the repo; full detail in section 7):** next16-upgrade-1 (Next 16.2.7),
secdef-harden-1 (`0108`), e2e-autorun-1 (E2E now runs daily + after each prod deploy + manual),
deps-secfix-1 (next-intl 4.13.0 security fix + Dependabot), sentry-enable-1, and audit-followups-1
(`0109` + the FORCE-RLS decision).

**Done this session (later) — `studies-and-fixes-1` (in the repo; full detail in §7):** migration `0110`
(study + study_membership + admin RPCs) with the admin Studies / Study-patients view, plus four
patient-surface fixes (profile language persist + locale-aware Back, login `localeDetection`, DOB-picker
layout, account-menu nav from the check-in wizard). **Run `0110`** in Supabase. The admin research-mode
study list (previously open in §8) is now **built**. Biometric login + 2FA remain **specced/deferred**
(TOTP via Supabase MFA; biometric as a native-app convenience; web passkeys held until GA).

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
