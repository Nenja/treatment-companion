-- 0091_video_consent.sql
-- ---------------------------------------------------------------------------
-- Patient-level consent for video, recorded by the clinician.
--
-- Two INDEPENDENT flags, because under GDPR clinical recording and secondary
-- research use are distinct permissions:
--   * video_consent_clinical  — permission to record & store videos at all.
--   * video_consent_research  — permission to use videos for research.
-- Each is a simple boolean ("was consent obtained?"), plus an audit stamp of
-- when it was last set and by whom. The binding consent itself lives in the
-- study's own documentation; these columns are the app's attestation/audit.
--
-- Gate: baseline filming requires the clinical flag (enforced in the UI now;
-- archiving will require it too, in the later archive migration). Access mirrors
-- set_patient_medication (0061): clinician role + clinician_can_access_patient.
-- Reads ride on the existing patient RLS (a clinician already reads the patient
-- row for patients they have an active session with), so no read RPC is needed.
-- Additive and idempotent; nothing is dropped.
-- ---------------------------------------------------------------------------

alter table patient
  add column if not exists video_consent_clinical boolean not null default false,
  add column if not exists video_consent_research boolean not null default false,
  add column if not exists video_consent_recorded_at timestamptz,
  add column if not exists video_consent_recorded_by uuid;

comment on column patient.video_consent_clinical is
  'Clinician attestation that the patient consented to recording & storing videos.';
comment on column patient.video_consent_research is
  'Clinician attestation that the patient consented to research use of videos.';

create or replace function set_patient_video_consent(
  p_patient_id uuid,
  p_clinical boolean,
  p_research boolean
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
    raise exception 'only a clinician can record video consent';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update patient
     set video_consent_clinical = coalesce(p_clinical, false),
         video_consent_research = coalesce(p_research, false),
         video_consent_recorded_at = now(),
         video_consent_recorded_by = auth.uid()
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'patient_video_consent_updated', 'patient',
    p_patient_id::text
  );
end;
$$;

revoke all on function set_patient_video_consent(uuid, boolean, boolean) from public;
grant execute on function set_patient_video_consent(uuid, boolean, boolean) to authenticated;
