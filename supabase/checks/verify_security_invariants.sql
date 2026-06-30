-- verify_security_invariants.sql
-- Re-run in the Supabase SQL editor after EVERY migration. Every row of the
-- summary should read PASS. The two raw sweeps below are for eyeballing detail.
--
-- This encodes the invariants behind migrations 0120-0125:
--   * every public table has RLS enabled
--   * the only anon-executable SECURITY DEFINER functions are the 6 RLS
--     predicate helpers (anything else anon-executable = a forgotten revoke,
--     the 0120/0121/0124 bug class)
--   * the wearable webhook RPCs are service_role-only (0123)
--   * import_observations carries its coalesce-hardened guard (0122)

-- ============================ SUMMARY (run this) ============================
with
allowed_anon(name) as (values
  ('clinician_can_access_patient'),('current_app_role'),('current_clinician_id'),
  ('current_patient_id'),('current_role_is_care_professional'),('current_user_is_admin')
),
secdef as (
  select p.proname, p.oid, has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.prosecdef
),
rls_off as (
  select c.relname from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  where c.relkind = 'r' and not c.relrowsecurity
),
unexpected_anon as (
  select proname from secdef where anon_can and proname not in (select name from allowed_anon)
),
webhook_open as (
  select p.proname from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.proname in ('ingest_wearable_observations','set_wearable_connection_status')
    and (has_function_privilege('anon', p.oid, 'EXECUTE')
         or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
),
checks(check_name, ok, detail) as (
  select 'A. No public table has RLS disabled',
         not exists (select 1 from rls_off),
         coalesce((select string_agg(relname, ', ') from rls_off), '-')
  union all
  select 'B. Only the 6 predicate helpers are anon-executable (SECURITY DEFINER)',
         not exists (select 1 from unexpected_anon),
         coalesce((select string_agg(proname, ', ') from unexpected_anon), '-')
  union all
  select 'C. Wearable webhook RPCs are service_role-only',
         not exists (select 1 from webhook_open),
         coalesce((select string_agg(proname, ', ') from webhook_open), '-')
  union all
  select 'D. import_observations hardened (coalesce in body)',
         exists (select 1 from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
                 where p.proname = 'import_observations'
                   and pg_get_functiondef(p.oid) ilike '%coalesce%'),
         'auth disjuncts must be coalesced'
)
select check_name,
       case when ok then 'PASS' else 'FAIL' end as result,
       detail
from checks
order by result, check_name;

-- ===================== RAW SWEEP 1: definer fn grants ======================
-- (highlight + run separately) anon_can should be true ONLY for the 6 helpers.
-- select p.proname,
--        has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can,
--        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can,
--        has_function_privilege('service_role',  p.oid, 'EXECUTE') as service_role_can
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
-- where p.prosecdef
-- order by anon_can desc, authenticated_can desc, p.proname;

-- ===================== RAW SWEEP 2: RLS per table ==========================
-- (highlight + run separately) rls_enabled should be true for every row.
-- select c.relname as table_name, c.relrowsecurity as rls_enabled
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
-- where c.relkind = 'r'
-- order by c.relrowsecurity, c.relname;
