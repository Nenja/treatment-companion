-- 0069_wearable_observations.sql
-- ---------------------------------------------------------------------------
-- Vendor-neutral ingestion layer for third-party / wearable patient data
-- (patient-generated health data, PGHD).
--
-- Design goals:
--   * Source-agnostic. One normalized table holds every measurement from
--     any source — manual entry, CSV import, Apple Health, Android Health
--     Connect, Garmin, Fitbit, Oura, etc. Adding a source later means a new
--     ADAPTER that calls the same import path; the schema does not change.
--   * Metric-agnostic. No per-metric columns. A measurement is a coded
--     `code` (LOINC by default) + a value (`value_numeric` + `unit`, or
--     `value_text`) + an `effective_time`. New metrics need no migration.
--   * FHIR-aligned. Columns map 1:1 onto the FHIR `Observation` resource
--     (code/valueQuantity/effectiveDateTime/device), so exporting to an
--     EHR or research platform later is a serialization, not a redesign.
--   * Provenance kept. The original payload is stored in `raw` (jsonb).
--
-- Writes go ONLY through import_observations() (security definer), which
-- enforces access + dedup centrally — same shape as the other privileged
-- RPCs in this app. RLS on the table governs reads.
--
-- No clinical decisions are wired to this data; it is a storage + import
-- foundation only. (See HANDOVER §8 for the deferred adapter/UX work and
-- the GDPR / EHDS / MDR flags.)
-- ---------------------------------------------------------------------------

-- Source of a measurement. 'manual' and 'csv' need no third-party approval
-- and are the first paths; the rest are placeholders for future adapters.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'observation_source') then
    create type observation_source as enum (
      'manual',
      'csv',
      'apple_health',
      'health_connect',
      'garmin',
      'fitbit',
      'oura',
      'withings',
      'other'
    );
  end if;
end$$;

create table if not exists observation (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  -- Optional convenience link to the treatment cycle this falls in. Left
  -- null by the scaffold importer; can be backfilled from effective_time.
  treatment_cycle_id uuid references treatment_cycle(id) on delete set null,

  source observation_source not null,

  -- What was measured. LOINC code by default (e.g. 8867-4 heart rate,
  -- 55423-8 steps), but any coding system is allowed via code_system so
  -- undecided / vendor-specific metrics still fit.
  code text not null,
  code_system text not null default 'http://loinc.org',
  display text, -- human-readable label, e.g. "Heart rate"

  -- The value. Numeric measurements use value_numeric + unit (UCUM, e.g.
  -- 'beats/min', 'steps', 'min'); categorical/textual ones use value_text.
  value_numeric numeric,
  unit text,
  value_text text,

  -- When the measurement applies. effective_end is set for intervals
  -- (e.g. a sleep session); null for point-in-time samples.
  effective_time timestamptz not null,
  effective_end timestamptz,

  device_label text, -- free-text device name, e.g. "Garmin Vivoactive 4"

  -- The source's own id for this datapoint, used for idempotent re-import.
  -- '' means "the source gave us no id" (kept non-null so it participates
  -- in the dedup key — NULLs would defeat uniqueness).
  external_id text not null default '',

  raw jsonb, -- original payload, for audit / provenance
  imported_by_clinician_id uuid references clinician(id) on delete set null,
  created_at timestamptz not null default now(),

  -- Must carry a value of one kind or the other.
  check (value_numeric is not null or value_text is not null),
  check (effective_end is null or effective_end >= effective_time),
  -- Idempotency: re-importing the same datapoint is a no-op.
  unique (patient_id, source, code, effective_time, external_id)
);

create index if not exists observation_patient_time_idx
  on observation (patient_id, effective_time desc);
create index if not exists observation_patient_code_time_idx
  on observation (patient_id, code, effective_time desc);

comment on table observation is
  'Vendor-neutral, FHIR-Observation-aligned store for third-party / wearable '
  'patient-generated health data. Written only via import_observations().';

-- ---------------------------------------------------------------------------
-- RLS — reads only; writes are via the RPC below.
-- ---------------------------------------------------------------------------
alter table observation enable row level security;

drop policy if exists observation_patient_read on observation;
create policy observation_patient_read on observation
  for select using (patient_id = current_patient_id());

drop policy if exists observation_clinician_read on observation;
create policy observation_clinician_read on observation
  for select using (clinician_can_access_patient(patient_id));

drop policy if exists observation_admin_all on observation;
create policy observation_admin_all on observation
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- import_observations(patient, jsonb array) -> number of rows inserted
--
-- Authorized for: the patient themselves (self-import from a future app),
-- a clinician/physio with an active session for that patient, or an admin.
-- Dedups on the unique key, so it is safe to re-run with overlapping data.
--
-- Each element of p_observations is an object:
--   { "source": "...", "code": "...", "code_system"?: "...", "display"?: "...",
--     "value_numeric"?: number, "unit"?: "...", "value_text"?: "...",
--     "effective_time": "ISO-8601", "effective_end"?: "ISO-8601",
--     "device_label"?: "...", "external_id"?: "...", "raw"?: {...} }
-- ---------------------------------------------------------------------------
create or replace function import_observations(
  p_patient_id uuid,
  p_observations jsonb
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician uuid := current_clinician_id();
  v_inserted integer;
begin
  if p_patient_id is null then
    raise exception 'patient id required';
  end if;
  if jsonb_typeof(p_observations) is distinct from 'array' then
    raise exception 'observations must be a JSON array';
  end if;

  if not (
       (current_patient_id() is not null and current_patient_id() = p_patient_id)
    or clinician_can_access_patient(p_patient_id)
    or current_app_role() = 'admin'
  ) then
    raise exception 'not authorized for this patient';
  end if;

  with rows as (
    insert into observation (
      patient_id, source, code, code_system, display,
      value_numeric, unit, value_text,
      effective_time, effective_end, device_label, external_id, raw,
      imported_by_clinician_id
    )
    select
      p_patient_id,
      (e->>'source')::observation_source,
      e->>'code',
      coalesce(nullif(e->>'code_system', ''), 'http://loinc.org'),
      e->>'display',
      case when nullif(e->>'value_numeric', '') is not null
           then (e->>'value_numeric')::numeric end,
      e->>'unit',
      e->>'value_text',
      (e->>'effective_time')::timestamptz,
      case when nullif(e->>'effective_end', '') is not null
           then (e->>'effective_end')::timestamptz end,
      e->>'device_label',
      coalesce(e->>'external_id', ''),
      case when jsonb_typeof(e->'raw') is not null then e->'raw' end,
      v_clinician
    from jsonb_array_elements(p_observations) as e
    on conflict (patient_id, source, code, effective_time, external_id)
      do nothing
    returning 1
  )
  select count(*) into v_inserted from rows;

  return v_inserted;
end;
$$;

revoke all on function import_observations(uuid, jsonb) from public;
grant execute on function import_observations(uuid, jsonb) to authenticated;
