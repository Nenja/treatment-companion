-- 0122_harden_import_observations_auth.sql
-- ---------------------------------------------------------------------------
-- Forward hardening of import_observations() (originally 0069).
--
-- The original authorization guard was:
--   if not ( (patient owns) or clinician_can_access(..) or role = 'admin' )
-- When current_app_role() is NULL, `false or false or NULL` evaluates to NULL,
-- and `if not NULL then raise` does NOT fire — so an unauthorized caller could
-- slip through. In practice a real authenticated user always has a non-null
-- role, so this was not exploitable, but the guard should be correct on its
-- own terms. This re-creates the function with each disjunct coalesced to
-- false (same fix applied to set_wearable_import_metrics in 0121). Body is
-- otherwise identical to 0069.
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
    or coalesce(clinician_can_access_patient(p_patient_id), false)
    or coalesce(current_app_role(), '') = 'admin'
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
