-- ============================================================================
-- 0020 — Caregiver attribution on patient submissions.
--
-- Patients with spasticity are often helped by a caregiver — spouse,
-- adult child, paid carer — who may operate the app on their behalf.
-- We don't introduce a separate caregiver login (too much overhead
-- for the value); instead we record "who filled this in" as a label
-- on each patient-originated submission.
--
-- Touched tables:
--   weekly_checkin   — adds submitter_label
--   goal_suggestion  — adds submitter_label
--
-- The label has two possible values:
--   'self'      — the patient filled it in themselves (default)
--   'caregiver' — someone helping the patient filled it in
--
-- The clinician's chart and review screens display a small chip next
-- to entries marked 'caregiver' so they have appropriate context when
-- interpreting the rating.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'submitter_label') then
    create type submitter_label as enum ('self', 'caregiver');
  end if;
end $$;

alter table weekly_checkin
  add column if not exists submitter_label submitter_label not null default 'self';

alter table goal_suggestion
  add column if not exists submitter_label submitter_label not null default 'self';
