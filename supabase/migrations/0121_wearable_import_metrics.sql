-- 0121_wearable_import_metrics.sql
-- ---------------------------------------------------------------------------
-- Per-connection allowlist of which wearable metrics to import.
--
-- The clinician (or the patient) chooses a subset — e.g. steps + HRV + sleep —
-- instead of ingesting everything the device records. The webhook drops any
-- sample whose metric isn't listed, so only selected data reaches `observation`
-- (clinically relevant + GDPR data-minimisation).
--
-- Metric keys are the app's NORMALIZED keys (see lib/wearables/types.ts
-- METRIC_CODES: 'heart_rate', 'steps', 'hrv', ...), not codes, so the list is
-- stable across a later LOINC reassignment. Empty array = import nothing.
-- ---------------------------------------------------------------------------

-- A not-null default backfills any rows created before this column with a
-- conservative starter set; the clinician adjusts from there.
alter table wearable_connection
  add column if not exists metrics text[]
    not null default array['steps', 'heart_rate', 'sleep_duration']::text[];

comment on column wearable_connection.metrics is
  'Allowlist of normalized metric keys (lib/wearables/types.ts) to import for '
  'this connection. The webhook ingests only samples whose metric is listed; '
  'empty array imports nothing.';

-- ---------------------------------------------------------------------------
-- set_wearable_import_metrics(connection_id, metrics)
-- Updates ONLY the allowlist. Authorized for the patient (own connection), a
-- clinician with access, or an admin — never touches status / aggregator id,
-- so it is safe to grant to `authenticated` (unlike the service-role-only
-- write functions in 0120).
-- ---------------------------------------------------------------------------
create or replace function set_wearable_import_metrics(
  p_connection_id uuid,
  p_metrics text[]
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
  v_allowed boolean;
begin
  select patient_id into v_patient
    from wearable_connection
   where id = p_connection_id;
  if v_patient is null then
    raise exception 'connection not found';
  end if;

  -- Each disjunct is coalesced to false so a NULL (e.g. current_app_role() for
  -- a context with no role) can't make the whole condition NULL and silently
  -- skip the guard.
  v_allowed :=
       (current_patient_id() is not null and current_patient_id() = v_patient)
    or coalesce(clinician_can_access_patient(v_patient), false)
    or coalesce(current_app_role(), '') = 'admin';

  if not v_allowed then
    raise exception 'not authorized for this connection';
  end if;

  update wearable_connection
     set metrics = coalesce(p_metrics, array[]::text[])
   where id = p_connection_id;
end;
$$;

revoke all on function set_wearable_import_metrics(uuid, text[]) from public;
grant execute on function set_wearable_import_metrics(uuid, text[]) to authenticated;
