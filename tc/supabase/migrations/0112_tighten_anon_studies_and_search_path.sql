-- 0112_tighten_anon_studies_and_search_path.sql
--
-- Security Advisor follow-up (continuation of F2 / migration 0109).
--
-- (1) anon EXECUTE on the study RPCs.
--     0109 revoked anon EXECUTE on every then-existing SECURITY DEFINER function
--     and granted it back only to authenticated + service_role. The study RPCs
--     were added later (0110), so they still default to PUBLIC and are reachable
--     by the anon (unauthenticated) role. They are already admin-gated internally
--     (current_user_is_admin() -> raise 'admin only'), so this is not an exploit
--     on its own; revoking anon is the same defence-in-depth 0109 applied — anon
--     has no legitimate reason to invoke them.
--
-- (2) Mutable search_path on flagged functions.
--     Pin search_path so these SECURITY DEFINER / trigger functions can't be
--     influenced by a caller's session search_path. Done dynamically so it binds
--     to whatever signatures actually exist (no signature drift), and so it also
--     covers any ad-hoc `whoami` present in the database that is not in the
--     migrations.
--
-- Reversible: GRANT EXECUTE ... TO PUBLIC to undo (1); RESET search_path to undo (2).

begin;

-- (1) Studies: drop the implicit PUBLIC/anon grant, keep authenticated + service_role.
revoke execute on function public.create_study(p_key text, p_name text, p_description text) from public, anon;
grant  execute on function public.create_study(p_key text, p_name text, p_description text) to authenticated, service_role;

revoke execute on function public.update_study(p_study_id uuid, p_name text, p_description text, p_active boolean) from public, anon;
grant  execute on function public.update_study(p_study_id uuid, p_name text, p_description text, p_active boolean) to authenticated, service_role;

revoke execute on function public.add_patient_to_study(p_study_id uuid, p_patient_id uuid) from public, anon;
grant  execute on function public.add_patient_to_study(p_study_id uuid, p_patient_id uuid) to authenticated, service_role;

revoke execute on function public.remove_patient_from_study(p_study_id uuid, p_patient_id uuid) from public, anon;
grant  execute on function public.remove_patient_from_study(p_study_id uuid, p_patient_id uuid) to authenticated, service_role;

revoke execute on function public.study_overview() from public, anon;
grant  execute on function public.study_overview() to authenticated, service_role;

-- (2) Pin search_path on the flagged functions.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'nrs_to_gas', 'gas_label', 'audit_event_immutable',
        'approved_goal_set_lineage', 'whoami'
      )
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

commit;
