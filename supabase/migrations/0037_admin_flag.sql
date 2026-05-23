-- ============================================================================
-- 0037 — Split admin from the base role.
--
-- Until now `role` was a single enum (patient | clinician |
-- physiotherapist | admin) — one person, one role — and "admin"
-- functionality was in practice gated to clinicians anyway.
--
-- This makes admin ORTHOGONAL: a boolean `is_admin` layered on top of
-- whatever base role a person has. A clinician can also be an admin; a
-- physiotherapist can be made an admin; admin is no longer a role you
-- "are instead of" something else.
--
-- Design:
--   - `role` keeps its three working values (patient/clinician/
--     physiotherapist). The 'admin' enum value is left in the type —
--     removing an enum value is risky — but is no longer assigned.
--   - new `is_admin` boolean on profile.
--   - new current_user_is_admin() SQL helper for RLS. We do NOT change
--     current_app_role(): if it returned 'admin' for an admin who is
--     also a clinician, every `current_app_role() = 'clinician'`
--     policy would fail for them. Base role and admin are separate
--     questions and get separate functions.
--
-- LOCKOUT SAFETY: the admin page becomes is_admin-gated. To ensure
-- nobody loses access on deploy, every existing clinician is
-- backfilled as is_admin. Un-flag the ones who shouldn't have it from
-- the admin UI afterwards.
-- ============================================================================

alter table profile
  add column if not exists is_admin boolean not null default false;

-- Backfill: today every clinician can reach the admin page, so flag
-- them all as admin — no one is locked out on deploy. Any pre-existing
-- account whose role is the legacy 'admin' value is also flagged (and
-- could later have its base role corrected to clinician).
update profile
   set is_admin = true
 where role in ('clinician', 'admin');

-- ---------------------------------------------------------------------------
-- current_user_is_admin() — admin check for RLS, independent of role.
-- ---------------------------------------------------------------------------

create or replace function current_user_is_admin() returns boolean as $$
  select coalesce(
    (select is_admin from profile where id = auth.uid()),
    false
  );
$$ language sql stable security definer;

comment on function current_user_is_admin() is
  'True when the current authenticated user has the is_admin flag. '
  'Admin is orthogonal to the base role (current_app_role()).';

-- ---------------------------------------------------------------------------
-- Rebuild every admin RLS policy to use current_user_is_admin()
-- instead of current_app_role() = 'admin'. Same access, but now keyed
-- to the orthogonal flag — an admin who is also a clinician/physio is
-- correctly recognised as admin without their base role interfering.
--
-- drop-if-exists then create, so this is safe to run once. All but
-- audit_event_admin_read are `for all`; that one is `for select`.
-- ---------------------------------------------------------------------------

drop policy if exists profile_admin_all on profile;
create policy profile_admin_all on profile
  for all using (current_user_is_admin());

drop policy if exists patient_admin_all on patient;
create policy patient_admin_all on patient
  for all using (current_user_is_admin());

drop policy if exists clinician_admin_all on clinician;
create policy clinician_admin_all on clinician
  for all using (current_user_is_admin());

drop policy if exists treatment_cycle_admin_all on treatment_cycle;
create policy treatment_cycle_admin_all on treatment_cycle
  for all using (current_user_is_admin());

drop policy if exists goal_suggestion_admin_all on goal_suggestion;
create policy goal_suggestion_admin_all on goal_suggestion
  for all using (current_user_is_admin());

drop policy if exists approved_goal_admin_all on approved_goal;
create policy approved_goal_admin_all on approved_goal
  for all using (current_user_is_admin());

drop policy if exists weekly_prompt_admin_all on weekly_prompt;
create policy weekly_prompt_admin_all on weekly_prompt
  for all using (current_user_is_admin());

drop policy if exists weekly_checkin_admin_all on weekly_checkin;
create policy weekly_checkin_admin_all on weekly_checkin
  for all using (current_user_is_admin());

drop policy if exists weekly_goal_rating_admin_all on weekly_goal_rating;
create policy weekly_goal_rating_admin_all on weekly_goal_rating
  for all using (current_user_is_admin());

drop policy if exists treatment_session_admin_all on treatment_session;
create policy treatment_session_admin_all on treatment_session
  for all using (current_user_is_admin());

drop policy if exists muscle_injection_admin_all on muscle_injection;
create policy muscle_injection_admin_all on muscle_injection
  for all using (current_user_is_admin());

drop policy if exists visit_code_admin_all on visit_code;
create policy visit_code_admin_all on visit_code
  for all using (current_user_is_admin());

drop policy if exists clinician_session_admin_all on clinician_session;
create policy clinician_session_admin_all on clinician_session
  for all using (current_user_is_admin());

drop policy if exists audit_event_admin_read on audit_event;
create policy audit_event_admin_read on audit_event
  for select using (current_user_is_admin());

drop policy if exists physio_assessment_admin_all on physio_assessment;
create policy physio_assessment_admin_all on physio_assessment
  for all using (current_user_is_admin());

drop policy if exists physio_goal_rating_admin_all on physio_goal_rating;
create policy physio_goal_rating_admin_all on physio_goal_rating
  for all using (current_user_is_admin());

drop policy if exists physio_goal_suggestion_admin_all on physio_goal_suggestion;
create policy physio_goal_suggestion_admin_all on physio_goal_suggestion
  for all using (current_user_is_admin());

drop policy if exists physio_muscle_suggestion_admin_all on physio_muscle_suggestion;
create policy physio_muscle_suggestion_admin_all on physio_muscle_suggestion
  for all using (current_user_is_admin());
