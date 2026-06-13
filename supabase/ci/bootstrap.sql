-- ============================================================================
-- CI bootstrap — recreates the parts of the Supabase environment that the
-- migrations assume to exist, so the full migration set can be applied to a
-- throwaway Postgres in CI and validated for ordering/dependency/syntax errors.
--
-- This is for CI validation ONLY. It is never run against a real database
-- (Supabase already provides all of this). Keep it in sync with the Supabase
-- primitives the migrations rely on: the anon/authenticated/service_role roles,
-- the auth schema + auth.users table (FK target + new-user trigger), and the
-- auth.uid()/jwt()/role() helpers (stubbed — CI validates DDL, not RLS).
-- ============================================================================

-- Extensions the migrations use (they also create these themselves; harmless).
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Roles Supabase provides.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- Minimal auth schema: enough for FK targets and the AFTER INSERT new-user
-- trigger the migrations attach to auth.users.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Stubs: in CI we only validate that DDL applies, not row-level behaviour.
create or replace function auth.uid()  returns uuid     language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt()  returns jsonb    language sql stable as $$ select '{}'::jsonb $$;
create or replace function auth.role() returns text     language sql stable as $$ select null::text $$;

-- Minimal storage schema (Supabase-managed): a goal-video bucket is inserted by
-- a migration, and several RLS policies are created on storage.objects (their
-- expressions reference bucket_id, name and owner, and call storage.foldername).
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false,
  created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb
);
create or replace function storage.foldername(p_name text)
  returns text[] language sql immutable as $$ select string_to_array(p_name, '/') $$;
