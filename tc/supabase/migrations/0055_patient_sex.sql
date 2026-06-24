-- ============================================================================
-- 0055 — Patient sex (demographic).
--
-- Adds a single `sex` value about the patient, for research demographics.
-- It is ONE column on patient, editable from two places:
--   - the clinician/therapist patient-info screen (via set_patient_info,
--     extended here), alongside the other clinical background; and
--   - the patient's own profile screen (via a new patient-scoped RPC
--     set_own_sex, which lets a patient set ONLY their own sex and
--     nothing else).
-- Both write the same column, so there is a single source of truth and
-- no risk of two diverging values.
--
-- Option set is deliberately simple: female / male / other /
-- preferNotToSay. Optional like the rest of the background — the app
-- must render fine when it is null.
--
-- REGULATORY NOTE — please surface to the regulatory advisor:
--   This adds another structured personal/clinical attribute about the
--   patient (sex), in the same category as the 0047 clinical
--   background. Minimal and optional, but the kind of data is part of
--   the data-protection / qualification review.
-- ============================================================================

create type patient_sex as enum (
  'female',
  'male',
  'other',
  'preferNotToSay'
);

alter table patient
  add column if not exists sex patient_sex;

comment on column patient.sex is
  'Patient sex (demographic). Optional. Editable by clinician/therapist '
  'via set_patient_info and by the patient via set_own_sex.';

-- ---------------------------------------------------------------------------
-- Extend set_patient_info to include sex. Same signature shape as 0047
-- with sex appended; clinician/therapist only; all fields optional.
-- (Postgres allows replacing a function with extra params only via a
-- new signature — this is a distinct overload. The old 8-arg version
-- is dropped so callers move to the new one cleanly.)
-- ---------------------------------------------------------------------------
drop function if exists set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text
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
  p_sex patient_sex
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
         sex = p_sex
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
  ambulation_status, text, patient_sex
) from public;
grant execute on function set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text, patient_sex
) to authenticated;

-- ---------------------------------------------------------------------------
-- set_own_sex — a patient sets ONLY their own sex. Scoped to the
-- caller's own patient row via current_patient_id(); cannot touch any
-- other patient or any other field.
-- ---------------------------------------------------------------------------
create or replace function set_own_sex(
  p_sex patient_sex
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

  update patient
     set sex = p_sex
   where id = v_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'patient', 'patient_sex_self_updated', 'patient',
    v_patient_id::text
  );
end;
$$;

revoke all on function set_own_sex(patient_sex) from public;
grant execute on function set_own_sex(patient_sex) to authenticated;
