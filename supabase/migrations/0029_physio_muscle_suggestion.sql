-- ============================================================================
-- 0029 — Physiotherapist muscle suggestions.
--
-- During running evaluations a physiotherapist observes which muscles
-- are contributing to a movement problem (e.g. spastic gastrocnemius
-- limiting dorsiflexion). They flag these for the physician to consider
-- when planning the next injection.
--
-- Shape mirrors physio_goal_suggestion (migration 0027):
--   - muscle name: free text, same convention as the physician's own
--     injection entry (muscle_injection.muscle) — no catalog
--   - side: reuses the existing injection_side enum (left/right/bilateral)
--   - rationale: the clinical observation behind the suggestion
--   - optional approved_goal_id: the goal this muscle relates to, when
--     the observation was made in a specific goal's context. Nullable —
--     a general muscle observation has no goal link.
--
-- Lifecycle: physiotherapist creates it (status 'needsReview'); the
-- physician acts on it at the next injection visit (slice 5).
-- ============================================================================

create table physio_muscle_suggestion (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null references treatment_cycle(id) on delete cascade,
  physiotherapist_id uuid not null references clinician(id),
  -- Free-text muscle name, same length bound as muscle_injection.muscle.
  muscle text not null check (length(muscle) between 1 and 80),
  side injection_side not null,
  rationale text not null
    check (length(rationale) between 1 and 1000),
  -- Optional: the goal this muscle observation relates to. on delete
  -- set null so removing a goal doesn't delete the muscle suggestion —
  -- it just loses the link.
  related_goal_id uuid references approved_goal(id) on delete set null,
  status suggestion_status not null default 'needsReview',
  created_at timestamptz not null default now()
);

create index physio_muscle_suggestion_cycle_idx
  on physio_muscle_suggestion(treatment_cycle_id);
create index physio_muscle_suggestion_patient_idx
  on physio_muscle_suggestion(patient_id);
create index physio_muscle_suggestion_needs_review_idx
  on physio_muscle_suggestion(treatment_cycle_id)
  where status = 'needsReview';

-- ---------------------------------------------------------------------------
-- RLS — same shape as physio_goal_suggestion (migration 0027):
--   - any care professional with an active unlock for the patient reads
--   - only a physiotherapist with an active unlock inserts
--   - admin: all
-- ---------------------------------------------------------------------------

alter table physio_muscle_suggestion enable row level security;

create policy physio_muscle_suggestion_care_read on physio_muscle_suggestion
  for select using (clinician_can_access_patient(patient_id));

create policy physio_muscle_suggestion_physio_insert on physio_muscle_suggestion
  for insert with check (
    current_app_role() = 'physiotherapist'
    and clinician_can_access_patient(patient_id)
  );

create policy physio_muscle_suggestion_admin_all on physio_muscle_suggestion
  for all using (current_app_role() = 'admin');

grant select, insert on physio_muscle_suggestion to authenticated;
