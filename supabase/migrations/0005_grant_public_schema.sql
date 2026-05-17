-- ============================================================================
-- 0005 — Grant public schema access to auth roles.
--
-- Newer Supabase projects don't give `anon` and `authenticated` access
-- to the public schema by default — every authenticated request was
-- failing with "permission denied for schema public" before RLS could
-- even evaluate.
--
-- These grants are the per-role floor. Row-level security policies
-- (from 0002 / 0004) still enforce which specific rows each user can
-- see; this migration just lets them through the schema door.
--
-- ALTER DEFAULT PRIVILEGES applies the same grants to anything created
-- in the public schema later, so future tables and functions don't
-- need this migration repeated.
-- ============================================================================

-- Let the auth roles "see" the public schema.
grant usage on schema public to anon, authenticated;

-- Reads: both roles can SELECT (RLS gates which rows).
grant select on all tables in schema public to anon, authenticated;

-- Writes: only authenticated (RLS gates which rows).
grant insert, update, delete on all tables in schema public to authenticated;

-- RPC functions: both roles can execute (the function body checks who
-- the caller is and rejects unauthorised calls).
grant execute on all functions in schema public to anon, authenticated;

-- Sequences (used by some default values / auto-increment patterns).
grant usage on all sequences in schema public to authenticated;

-- Same grants for anything created in this schema in the future.
alter default privileges in schema public
  grant select on tables to anon, authenticated;
alter default privileges in schema public
  grant insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant execute on functions to anon, authenticated;
alter default privileges in schema public
  grant usage on sequences to authenticated;
