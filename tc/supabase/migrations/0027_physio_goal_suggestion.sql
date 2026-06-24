-- ============================================================================
-- 0027 — Physiotherapist goal suggestions.
--
-- A physiotherapist, during a running evaluation, may recommend a new
-- treatment goal for the physician to consider at the next injection
-- visit. This is distinct from a patient goal suggestion:
--   - the patient's goal_suggestion is plain-language and subjective
--     (importance, hoped timeframe — patient-perspective fields)
--   - a physiotherapist suggestion is clinically framed: a suggested
--     goal in clinical language plus a rationale based on observation
--
-- We use a separate table rather than overloading goal_suggestion so
-- neither shape has to carry the other's irrelevant fields. The
-- physician reviews the two in separate sections.
--
-- Lifecycle: physiotherapist creates it (status 'needsReview'); at the
-- next injection visit the physician acts on it. Slice 5 builds the
-- physician review surface; for now the status field is here and
-- defaults to 'needsReview'. We reuse the existing suggestion_status
-- enum so the review workflow can mirror the patient one.
-- ============================================================================

create table physio_goal_suggestion (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null references treatment_cycle(id) on delete cascade,
  -- The physiotherapist who suggested it (a row in the `clinician`
  -- table — see migration 0023's note on that table holding any
  -- unlocking professional).
  physiotherapist_id uuid not null references clinician(id),
  -- The suggested goal, in the physiotherapist's clinical language.
  suggested_goal text not null
    check (length(suggested_goal) between 1 and 500),
  -- Why — the clinical rationale, based on what they observed.
  rationale text not null
    check (length(rationale) between 1 and 1000),
  status suggestion_status not null default 'needsReview',
  created_at timestamptz not null default now()
);

create index physio_goal_suggestion_cycle_idx
  on physio_goal_suggestion(treatment_cycle_id);
create index physio_goal_suggestion_patient_idx
  on physio_goal_suggestion(patient_id);
create index physio_goal_suggestion_needs_review_idx
  on physio_goal_suggestion(treatment_cycle_id)
  where status = 'needsReview';

-- ---------------------------------------------------------------------------
-- RLS — same shape as physio_assessment (migration 0025):
--   - any care professional with an active unlock for the patient can read
--   - only a physiotherapist with an active unlock can insert
--   - admin: all
-- Updates (the physician acting on a suggestion at review time) are
-- added in slice 5 when that workflow is built.
-- ---------------------------------------------------------------------------

alter table physio_goal_suggestion enable row level security;

create policy physio_goal_suggestion_care_read on physio_goal_suggestion
  for select using (clinician_can_access_patient(patient_id));

create policy physio_goal_suggestion_physio_insert on physio_goal_suggestion
  for insert with check (
    current_app_role() = 'physiotherapist'
    and clinician_can_access_patient(patient_id)
  );

create policy physio_goal_suggestion_admin_all on physio_goal_suggestion
  for all using (current_app_role() = 'admin');

grant select, insert on physio_goal_suggestion to authenticated;
