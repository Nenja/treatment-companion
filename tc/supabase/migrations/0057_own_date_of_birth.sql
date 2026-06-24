-- ============================================================================
-- 0057 — Patient sets their own date of birth.
--
-- Date of birth lives on patient (added in 0047, date_of_birth). Until
-- now it could be set only by a clinician/therapist via set_patient_info.
-- The onboarding flow asks the patient for their own birthday (and sex,
-- which already has set_own_sex from 0055), so a patient needs a narrow,
-- self-scoped way to set ONLY their own date of birth — nothing else.
--
-- Mirrors set_own_sex exactly: scoped to current_patient_id(), touches
-- only the caller's own row and only the date_of_birth field, audited.
-- A clinician/therapist can still set/correct it via set_patient_info;
-- both write the same column (single source of truth).
-- ============================================================================

create or replace function set_own_date_of_birth(
  p_date_of_birth date
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient_id uuid;
begin
  v_patient_id := current_patient_id();
  if v_patient_id is null then
    raise exception 'caller is not a patient';
  end if;

  -- A future date of birth is never valid; reject defensively.
  if p_date_of_birth is not null and p_date_of_birth > current_date then
    raise exception 'date of birth cannot be in the future';
  end if;

  update patient
     set date_of_birth = p_date_of_birth
   where id = v_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'patient', 'patient_dob_self_updated', 'patient',
    v_patient_id::text
  );
end;
$$;

revoke all on function set_own_date_of_birth(date) from public;
grant execute on function set_own_date_of_birth(date) to authenticated;
