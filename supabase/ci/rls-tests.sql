-- ============================================================================
-- RLS-denial tests — run AFTER bootstrap + migrations + rls-test-setup.sql.
--
-- Each block impersonates a user by (a) setting test.uid (what auth.uid()
-- reads) and (b) SET ROLE to the non-superuser role, so the REAL policies
-- decide what is visible. _assert() raises on any failed expectation, which
-- (with psql ON_ERROR_STOP=1) fails the run. Every denial test is paired with
-- a positive control so a blanket "deny everything" bug can't pass silently.
--
-- RLS denial in Postgres is silent row-filtering (0 rows), not an error — so
-- the assertions check counts/existence, not raised exceptions.
-- ============================================================================
\set ON_ERROR_STOP on

\set PA   '''00000000-0000-0000-0000-0000000000a1'''
\set patA '''00000000-0000-0000-0000-0000000000a2'''
\set PC   '''00000000-0000-0000-0000-0000000000c1'''
\set patB '''00000000-0000-0000-0000-0000000000b2'''
\set PADMIN '''00000000-0000-0000-0000-0000000000d1'''

\echo '--- T1: patient A sees only their own patient row ---'
select set_config('test.uid', :PA, false);
set role authenticated;
select _assert((select count(*) from patient) = 1,
  'patient A should see exactly one patient row (their own)');
select _assert(exists(select 1 from patient where id = :patA),
  'patient A should see their OWN patient row');
select _assert(not exists(select 1 from patient where id = :patB),
  'patient A must NOT see patient B''s row');
reset role;

\echo '--- T2: patient A cannot read patient B''s profile ---'
select set_config('test.uid', :PA, false);
set role authenticated;
select _assert(not exists(
    select 1 from profile where id = '00000000-0000-0000-0000-0000000000b1'),
  'patient A must NOT see patient B''s profile');
select _assert(exists(select 1 from profile where id = :PA),
  'patient A should see their own profile (positive control)');
reset role;

\echo '--- T3: patient reads only their OWN care-team notes, never another patient''s ---'
-- 0096 grants a patient read access to their own therapist/handoff notes
-- (GDPR right-of-access). The security invariant is therefore cross-patient
-- isolation, not "no access".
select set_config('test.uid', :PA, false);
set role authenticated;
select _assert((select count(*) from therapist_note where patient_id = :patA) = 1,
  'patient A SHOULD read their OWN therapist note (0096 right-of-access)');
select _assert((select count(*) from therapist_note where patient_id = :patB) = 0,
  'patient A must NOT read patient B''s therapist note');
select _assert((select count(*) from therapist_note) = 1,
  'patient A sees exactly one therapist note total (only their own)');
reset role;

\echo '--- T4: clinician WITH an active session sees A, never B ---'
reset role;
update clinician_session set last_activity_at = now(), ended_at = null
 where id = '00000000-0000-0000-0000-00000000ce01';
select set_config('test.uid', :PC, false);
set role authenticated;
select _assert(exists(select 1 from patient where id = :patA),
  'clinician with active session SHOULD see patient A (positive control)');
select _assert(not exists(select 1 from patient where id = :patB),
  'clinician must NOT see patient B (no session for B)');
select _assert(exists(select 1 from therapist_note where patient_id = :patA),
  'clinician with session SHOULD read A''s therapist note (positive control)');
select _assert(not exists(select 1 from therapist_note where patient_id = :patB),
  'clinician must NOT read patient B''s therapist note (no session for B)');
reset role;

\echo '--- T5: a STALE session (>1h idle) grants no access ---'
reset role;
update clinician_session set last_activity_at = now() - interval '2 hours'
 where id = '00000000-0000-0000-0000-00000000ce01';
select set_config('test.uid', :PC, false);
set role authenticated;
select _assert(not exists(select 1 from patient where id = :patA),
  'a stale clinician session must NOT grant patient access');
reset role;
-- restore the session for any later use
update clinician_session set last_activity_at = now()
 where id = '00000000-0000-0000-0000-00000000ce01';

\echo '--- T6: anonymous (no JWT) sees nothing ---'
select set_config('test.uid', '', false);
set role anon;
select _assert((select count(*) from patient) = 0,
  'anon must see no patient rows');
select _assert((select count(*) from profile) = 0,
  'anon must see no profile rows');
select _assert((select count(*) from therapist_note) = 0,
  'anon must see no therapist notes');
reset role;

\echo '--- T7: study tables are admin-only ---'
select set_config('test.uid', :PA, false);
set role authenticated;
select _assert((select count(*) from study) = 0,
  'a non-admin patient must NOT read the study table');
select _assert((select count(*) from study_membership) = 0,
  'a non-admin patient must NOT read study_membership');
reset role;
select set_config('test.uid', :PADMIN, false);
set role authenticated;
select _assert((select count(*) from study) >= 1,
  'an admin SHOULD read the study table (positive control)');
reset role;

\echo ''
\echo 'ALL RLS-DENIAL ASSERTIONS PASSED'
