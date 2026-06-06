-- 0077_wearable_enabled.sql
-- ---------------------------------------------------------------------------
-- Per-patient "wearable enabled" flag. Wearable tracking is currently a
-- manual-input, low-use feature, so its module on the clinician patient page
-- is hidden by default and shown only when a clinician turns it on for the
-- patient (on the patient-info page) OR when that patient actually has
-- wearable observations. That "or has data" rule means once automated pairing
-- exists, the module surfaces on its own with no further change.
-- ---------------------------------------------------------------------------

alter table patient
  add column if not exists wearable_enabled boolean not null default false;

comment on column patient.wearable_enabled is
  'Clinician-set flag to surface the wearable module for this patient while '
  'wearables are a manual, opt-in feature. The module also shows whenever the '
  'patient has observations, regardless of this flag.';

-- Dedicated setter (kept separate from set_patient_info so that big RPC''s
-- signature is untouched). Same authorization: a clinician/therapist with an
-- active session for the patient.
create or replace function set_patient_wearable_enabled(
  p_patient_id uuid,
  p_enabled boolean
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role role;
begin
  v_role := current_app_role();
  if v_role not in ('clinician', 'physiotherapist') then
    raise exception 'only a clinician or therapist can edit patient info';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update patient
     set wearable_enabled = coalesce(p_enabled, false)
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'patient_info_updated', 'patient',
    p_patient_id::text
  );
end;
$$;

revoke all on function set_patient_wearable_enabled(uuid, boolean) from public;
grant execute on function set_patient_wearable_enabled(uuid, boolean) to authenticated;
