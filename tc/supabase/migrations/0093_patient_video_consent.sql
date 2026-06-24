-- 0093_patient_video_consent.sql
-- ---------------------------------------------------------------------------
-- Patient self-service video consent.
--
-- Until now the two video-consent flags (0091) could only be set by a clinician
-- attesting on the patient's behalf. This lets the PATIENT record — and
-- withdraw — their own consent in-app, writing the SAME flags so every existing
-- gate (baseline filming, archiving) and the cockpit checkmarks reflect it
-- uniformly. A `video_consent_source` column records who last set it so the
-- clinician view can tell patient self-consent from a clinician attestation.
--
-- set_own_video_consent — patient-only, scoped to current_patient_id() (mirrors
-- set_own_sex, 0055). The 0091 clinician RPC is re-declared here only to also
-- stamp the source as 'clinician'. Additive and idempotent.
-- ---------------------------------------------------------------------------

alter table patient
  add column if not exists video_consent_source text
    check (video_consent_source is null
           or video_consent_source in ('patient', 'clinician'));

comment on column patient.video_consent_source is
  'Who last set the video-consent flags: the patient themselves or a clinician.';

-- Patient sets/withdraws their OWN consent.
create or replace function set_own_video_consent(
  p_clinical boolean,
  p_research boolean
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
     set video_consent_clinical = coalesce(p_clinical, false),
         video_consent_research = coalesce(p_research, false),
         video_consent_recorded_at = now(),
         video_consent_recorded_by = auth.uid(),
         video_consent_source = 'patient'
   where id = v_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'patient', 'patient_video_consent_self_updated', 'patient',
    v_patient_id::text
  );
end;
$$;

revoke all on function set_own_video_consent(boolean, boolean) from public;
grant execute on function set_own_video_consent(boolean, boolean) to authenticated;

-- Re-declare the clinician RPC (0091) to also stamp the source = 'clinician'.
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
         video_consent_recorded_by = auth.uid(),
         video_consent_source = 'clinician'
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'patient_video_consent_updated', 'patient',
    p_patient_id::text
  );
end;
$$;
