-- ============================================================================
-- 0016 — Grant the service_role full access to the public schema.
--
-- The admin API routes (app/api/admin/*) use the service role key to
-- bypass RLS for cross-tenant operations (create-account, list-accounts).
-- The service role bypasses RLS but still needs explicit schema and
-- table grants since newer Supabase projects ship without default
-- grants on the public schema.
--
-- This mirrors what 0005_grant_public_schema.sql did for the anon and
-- authenticated roles.
-- ============================================================================

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant all on functions to service_role;
