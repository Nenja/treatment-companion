-- ============================================================================
-- RLS-denial test SETUP — run AFTER bootstrap.sql + all migrations.
--
-- The CI `migrations` job stubs auth.uid() to NULL because it only validates
-- that DDL applies. This file converts that throwaway DB into one where RLS
-- can actually be exercised:
--   • auth.uid() reads a per-connection GUC (test.uid) we can flip to
--     impersonate any user — the same input the real auth.uid() derives from
--     the JWT, so the REAL policies and SECURITY DEFINER helpers run unchanged;
--   • the authenticated/anon roles get the broad table grants Supabase gives
--     them by default, so any denial we observe comes from RLS, not a missing
--     GRANT (a denial for the wrong reason would be a false pass);
--   • a tiny _assert() raises on a failed expectation so the script aborts
--     (psql ON_ERROR_STOP) and CI goes red;
--   • deterministic fixtures: two patients, a clinician with an active session
--     for patient A only, an admin, a therapist note for A, and a study.
--
-- This file is CI/test-only. It is never run against a real database.
-- ============================================================================

-- auth.uid(): read the impersonated user from a session GUC. Overrides the
-- bootstrap NULL stub. nullif(...,'') so an unset/blank GUC => NULL (anon).
create or replace function auth.uid() returns uuid
  language sql stable
as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

-- Mirror Supabase's default grants so RLS is the only thing standing between
-- a role and a row. (Real Supabase grants these to authenticated; we add anon
-- too so the anon test proves RLS denies even with the grant present.)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

-- Assertion helper. Plain (not SECURITY DEFINER): its boolean argument is
-- evaluated in the CALLER's role/RLS context, which is the whole point.
create or replace function _assert(cond boolean, msg text) returns void
  language plpgsql
as $$ begin
  if cond is distinct from true then
    raise exception 'RLS-TEST FAIL: %', msg;
  end if;
end $$;
grant execute on function _assert(boolean, text) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Fixtures (seeded as the migration runner / table owner, bypassing RLS).
-- Fixed UUIDs so the assertions can reference them as psql variables.
-- ---------------------------------------------------------------------------
-- The 0081 signup trigger auto-creates a patient row (random id) whenever a
-- patient profile is inserted. Drop it here (test DB only) so we control
-- patient.id deterministically.
drop trigger if exists on_profile_created_patient on profile;

-- Patient A
insert into profile (id, role, display_name, email, is_admin) values
  ('00000000-0000-0000-0000-0000000000a1', 'patient', 'Patient A', 'a@test.local', false);
insert into patient (id, profile_id) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a1');

-- Patient B
insert into profile (id, role, display_name, email, is_admin) values
  ('00000000-0000-0000-0000-0000000000b1', 'patient', 'Patient B', 'b@test.local', false);
insert into patient (id, profile_id) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000b1');

-- Clinician C (active session for A only)
insert into profile (id, role, display_name, email, is_admin) values
  ('00000000-0000-0000-0000-0000000000c1', 'clinician', 'Clinician C', 'c@test.local', false);
insert into clinician (id, profile_id) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1');
insert into visit_code (code, patient_id, expires_at) values
  ('AAAAAA', '00000000-0000-0000-0000-0000000000a2', now() + interval '1 day');
insert into clinician_session (id, clinician_id, patient_id, visit_code, last_activity_at, ended_at) values
  ('00000000-0000-0000-0000-00000000ce01',
   '00000000-0000-0000-0000-0000000000c2',
   '00000000-0000-0000-0000-0000000000a2',
   'AAAAAA', now(), null);

-- Admin (role is irrelevant; is_admin is the orthogonal flag, 0037)
insert into profile (id, role, display_name, email, is_admin) values
  ('00000000-0000-0000-0000-0000000000d1', 'clinician', 'Admin D', 'd@test.local', true);

-- Downward channel: a therapist note for patient A AND one for patient B.
-- NOTE: migration 0096 (patient_care_team_notes) gives a patient read access
-- to their OWN care-team notes (GDPR right-of-access), so the invariant under
-- test is cross-patient isolation (A must not see B's note), not "patient sees
-- no notes". 0096 supersedes the original 0095 "never patient-visible" design.
insert into therapist_note (patient_id, physiotherapist_id, body) values
  ('00000000-0000-0000-0000-0000000000a2',
   '00000000-0000-0000-0000-0000000000c2',
   'Tone slightly increased in left gastrocnemius since last visit.'),
  ('00000000-0000-0000-0000-0000000000b2',
   '00000000-0000-0000-0000-0000000000c2',
   'Note about patient B.');

-- A study with patient A enrolled (admin-only tables, 0110).
insert into study (id, key, name) values
  ('00000000-0000-0000-0000-00000000570d', 'RLS-TEST', 'RLS test study');
insert into study_membership (study_id, patient_id) values
  ('00000000-0000-0000-0000-00000000570d', '00000000-0000-0000-0000-0000000000a2');
