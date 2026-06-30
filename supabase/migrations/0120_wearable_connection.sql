-- 0120_wearable_connection.sql
-- ---------------------------------------------------------------------------
-- Wearable / PGHD aggregator connection model + server-side ingestion path.
--
-- Pairs with 0069 (the vendor-neutral `observation` store). A patient links a
-- provider (e.g. Garmin) through an EU data aggregator. The aggregator pushes
-- the patient's data to our webhook, which resolves the patient via this table
-- and writes normalized rows into `observation` using the same idempotent
-- on-conflict-do-nothing as import_observations().
--
-- Why a separate write path: import_observations() (0069) authorizes against a
-- USER session (patient / clinician / admin). A webhook is a server-to-server
-- call with no user session, so it can't use that RPC. The two functions below
-- are SECURITY DEFINER and granted to service_role ONLY; they authorize by the
-- connection mapping, not a session. The route handler verifies the
-- aggregator's HMAC signature before calling them.
--
-- DESCRIPTIVE ONLY: no thresholds, alerts, or clinical decisions are wired to
-- this data. It is storage + ingestion, consistent with 0069 and the app's
-- intended purpose (see HANDOVER on the GDPR / MDR posture).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'wearable_connection_status') then
    create type wearable_connection_status as enum (
      'pending',    -- patient consented + connect session created, not yet linked
      'connected',  -- aggregator confirmed the link; data may flow
      'revoked',    -- patient (or aggregator) disconnected
      'error'       -- aggregator reported a problem with the link
    );
  end if;
end$$;

create table if not exists wearable_connection (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  -- Which aggregator brokered the link (e.g. 'thryve') and which provider the
  -- patient connected (e.g. 'garmin'). Free text so new vendors need no
  -- migration; the ingestion function maps `provider` onto observation_source.
  aggregator text not null,
  provider text not null,
  -- The aggregator's own id for this end-user, learned when the link is
  -- confirmed; used to map inbound data webhooks back to the patient. Null
  -- until 'connected'.
  aggregator_user_id text,
  status wearable_connection_status not null default 'pending',
  consented_at timestamptz,   -- when the patient initiated the link (= consent)
  connected_at timestamptz,
  revoked_at timestamptz,
  last_sync_at timestamptz,   -- last time data arrived for this connection
  created_at timestamptz not null default now(),
  -- One connection per provider per patient; re-connecting reuses the row.
  unique (patient_id, provider)
);

create index if not exists wearable_connection_lookup_idx
  on wearable_connection (aggregator, aggregator_user_id);
create index if not exists wearable_connection_patient_idx
  on wearable_connection (patient_id);

comment on table wearable_connection is
  'Patient<->wearable-aggregator link. Data lands in observation (0069); this '
  'table maps the aggregator end-user id to our patient and records '
  'consent/status. Descriptive only — no clinical logic.';

-- ---------------------------------------------------------------------------
-- RLS. The patient owns their connection (consistent with "the patient can
-- see everything about themselves"); clinicians with access read status;
-- admins all. The connect flow writes as the patient; webhook writes run with
-- the service role via the SECURITY DEFINER functions below (bypass RLS).
-- ---------------------------------------------------------------------------
alter table wearable_connection enable row level security;

drop policy if exists wearable_connection_patient_read on wearable_connection;
create policy wearable_connection_patient_read on wearable_connection
  for select using (patient_id = current_patient_id());

drop policy if exists wearable_connection_patient_insert on wearable_connection;
create policy wearable_connection_patient_insert on wearable_connection
  for insert with check (patient_id = current_patient_id());

drop policy if exists wearable_connection_patient_update on wearable_connection;
create policy wearable_connection_patient_update on wearable_connection
  for update using (patient_id = current_patient_id())
  with check (patient_id = current_patient_id());

drop policy if exists wearable_connection_clinician_read on wearable_connection;
create policy wearable_connection_clinician_read on wearable_connection
  for select using (clinician_can_access_patient(patient_id));

drop policy if exists wearable_connection_admin_all on wearable_connection;
create policy wearable_connection_admin_all on wearable_connection
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- set_wearable_connection_status(connection_id, aggregator_user_id, status)
-- Auth/deauth webhook path (service role only). Stores the linked aggregator
-- end-user id and flips status, stamping the matching timestamp. Matched by
-- our connection id (the "reference" we hand the aggregator at connect time).
-- ---------------------------------------------------------------------------
create or replace function set_wearable_connection_status(
  p_connection_id uuid,
  p_aggregator_user_id text,
  p_status wearable_connection_status
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  update wearable_connection
     set aggregator_user_id =
           coalesce(nullif(p_aggregator_user_id, ''), aggregator_user_id),
         status = p_status,
         connected_at =
           case when p_status = 'connected' then now() else connected_at end,
         revoked_at =
           case when p_status = 'revoked' then now() else revoked_at end
   where id = p_connection_id;
end;
$$;

revoke all on function set_wearable_connection_status(uuid, text, wearable_connection_status) from public;
grant execute on function set_wearable_connection_status(uuid, text, wearable_connection_status) to service_role;

-- ---------------------------------------------------------------------------
-- ingest_wearable_observations(aggregator, aggregator_user_id, observations)
-- Data-webhook write path (service role only). Resolves the patient from a
-- 'connected' wearable_connection, inserts the normalized observations with
-- the same idempotent on-conflict-do-nothing as import_observations() (0069),
-- and updates last_sync_at. Returns rows inserted. Unknown / non-connected
-- end-user ids are ignored (returns 0), so stray or replayed webhooks are
-- harmless.
--
-- `source` is forced server-side from the connection's provider (mapped onto
-- observation_source, falling back to 'other'), so a payload can never write
-- under a source the patient didn't connect. Element shape otherwise matches
-- import_observations().
-- ---------------------------------------------------------------------------
create or replace function ingest_wearable_observations(
  p_aggregator text,
  p_aggregator_user_id text,
  p_observations jsonb
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_connection uuid;
  v_patient uuid;
  v_provider text;
  v_source observation_source;
  v_inserted integer;
begin
  if jsonb_typeof(p_observations) is distinct from 'array' then
    raise exception 'observations must be a JSON array';
  end if;
  if nullif(p_aggregator_user_id, '') is null then
    return 0;
  end if;

  select id, patient_id, provider
    into v_connection, v_patient, v_provider
    from wearable_connection
   where aggregator = p_aggregator
     and aggregator_user_id = p_aggregator_user_id
     and status = 'connected'
   limit 1;

  if v_patient is null then
    return 0; -- no live connection for this end-user; ignore
  end if;

  -- Map the provider onto the source enum; anything unrecognised is 'other'.
  begin
    v_source := lower(v_provider)::observation_source;
  exception
    when others then
      v_source := 'other';
  end;

  with rows as (
    insert into observation (
      patient_id, source, code, code_system, display,
      value_numeric, unit, value_text,
      effective_time, effective_end, device_label, external_id, raw
    )
    select
      v_patient,
      v_source,
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
      case when jsonb_typeof(e->'raw') is not null then e->'raw' end
    from jsonb_array_elements(p_observations) as e
    where e->>'code' is not null
      and nullif(e->>'effective_time', '') is not null
    on conflict (patient_id, source, code, effective_time, external_id)
      do nothing
    returning 1
  )
  select count(*) into v_inserted from rows;

  update wearable_connection set last_sync_at = now() where id = v_connection;

  return v_inserted;
end;
$$;

revoke all on function ingest_wearable_observations(text, text, jsonb) from public;
grant execute on function ingest_wearable_observations(text, text, jsonb) to service_role;
