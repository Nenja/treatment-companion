-- ============================================================================
-- Treatment Companion — initial schema
--
-- Maps the prototype's TypeScript types into Postgres tables. Designed for
-- Supabase but uses no Supabase-specific features in this file — RLS
-- policies live in a separate migration so they're easy to review.
--
-- Conventions:
--   - Primary keys are UUIDs, generated server-side, so the client never
--     has to invent IDs.
--   - All timestamps are TIMESTAMPTZ. We always store UTC; the client
--     converts on display.
--   - Dates that represent a calendar day (e.g. cycle start date,
--     treatment date) are DATE, not TIMESTAMPTZ.
--   - Enums use PostgreSQL ENUM types. Adding a value to an enum later
--     requires a migration but it's a one-line ALTER.
--   - "Soft" deletes are not modelled here. Goals can be archived via the
--     status column; suggestions can be marked notSuitableThisCycle etc.
--     Hard delete is reserved for GDPR right-to-erasure flows handled
--     elsewhere.
--   - Audit log is append-only; enforced by RLS in the policies migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email

-- ---------------------------------------------------------------------------
-- Enum types
--
-- Mirror the const arrays in lib/types.ts. Keep the values stable —
-- renaming an enum value is a schema migration AND a code change AND a
-- data migration.
-- ---------------------------------------------------------------------------

create type role as enum ('patient', 'clinician', 'admin');

create type goal_domain as enum (
  'pain', 'hygiene', 'dressing', 'walking', 'transfers',
  'handUse', 'sleep', 'positioning', 'caregiverHelp',
  'therapyExercise', 'other'
);

create type importance as enum ('low', 'medium', 'high');

create type hoped_timeframe as enum ('4w', '8w', '12w', 'notSure');

create type suggestion_status as enum (
  'needsReview', 'active', 'discussAtNextVisit',
  'combinedWithAnother', 'notSuitableThisCycle', 'archived'
);

create type approved_goal_status as enum ('active', 'archived', 'combined');

create type spasm_frequency as enum (
  'none', 'occasional', 'daily', 'severalDaily'
);

create type daily_care as enum (
  'harder', 'unchanged', 'easier', 'muchEasier', 'notRelevant'
);

create type side_effect as enum (
  'weakness', 'falls', 'swallowing', 'fluLike', 'other'
);

create type rating_label as enum (
  'muchWorseThanExpected', 'aLittleWorseThanExpected', 'asExpected',
  'betterThanExpected', 'muchBetterThanExpected', 'notSure'
);

create type cycle_status as enum ('active', 'completed');
create type prompt_status as enum ('pending', 'completed');
create type injection_side as enum ('left', 'right', 'bilateral');
create type guidance_method as enum (
  'emg', 'ultrasound', 'usEmg', 'electricalStimulation',
  'anatomicalLandmarks', 'none', 'other'
);

-- ---------------------------------------------------------------------------
-- People
--
-- A `profile` is the auth-linked record for any human using the system.
-- In Supabase, auth.users holds the credentials; profiles holds the
-- application-level identity. One row per auth.users row.
--
-- Splitting `patient` and `clinician` into separate tables (vs a single
-- profile with a role column) lets us put role-specific fields and FKs
-- where they belong and avoids "this clinician shouldn't have a birth
-- year" kinds of awkwardness. Profile is the join point.
-- ---------------------------------------------------------------------------

create table profile (
  id uuid primary key,
  -- References auth.users(id). We don't declare the FK here because the
  -- supabase auth schema is managed separately; the trigger that creates
  -- profile rows after signup enforces the link.
  role role not null,
  display_name text not null,
  preferred_locale text not null default 'en'
    check (preferred_locale in ('en', 'da')),
  email citext unique,
  created_at timestamptz not null default now()
);

comment on table profile is
  'Application-level identity for every human user. One row per auth user.';

create table patient (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profile(id) on delete cascade,
  birth_year int check (birth_year between 1900 and extract(year from now())),
  created_at timestamptz not null default now()
);

