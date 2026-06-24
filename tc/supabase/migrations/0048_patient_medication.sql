-- ============================================================================
-- 0048 — Patient anti-spastic medication (free-text).
--
-- Adds two free-text fields on the patient — current and previous
-- anti-spastic medication — and extends the set_patient_info RPC to
-- accept and write them. Same authorisation model as 0047: a clinician
-- OR therapist with an active session may CALL the RPC, but only the
-- clinician role is actually expected to write these in practice.
-- Read access piggybacks on the existing patient RLS, which already
-- permits clinician + therapist roles with an active session. Patient
-- access is NOT granted: medication notes are clinician-to-therapist
-- communication, not patient-facing content.
--
-- These are deliberately free-text, not a structured medication table.
-- For a pilot whose job is to learn whether the communication tool
-- helps, free-text lets physicians write exactly what they want —
-- including dose, frequency, start/stop dates, reasons for changes —
-- without locking us into a drug-coding scheme we'd later regret.
-- If real use shows structured records would help, that becomes a
-- post-pilot upgrade with the benefit of having seen what gets
-- written.
--
-- REGULATORY NOTE — please surface to the advisor:
--   Medication information is sensitive clinical data. Storing it
--   pushes the app further toward the "patient record system"
--   category. The fields are optional and free-text, patient never
--   sees them, and they sit alongside the etiology/ambulation
--   background already on the patient row. But in aggregate with the
--   earlier additions (etiology, plan summary, reusable codes), the
--   pilot's data scope has grown meaningfully from the original
--   "communication tool for goals + check-ins" framing. The advisor
--   should see all of these together when making the qualification
--   determination.
-- ============================================================================

alter table patient
  add column if not exists current_antispastic_medication text
    check (current_antispastic_medication is null
      or length(current_antispastic_medication) between 1 and 4000),
  add column if not exists previous_antispastic_medication text
    check (previous_antispastic_medication is null
      or length(previous_antispastic_medication) between 1 and 4000);

-- Replace the existing set_patient_info RPC with a wider signature
-- that includes the two medication fields. Drop the old function
-- explicitly first; postgres distinguishes overloads by signature, and
-- we want the old narrower one removed so callers using the new
-- signature consistently reach this function.
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
         current_antispastic_medication =
           nullif(trim(coalesce(p_current_antispastic_medication, '')), ''),
         previous_antispastic_medication =
           nullif(trim(coalesce(p_previous_antispastic_medication, '')), '')
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
  ambulation_status, text, text, text
) from public;
grant execute on function set_patient_info(
  uuid, date, etiology, text, injection_side, smallint,
  ambulation_status, text, text, text
) to authenticated;
