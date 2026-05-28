-- ============================================================================
-- 0047 — Patient clinical background.
--
-- Adds structured clinical context that helps a clinician (and the
-- therapist) understand the patient at a glance:
--   date_of_birth, etiology + free-text qualifier, affected side,
--   onset year, ambulation status, free-text background notes.
--
-- All fields are OPTIONAL. The app must render gracefully when they
-- are missing — this is a pilot, partially-onboarded patients should
-- still be fully usable. Editable any time by the clinician OR the
-- therapist. Visible to both. Not visible to the patient
-- themselves (this is clinical context recorded ABOUT them).
--
-- REGULATORY NOTE — please surface to the regulatory advisor:
--   This is a NEW category of data: structured *clinical attributes*
--   about the patient's underlying condition (etiology, ambulation,
--   onset). So far the app recorded what the clinician does
--   (treatments, goals) and what the patient reports (check-ins);
--   it did not characterise the patient's condition. Storing
--   structured clinical attributes nudges the app toward the
--   "patient records system" category, which can affect the
--   qualification determination. The fields are minimal and all
--   optional, but the *kind* of data is a scope change.
-- ============================================================================

create type etiology as enum (
  'stroke',
  'tbi',
  'cerebralPalsy',
  'multipleSclerosis',
  'spinalCordInjury',
  'hereditarySpasticParaplegia',
  'other'
);

create type ambulation_status as enum (
  'independent',
  'withAid',
  'wheelchair',
  'nonAmbulant'
);

alter table patient
  add column if not exists date_of_birth date,
  add column if not exists etiology etiology,
  add column if not exists etiology_detail text
    check (etiology_detail is null
      or length(etiology_detail) between 1 and 500),
  add column if not exists affected_side injection_side,
  add column if not exists onset_year smallint
    check (onset_year is null
      or (onset_year between 1900 and extract(year from now())::smallint)),
  add column if not exists ambulation ambulation_status,
  add column if not exists background_notes text
    check (background_notes is null
      or length(background_notes) between 1 and 4000);

-- RPC: clinician OR therapist sets/updates the patient's background.
-- All fields optional — pass NULL to clear. Mirrors set_physio_plan
-- (0046) and set_muscle_sharing (0036) in shape: role check, session
-- check, update, audit.
create or replace function set_patient_info(
  p_patient_id uuid,
  p_date_of_birth date,
  p_etiology etiology,
  p_etiology_detail text,
  p_affected_side injection_side,
  p_onset_year smallint,
  p_ambulation ambulation_status,
  p_background_notes text
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
           nullif(trim(coalesce(p_background_notes, '')), '')
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
  ambulation_status, text
) from public;
grant execute on function set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text
) to authenticated;