create table clinician (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references profile(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- A patient may be cared for by multiple clinicians over time; conversely
-- a clinician sees many patients. We won't model the relationship here
-- explicitly — access is granted per visit via visit codes (below). If a
-- "primary clinician" concept becomes needed, it goes on patient.

-- ---------------------------------------------------------------------------
-- Treatment cycle
-- ---------------------------------------------------------------------------

create table treatment_cycle (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  cycle_number int not null check (cycle_number > 0),
  length_weeks int not null check (length_weeks between 1 and 52),
  start_date date not null,
  review_date date not null,
  status cycle_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (patient_id, cycle_number),
  check (review_date >= start_date)
);

create index treatment_cycle_patient_idx on treatment_cycle(patient_id);
create index treatment_cycle_active_idx
  on treatment_cycle(patient_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Goal suggestion (patient-authored)
-- ---------------------------------------------------------------------------

create table goal_suggestion (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null references treatment_cycle(id) on delete cascade,
  domain goal_domain not null,
  -- For the "other" domain, the patient's own short label for it.
  -- Free text; we don't try to categorise it post-hoc.
  patient_wording text not null check (length(patient_wording) between 1 and 500),
  importance importance not null,
  hoped_timeframe hoped_timeframe not null default 'notSure',
  difficulty_context text check (difficulty_context is null
    or length(difficulty_context) between 1 and 500),
  status suggestion_status not null default 'needsReview',
  created_at timestamptz not null default now()
);

create index goal_suggestion_patient_idx on goal_suggestion(patient_id);
create index goal_suggestion_cycle_idx on goal_suggestion(treatment_cycle_id);
create index goal_suggestion_needs_review_idx
  on goal_suggestion(treatment_cycle_id) where status = 'needsReview';

-- ---------------------------------------------------------------------------
-- Approved goal (clinician-authored, descended from a suggestion)
-- ---------------------------------------------------------------------------

create table approved_goal (
  id uuid primary key default gen_random_uuid(),
  suggestion_id uuid not null unique references goal_suggestion(id) on delete restrict,
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null references treatment_cycle(id) on delete cascade,
  patient_facing_text text not null check (length(patient_facing_text) between 1 and 200),
  smart_text text not null check (length(smart_text) between 1 and 1000),
  -- Five GAS anchors per goal. Stored as separate columns rather than a
  -- JSON blob so they're queryable, validated, and migrate cleanly.
  anchor_minus2 text not null check (length(anchor_minus2) between 1 and 300),
  anchor_minus1 text not null check (length(anchor_minus1) between 1 and 300),
  anchor_zero   text not null check (length(anchor_zero)   between 1 and 300),
  anchor_plus1  text not null check (length(anchor_plus1)  between 1 and 300),
  anchor_plus2  text not null check (length(anchor_plus2)  between 1 and 300),
  approved_by_clinician_id uuid not null references clinician(id) on delete restrict,
  approved_at timestamptz not null default now(),
  status approved_goal_status not null default 'active'
);

create index approved_goal_patient_idx on approved_goal(patient_id);
create index approved_goal_cycle_idx on approved_goal(treatment_cycle_id);
create index approved_goal_active_idx
  on approved_goal(patient_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- Weekly prompt
--
-- The system creates one of these per week per active cycle. The patient
-- responds (creating a weekly_checkin) or skips (the prompt stays
-- pending; we never auto-mark prompts as missed).
-- ---------------------------------------------------------------------------

create table weekly_prompt (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null references treatment_cycle(id) on delete cascade,
  week_number int not null check (week_number > 0),
  due_date date not null,
  status prompt_status not null default 'pending',
  created_at timestamptz not null default now(),
  unique (treatment_cycle_id, week_number)
);

create index weekly_prompt_pending_idx
  on weekly_prompt(treatment_cycle_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Weekly check-in
--
-- One per completed prompt. The lean prototype removed pain/stiffness/
-- spasm/daily-care/side-effects from the patient-facing form, but the
-- columns are kept (nullable) so historical data from earlier
-- prototypes survives and so clinicians can backfill if needed.
-- ---------------------------------------------------------------------------

create table weekly_checkin (
  id uuid primary key default gen_random_uuid(),
  weekly_prompt_id uuid not null unique references weekly_prompt(id) on delete cascade,
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null references treatment_cycle(id) on delete cascade,
  week_number int not null,
  submitted_at timestamptz not null default now(),
  pain int check (pain is null or pain between 0 and 10),
  stiffness int check (stiffness is null or stiffness between 0 and 10),
  spasm_frequency spasm_frequency,
  daily_care daily_care,
  side_effects side_effect[] not null default '{}',
  other_side_effect_text text,
  comment text check (comment is null or length(comment) between 1 and 1000)
);

create index weekly_checkin_cycle_idx on weekly_checkin(treatment_cycle_id);
create index weekly_checkin_patient_idx on weekly_checkin(patient_id);

create table weekly_goal_rating (
  id uuid primary key default gen_random_uuid(),
  weekly_checkin_id uuid not null references weekly_checkin(id) on delete cascade,
  approved_goal_id uuid not null references approved_goal(id) on delete cascade,
  rating_label rating_label not null,
  -- Nullable because rating_label can be 'notSure'. NOT a 0 for that case.
  rating_value int check (rating_value is null or rating_value between -2 and 2),
  unique (weekly_checkin_id, approved_goal_id)
);

create index weekly_goal_rating_goal_idx on weekly_goal_rating(approved_goal_id);

-- ---------------------------------------------------------------------------
-- Treatment session + injections
-- ---------------------------------------------------------------------------

create table treatment_session (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  treatment_cycle_id uuid not null unique references treatment_cycle(id) on delete cascade,
  -- One session per cycle (the UNIQUE above enforces it). If we ever
  -- need multiple injection visits per cycle, drop the constraint and
  -- add a session_number.
  date date not null,
  drug_product text not null check (length(drug_product) between 1 and 60),
  total_units numeric(8,2) not null check (total_units >= 0),
  dilution text check (dilution is null or length(dilution) between 1 and 40),
  notes text check (notes is null or length(notes) between 1 and 1000),
  recorded_by_clinician_id uuid not null references clinician(id) on delete restrict,
  recorded_at timestamptz not null default now()
);

create index treatment_session_patient_idx on treatment_session(patient_id);

create table muscle_injection (
  id uuid primary key default gen_random_uuid(),
  treatment_session_id uuid not null references treatment_session(id) on delete cascade,
  muscle text not null check (length(muscle) between 1 and 80),
  side injection_side not null,
  dose_units numeric(8,2) not null check (dose_units >= 0),
  guidance guidance_method not null,
  -- Display order within the session.
  position int not null default 0
);

create index muscle_injection_session_idx
  on muscle_injection(treatment_session_id, position);

-- ---------------------------------------------------------------------------
-- Visit codes
--
-- Patient-generated short-lived codes that grant a clinician access to
-- the patient for a session. Stored uppercase, alphanumeric, no
-- ambiguous chars (the application layer enforces alphabet).
-- ---------------------------------------------------------------------------

create table visit_code (
  code text primary key check (length(code) = 6 and code = upper(code)),
  patient_id uuid not null references patient(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_clinician_id uuid references clinician(id) on delete set null,
  created_at timestamptz not null default now()
);

create index visit_code_patient_active_idx
  on visit_code(patient_id) where consumed_at is null;
create index visit_code_active_idx
  on visit_code(expires_at) where consumed_at is null;

-- ---------------------------------------------------------------------------
-- Clinician session
--
-- An unlocked patient session. One active row per clinician at a time
-- (enforced by partial unique index).
-- ---------------------------------------------------------------------------

create table clinician_session (
  id uuid primary key default gen_random_uuid(),
  clinician_id uuid not null references clinician(id) on delete cascade,
  patient_id uuid not null references patient(id) on delete cascade,
  visit_code text not null references visit_code(code) on delete restrict,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text check (end_reason is null
    or end_reason in ('manual', 'timeout', 'expired_by_new_session'))
);

create unique index clinician_session_one_active_idx
  on clinician_session(clinician_id) where ended_at is null;
create index clinician_session_patient_idx
  on clinician_session(patient_id, started_at desc);

-- ---------------------------------------------------------------------------
-- Audit log
--
-- Append-only. Every write to any other table inserts a row here. RLS
-- policies (separate migration) prevent UPDATE and DELETE for everyone
-- including service roles in normal operation.
-- ---------------------------------------------------------------------------

create table audit_event (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references profile(id) on delete set null,
  actor_role role not null,
  action text not null,
  entity text not null,
  entity_id text not null,
  -- Optional JSON payload — what changed, request IP, etc. Keep small.
  metadata jsonb,
  occurred_at timestamptz not null default now()
);

create index audit_event_actor_idx on audit_event(actor_profile_id, occurred_at desc);
create index audit_event_entity_idx on audit_event(entity, entity_id);

comment on table audit_event is
  'Append-only audit log. Must not be modified after insert.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Updated-at convention isn't strictly needed — the application records
-- explicit timestamps where it matters (approved_at, submitted_at, etc.).
-- We don't add `updated_at` to every table; instead, edits create new
-- audit_event rows that record what changed.

-- Prevent UPDATE and DELETE on audit_event at the trigger level, in
-- addition to RLS. Belt and braces — RLS depends on roles being set up
-- correctly; this trigger fires no matter who's running the query.
create function audit_event_immutable() returns trigger as $$
begin
  raise exception 'audit_event is append-only (operation: %)', tg_op;
end;
$$ language plpgsql;

create trigger audit_event_no_update
  before update on audit_event
  for each row execute function audit_event_immutable();

create trigger audit_event_no_delete
  before delete on audit_event
  for each row execute function audit_event_immutable();
