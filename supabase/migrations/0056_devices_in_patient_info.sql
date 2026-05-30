-- ============================================================================
-- 0056 — Move assistive devices into patient clinical background.
--
-- Assistive devices (orthoses, splints, walking aids, wheelchair) are
-- clinical context about the patient — a natural sibling of ambulation
-- status, which already lives in the patient_info background (0047).
-- Previously devices sat in a separate therapist-only "plan" section
-- alongside a free-text exercise plan. That section is being removed:
-- the exercise plan added little, and devices belong with the rest of
-- the clinical background where BOTH clinician and therapist can see
-- and edit them.
--
-- No new column is needed — the value already lives on patient as
-- `physio_assistive_devices` (added in 0046). This migration simply
-- lets set_patient_info read/write it too, so the patient-info screen
-- can own it. The old set_physio_plan RPC and the physio_exercise_plan
-- column are left in place (harmless, unused by the UI) rather than
-- dropped, to avoid disturbing existing data.
--
-- This extends set_patient_info from 9 args (after 0055's sex) to 10.
-- ============================================================================

drop function if exists set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text, patient_sex
);

create or replace function set_patient_info(
  p_patient_id uuid,
  p_date_of_birth date,
  p_etiology etiology,
  p_etiology_detail text,
  p_affected_side injection_side,
  p_onset_year smallint,
  p_ambulation ambulation_status,
  p_background_notes text,
  p_sex patient_sex,
  p_assistive_devices text
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
     set date_of_birth = p_date_of_birth,
         etiology = p_etiology,
         etiology_detail =
           nullif(trim(coalesce(p_etiology_detail, '')), ''),
         affected_side = p_affected_side,
         onset_year = p_onset_year,
         ambulation = p_ambulation,
         background_notes =
           nullif(trim(coalesce(p_background_notes, '')), ''),
         sex = p_sex,
         physio_assistive_devices =
           nullif(trim(coalesce(p_assistive_devices, '')), '')
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'patient_info_updated', 'patient',
    p_patient_id::text
  );
end;
$$;

revoke all on function set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text, patient_sex, text
) from public;
grant execute on function set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text, patient_sex, text
) to authenticated;
