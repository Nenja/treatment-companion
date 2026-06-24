-- 0113_rls_initplan_select_wrap.sql
--
-- Performance Advisor follow-up (auth_rls_initplan — WARN, PERFORMANCE only, not security).
--
-- 11 "self-access" policies call auth.uid() directly, so Postgres re-evaluates it
-- once per row. Wrapping it as (select auth.uid()) lets the planner compute it once
-- per statement (InitPlan). (select auth.uid()) returns the same value for every row,
-- so row visibility is byte-for-byte identical — this is purely a performance change.
--
-- Only auth.uid() is wrapped. The custom helper current_app_role() in
-- profile_self_update is left untouched (not flagged; different lint surface).
--
-- Verified on a throwaway PG16 under a non-owner role with RLS enforced: per-row
-- visibility and INSERT/DELETE allow/deny are identical before and after.

begin;

alter policy profile_self_read on profile
  using (id = (select auth.uid()));

alter policy profile_self_update on profile
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = current_app_role());

alter policy patient_self_read on patient
  using (profile_id = (select auth.uid()));

alter policy clinician_self_read on clinician
  using (profile_id = (select auth.uid()));

alter policy audit_event_self_read on audit_event
  using (actor_profile_id = (select auth.uid()));

alter policy audit_event_insert on audit_event
  with check (actor_profile_id = (select auth.uid()));

alter policy push_subscription_self_select on push_subscription
  using (profile_id = (select auth.uid()));

alter policy push_subscription_self_insert on push_subscription
  with check (profile_id = (select auth.uid()));

alter policy push_subscription_self_delete on push_subscription
  using (profile_id = (select auth.uid()));

alter policy device_push_token_self_select on device_push_token
  using (profile_id = (select auth.uid()));

alter policy device_push_token_self_delete on device_push_token
  using (profile_id = (select auth.uid()));

commit;
