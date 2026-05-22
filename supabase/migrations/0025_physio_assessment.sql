-- ============================================================================
-- 0025 — Physiotherapist progress assessments.
--
-- A physiotherapist sees the patient 2-3x/week between injection visits
-- and does running evaluations. This migration lets them record an
-- assessment: one visit, on one date, carrying one clinical note, with
-- per-goal NRS ratings for whichever goals were relevant that day.
--
-- Two tables:
--   physio_assessment        — one row per physio visit
--   physio_goal_rating       — per-goal NRS rating within an assessment
--
-- Goals the physio didn't assess simply have no physio_goal_rating row.
--
-- The NRS value uses the SAME 0-10 scale the patient uses for weekly
-- check-ins, so the clinician's chart can show patient self-report and
-- physiotherapist assessment on the same axis. GAS is derived from NRS
-- the same way (via the goal's cut points) at read time — we don't
-- store a derived GAS here, the clinician view computes it.
--
-- These are physiotherapist-authored, so they reference the
-- physiotherapist's `clinician` table row (recall: the `clinician`
-- table holds any unlocking professional — see migration 0023's note).
-- ============================================================================

create table physio_assessment (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null references treatment_cycle(id) on delete cascade,
  -- The physiotherapist who recorded it (a row in the `clinician` table).
  physiotherapist_id uuid not null references clinician(id),
  -- Date of the physio visit. Date only — physio cares about the day,
  -- not the minute.
  assessment_date date not null,
  -- One free-text clinical note describing the visit overall.
  note text check (note is null or length(note) <= 2000),
  created_at timestamptz not null default now()
);

create index physio_assessment_cycle_idx
  on physio_assessment(treatment_cycle_id);
create index physio_assessment_patient_idx
  on physio_assessment(patient_id);

create table physio_goal_rating (
  id uuid primary key default gen_random_uuid(),
  physio_assessment_id uuid not null
    references physio_assessment(id) on delete cascade,
  approved_goal_id uuid not null references approved_goal(id) on delete cascade,
  -- Same 0-10 NRS scale the patient uses.
  nrs_value int not null check (nrs_value between 0 and 10),
  -- A given assessment rates each goal at most once.
  unique (physio_assessment_id, approved_goal_id)
);

create index physio_goal_rating_assessment_idx
  on physio_goal_rating(physio_assessment_id);

-- ---------------------------------------------------------------------------
-- RLS
--
-- physio_assessment / physio_goal_rating are visible to:
--   - the physiotherapist (and physician) with an active unlock for the
--     patient — via clinician_can_access_patient()
--   - admin
-- Only a caller with the physiotherapist role and an active unlock can
-- INSERT. We don't allow edits/deletes from the app for now (an
-- assessment is a point-in-time clinical record); admin can clean up
-- if needed.
-- ---------------------------------------------------------------------------

alter table physio_assessment  enable row level security;
alter table physio_goal_rating enable row level security;

create policy physio_assessment_care_read on physio_assessment
  for select using (clinician_can_access_patient(patient_id));

create policy physio_assessment_physio_insert on physio_assessment
  for insert with check (
    current_app_role() = 'physiotherapist'
    and clinician_can_access_patient(patient_id)
  );

create policy physio_assessment_admin_all on physio_assessment
  for all using (current_app_role() = 'admin');

-- physio_goal_rating inherits access via its parent assessment.
create policy physio_goal_rating_care_read on physio_goal_rating
  for select using (
    exists (
      select 1 from physio_assessment a
       where a.id = physio_goal_rating.physio_assessment_id
         and clinician_can_access_patient(a.patient_id)
    )
  );

create policy physio_goal_rating_physio_insert on physio_goal_rating
  for insert with check (
    current_app_role() = 'physiotherapist'
    and exists (
      select 1 from physio_assessment a
       where a.id = physio_goal_rating.physio_assessment_id
         and clinician_can_access_patient(a.patient_id)
    )
  );

create policy physio_goal_rating_admin_all on physio_goal_rating
  for all using (current_app_role() = 'admin');

grant select, insert on physio_assessment  to authenticated;
grant select, insert on physio_goal_rating to authenticated;
