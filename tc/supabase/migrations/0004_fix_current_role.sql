-- ============================================================================
-- 0004 — Fix reserved-word collision: rename current_role() to
-- current_app_role().
--
-- PostgreSQL has a built-in `current_role` that returns the current SQL
-- session role. Defining a function with the same name fails at parse
-- time. This migration drops the broken function (if it was partially
-- created), recreates it under a non-reserved name, and rewrites every
-- policy that referenced it.
--
-- If 0002_rls_policies.sql failed midway through, this migration
-- assumes some policies may not exist yet. The `drop policy if exists`
-- statements make it safe to run regardless of how far 0002 got.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the broken function if it exists. It probably doesn't,
--    because the original CREATE failed, but be safe.
-- ---------------------------------------------------------------------------
drop function if exists "current_role"();  -- quoted: current_role is a reserved word

-- ---------------------------------------------------------------------------
-- 2. Recreate under the new name.
-- ---------------------------------------------------------------------------
create or replace function current_app_role() returns role as $$
  select role from profile where id = auth.uid();
$$ language sql stable security definer;

comment on function current_app_role() is
  'Returns the application-level role for the current authenticated user. '
  'Renamed from current_role() to avoid collision with the built-in.';

-- ---------------------------------------------------------------------------
-- 3. Rebuild every policy that referenced current_role().
--    Use drop-if-exists so this is idempotent regardless of whether
--    0002 completed.
-- ---------------------------------------------------------------------------

-- profile
drop policy if exists profile_clinician_read_patient on profile;
create policy profile_clinician_read_patient on profile
  for select using (
    current_app_role() = 'clinician'
    and exists (
      select 1 from patient p
       where p.profile_id = profile.id
         and clinician_can_access_patient(p.id)
    )
  );

drop policy if exists profile_admin_all on profile;
create policy profile_admin_all on profile
  for all using (current_app_role() = 'admin');

drop policy if exists profile_self_update on profile;
create policy profile_self_update on profile
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = current_app_role());

-- patient
drop policy if exists patient_admin_all on patient;
create policy patient_admin_all on patient
  for all using (current_app_role() = 'admin');

-- clinician
drop policy if exists clinician_admin_all on clinician;
create policy clinician_admin_all on clinician
  for all using (current_app_role() = 'admin');

-- treatment_cycle
drop policy if exists treatment_cycle_clinician_write on treatment_cycle;
create policy treatment_cycle_clinician_write on treatment_cycle
  for all using (
    current_app_role() = 'clinician'
    and clinician_can_access_patient(patient_id)
  )
  with check (clinician_can_access_patient(patient_id));

drop policy if exists treatment_cycle_admin_all on treatment_cycle;
create policy treatment_cycle_admin_all on treatment_cycle
  for all using (current_app_role() = 'admin');

-- goal_suggestion
drop policy if exists goal_suggestion_admin_all on goal_suggestion;
create policy goal_suggestion_admin_all on goal_suggestion
  for all using (current_app_role() = 'admin');

-- approved_goal
drop policy if exists approved_goal_admin_all on approved_goal;
create policy approved_goal_admin_all on approved_goal
  for all using (current_app_role() = 'admin');

-- weekly_prompt
drop policy if exists weekly_prompt_admin_all on weekly_prompt;
create policy weekly_prompt_admin_all on weekly_prompt
  for all using (current_app_role() = 'admin');

-- weekly_checkin
drop policy if exists weekly_checkin_admin_all on weekly_checkin;
create policy weekly_checkin_admin_all on weekly_checkin
  for all using (current_app_role() = 'admin');

-- weekly_goal_rating
drop policy if exists weekly_goal_rating_admin_all on weekly_goal_rating;
create policy weekly_goal_rating_admin_all on weekly_goal_rating
  for all using (current_app_role() = 'admin');

-- treatment_session
drop policy if exists treatment_session_admin_all on treatment_session;
create policy treatment_session_admin_all on treatment_session
  for all using (current_app_role() = 'admin');

-- muscle_injection
drop policy if exists muscle_injection_admin_all on muscle_injection;
create policy muscle_injection_admin_all on muscle_injection
  for all using (current_app_role() = 'admin');

-- visit_code
drop policy if exists visit_code_admin_all on visit_code;
create policy visit_code_admin_all on visit_code
  for all using (current_app_role() = 'admin');

-- clinician_session
drop policy if exists clinician_session_admin_all on clinician_session;
create policy clinician_session_admin_all on clinician_session
  for all using (current_app_role() = 'admin');

-- audit_event
drop policy if exists audit_event_patient_read_own on audit_event;
create policy audit_event_patient_read_own on audit_event
  for select using (
    current_app_role() = 'patient'
    and entity in ('patient', 'goal_suggestion', 'approved_goal',
                   'weekly_checkin', 'treatment_session', 'visit_code')
  );

drop policy if exists audit_event_admin_read on audit_event;
create policy audit_event_admin_read on audit_event
  for select using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- 4. Tighten visit_code: patients must use the generate_visit_code RPC,
--    not direct INSERT, so the "invalidate prior code" logic always runs.
-- ---------------------------------------------------------------------------
drop policy if exists visit_code_patient_insert on visit_code;
-- The RPC is SECURITY DEFINER, so it bypasses RLS for INSERT. No
-- replacement policy needed — clients literally cannot insert directly.
