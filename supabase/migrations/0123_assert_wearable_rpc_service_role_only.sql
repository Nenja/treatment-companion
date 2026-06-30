-- 0123_assert_wearable_rpc_service_role_only.sql
--
-- Forward fix for a grant gap found in production verification.
--
-- The two wearable webhook RPCs added in 0120 are SECURITY DEFINER write paths
-- meant to be callable ONLY by the service_role (the server-to-server webhook
-- connection), never by anon or authenticated end users. In production they were
-- found still carrying Postgres's default EXECUTE-to-PUBLIC grant, i.e. callable
-- by anon/authenticated. 0120 is immutable (already applied), so this migration
-- re-asserts the intended grants forward.
--
-- Exposure was theoretical at the time of the fix: wearables are feature-flagged
-- off and both functions resolve a patient only from a 'connected'
-- wearable_connection row, of which production had none. Locked down regardless.
--
-- Idempotent: revoking a grant that isn't present is a no-op, and re-granting an
-- existing grant is a no-op. Uses oid::regprocedure so it matches the exact
-- signatures without hardcoding argument types.

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as fn
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
    where p.proname in (
      'ingest_wearable_observations',
      'set_wearable_connection_status'
    )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.fn);
    execute format('grant execute on function %s to service_role', r.fn);
  end loop;
end $$;

-- Verification (each row should be: service_role t, authenticated f, anon f):
--   select p.proname,
--          has_function_privilege('service_role',  p.oid, 'EXECUTE'),
--          has_function_privilege('authenticated', p.oid, 'EXECUTE'),
--          has_function_privilege('anon',          p.oid, 'EXECUTE')
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
--   where p.proname in ('ingest_wearable_observations','set_wearable_connection_status');
