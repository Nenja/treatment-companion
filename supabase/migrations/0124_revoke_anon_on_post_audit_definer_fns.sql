-- 0124_revoke_anon_on_post_audit_definer_fns.sql
--
-- Forward fix for an anon-grant gap found in production verification.
--
-- A prior audit revoked anon EXECUTE on the SECURITY DEFINER functions then in
-- the schema, retaining it on exactly the 6 RLS predicate helpers that policies
-- evaluate in the anon context (clinician_can_access_patient, current_app_role,
-- current_clinician_id, current_patient_id, current_role_is_care_professional,
-- current_user_is_admin). Functions added AFTER that audit — the questionnaire
-- module and set_wearable_import_metrics (0121) — were granted to authenticated
-- but never had the default EXECUTE-to-PUBLIC grant revoked, so anon retained
-- access. These are SECURITY DEFINER (they bypass RLS), so anon must not call
-- them. This revokes anon forward and re-asserts the intended grants
-- (authenticated + service_role), leaving the 6 predicate helpers untouched.
--
-- Defense in depth: most of these guard internally on the caller's identity
-- (which is NULL for anon), but removing the anon grant eliminates the surface
-- regardless of guard correctness — the same NULL-propagation class fixed in
-- 0121/0122 lives in disjunctive guards.
--
-- Idempotent and signature-agnostic (oid::regprocedure handles arg lists/overloads).

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.prosecdef
      and p.proname in (
        'assign_questionnaire',
        'create_questionnaire',
        'due_questionnaires_for_checkin',
        'due_questionnaires_for_week',
        'export_questionnaire_responses',
        'list_library_questionnaires',
        'list_patient_questionnaire_responses',
        'list_patient_questionnaires',
        'set_library_visibility',
        'set_questionnaire_assignment_active',
        'set_wearable_import_metrics',
        'submit_questionnaire_response'
      )
  loop
    -- Remove the broad default (PUBLIC) and any explicit anon grant, then
    -- re-assert the intended callers.
    execute format('revoke all on function %s from public, anon', r.fn);
    execute format('grant execute on function %s to authenticated, service_role', r.fn);
  end loop;
end $$;

-- Verification (each listed fn should be: anon f, authenticated t, service_role t;
-- the 6 predicate helpers remain anon t):
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can,
--          has_function_privilege('service_role',  p.oid, 'EXECUTE') as sr_can
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
--   where p.prosecdef
--   order by anon_can desc, p.proname;
