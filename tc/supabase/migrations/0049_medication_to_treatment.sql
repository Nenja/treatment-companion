-- ============================================================================
-- 0049 — Narrow medication writes to a dedicated clinician-only RPC.
--
-- 0048 added two medication columns and a wide set_patient_info RPC
-- accepting them. After UX review, medication is recognised as
-- *current treatment information* rather than patient background — it
-- belongs on the treatment record page, not on the patient-info page
-- alongside etiology/ambulation. The columns stay where they are (no
-- data migration needed) but writes move from the wide patient-info
-- RPC to a narrow clinician-only RPC, and reads move from the
-- patient-info query to the treatment-page query.
--
-- This migration:
--   1. Drops the 10-arg set_patient_info from 0048.
--   2. Restores the 8-arg set_patient_info (no medication args) so the
--      patient-info form is back to writing only the background data
--      it actually edits.
--   3. Adds set_patient_medication(patient, current, previous),
--      restricted to the clinician role + active session.
-- ============================================================================

-- Step 1: drop the wide 10-arg set_patient_info from 0048.
drop function if exists set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text, text, text
);

-- Step 2: restore the 8-arg set_patient_info from 0047 (no medication).
-- The columns themselves stay on patient — only the RPC's signature
-- is rolled back to the narrower form.
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

-- Step 3: dedicated narrow RPC for medication, clinician-only.
-- Audit event is distinct ('patient_medication_updated') so we can
-- distinguish medication edits from other patient-row edits later.
create or replace function set_patient_medication(
  p_patient_id uuid,
  p_current_antispastic_medication text,
  p_previous_antispastic_medication text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role role;
begin
  v_role := current_app_role();
  if v_role <> 'clinician' then
    raise exception 'only a clinician can edit medication';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update patient
     set current_antispastic_medication =
           nullif(trim(coalesce(p_current_antispastic_medication, '')), ''),
         previous_antispastic_medication =
           nullif(trim(coalesce(p_previous_antispastic_medication, '')), '')
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'patient_medication_updated', 'patient',
    p_patient_id::text
  );
end;
$$;

revoke all on function set_patient_medication(uuid, text, text) from public;
grant execute on function set_patient_medication(uuid, text, text)
  to authenticated;
