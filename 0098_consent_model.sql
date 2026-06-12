-- ============================================================================
-- 0098 — Consent model: general research consent + video-consent rename.
--
-- Three distinct consents now exist, with three distinct meanings:
--   1. research_consent              — general consent to use the patient's data
--                                      for research. GATES the REDCap export.
--   2. video_consent_clinical        — consent to record & store videos (unchanged).
--   3. video_consent_educational     — consent to use videos for educational
--                                      purposes. THIS IS THE RENAME of the old
--                                      video_consent_research, so "research" now
--                                      means exactly one thing (the general flag)
--                                      and the export can never gate on a video
--                                      column by mistake.
--
-- Research-consent lifecycle (per the agreed withdrawal workflow):
--   consented      -> research_consent = true,  recorded_at set
--   withdrawn      -> research_consent = false, withdrawn_at set (export STOPS
--                     immediately on the next run; record persists)
--   purged         -> purged_at set (an ADMIN confirms deletion; the export's
--                     REDCap delete is authorised by this stamp)
-- The export filter is: research_consent = true. The admin purge queue is:
--   withdrawn_at is not null and purged_at is null.
--
-- All additive/idempotent. The two RENAMEs only fire if the old name still
-- exists, so re-running is safe. RPCs that referenced the old column are
-- recreated against the new name (a column rename would otherwise break them).
-- DEPLOY: run this together with the matching app build (old app + new DB,
-- or vice-versa, mismatches on the renamed column until both are in place).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: rename video_consent_research -> video_consent_educational.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name='patient' and column_name='video_consent_research') then
    alter table patient rename column video_consent_research to video_consent_educational;
  end if;
  if exists (select 1 from information_schema.columns
             where table_name='archived_goal_video' and column_name='consent_research') then
    alter table archived_goal_video rename column consent_research to consent_educational;
  end if;
end $$;

comment on column patient.video_consent_educational is
  'Clinician/patient attestation of consent to use videos for EDUCATIONAL purposes '
  '(renamed from video_consent_research in 0098).';

-- ---------------------------------------------------------------------------
-- Step 2: general research-consent columns + lifecycle.
-- ---------------------------------------------------------------------------
alter table patient
  add column if not exists research_consent boolean not null default false,
  add column if not exists research_consent_recorded_at timestamptz,
  add column if not exists research_consent_recorded_by uuid,
  add column if not exists research_consent_source text
    check (research_consent_source is null
           or research_consent_source in ('patient','clinician')),
  add column if not exists research_consent_withdrawn_at timestamptz,
  add column if not exists research_consent_purged_at timestamptz;

comment on column patient.research_consent is
  'Consent to use this patient''s data for research. GATES the REDCap export: '
  'data is pushed only while this is true.';
comment on column patient.research_consent_withdrawn_at is
  'When consent was withdrawn. Export stops immediately; record persists until '
  'an admin confirms purge (research_consent_purged_at).';
comment on column patient.research_consent_purged_at is
  'When an admin confirmed deletion of the patient''s already-exported REDCap '
  'records following withdrawal.';

-- ---------------------------------------------------------------------------
-- Step 3: recreate the video-consent RPCs against the renamed column,
-- with the param renamed p_research -> p_educational. Drop first because a
-- parameter NAME change is not allowed by CREATE OR REPLACE alone.
-- ---------------------------------------------------------------------------
drop function if exists set_patient_video_consent(uuid, boolean, boolean);
create function set_patient_video_consent(
  p_patient_id uuid,
  p_clinical boolean,
  p_educational boolean
) returns void
  language plpgsql security definer set search_path = public
as $$
declare v_role role;
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
         video_consent_educational = coalesce(p_educational, false),
         video_consent_recorded_at = now(),
         video_consent_recorded_by = auth.uid(),
         video_consent_source = 'clinician'
   where id = p_patient_id;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), v_role, 'patient_video_consent_updated', 'patient', p_patient_id::text);
end; $$;
revoke all on function set_patient_video_consent(uuid, boolean, boolean) from public;
grant execute on function set_patient_video_consent(uuid, boolean, boolean) to authenticated;

drop function if exists set_own_video_consent(boolean, boolean);
create function set_own_video_consent(
  p_clinical boolean,
  p_educational boolean
) returns void
  language plpgsql security definer set search_path = public
as $$
declare v_patient_id uuid;
begin
  v_patient_id := current_patient_id();
  if v_patient_id is null then
    raise exception 'caller is not a patient';
  end if;
  update patient
     set video_consent_clinical = coalesce(p_clinical, false),
         video_consent_educational = coalesce(p_educational, false),
         video_consent_recorded_at = now(),
         video_consent_recorded_by = auth.uid(),
         video_consent_source = 'patient'
   where id = v_patient_id;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), 'patient', 'patient_video_consent_self_updated', 'patient', v_patient_id::text);
end; $$;
revoke all on function set_own_video_consent(boolean, boolean) from public;
grant execute on function set_own_video_consent(boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Step 4: recreate archive_goal_video against the renamed columns (it both
-- READS video_consent_educational and WRITES consent_educational). Body is the
-- 0092 definition with the two identifiers renamed; nothing else changes.
-- ---------------------------------------------------------------------------
create or replace function archive_goal_video(
  p_approved_goal_id uuid,
  p_source text,
  p_rating_id uuid,
  p_note text
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_role role; v_patient uuid; v_path text; v_rating int;
  v_unusable boolean; v_nrs int; v_cc boolean; v_ce boolean; v_id uuid;
begin
  v_role := current_app_role();
  if v_role <> 'clinician' then
    raise exception 'only a clinician can archive videos';
  end if;
  select patient_id into v_patient from approved_goal where id = p_approved_goal_id;
  if v_patient is null then
    raise exception 'goal not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'no active session for this patient';
  end if;
  select video_consent_clinical, video_consent_educational
    into v_cc, v_ce
    from patient where id = v_patient;
  if not coalesce(v_cc, false) then
    raise exception 'video consent not recorded for this patient';
  end if;

  if p_source = 'baseline' then
    select baseline_video_path into v_path from approved_goal where id = p_approved_goal_id;
    if nullif(trim(coalesce(v_path, '')), '') is null then
      raise exception 'no baseline clip to archive';
    end if;
    v_rating := null; v_unusable := false; v_nrs := null;
    update approved_goal set baseline_video_path = null where id = p_approved_goal_id;
  elsif p_source = 'rating' then
    if p_rating_id is null then
      raise exception 'rating id required';
    end if;
    select wgr.video_path, wgr.clinic_video_rating, wgr.clinic_video_unusable, wgr.nrs_value
      into v_path, v_rating, v_unusable, v_nrs
      from weekly_goal_rating wgr
      join approved_goal ag on ag.id = wgr.approved_goal_id
     where wgr.id = p_rating_id and ag.id = p_approved_goal_id;
    if nullif(trim(coalesce(v_path, '')), '') is null then
      raise exception 'no clip to archive on this rating';
    end if;
    update weekly_goal_rating set video_path = null where id = p_rating_id;
  else
    raise exception 'invalid source';
  end if;

  insert into archived_goal_video (
    patient_id, approved_goal_id, source, rating_id, video_path,
    clinic_video_rating, clinic_video_unusable, nrs_value,
    consent_clinical, consent_educational, note, archived_by
  ) values (
    v_patient, p_approved_goal_id, p_source,
    case when p_source = 'rating' then p_rating_id else null end, v_path,
    v_rating, v_unusable, v_nrs,
    coalesce(v_cc, false), coalesce(v_ce, false),
    nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  ) returning id into v_id;

  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), v_role, 'goal_video_archived', 'archived_goal_video', v_id::text);
  return v_id;
end; $$;
revoke all on function archive_goal_video(uuid, text, uuid, text) from public;
grant execute on function archive_goal_video(uuid, text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Step 5: research-consent RPCs (clinician attest, patient self, admin purge).
-- ---------------------------------------------------------------------------

-- Clinician records or withdraws on the patient's behalf.
create or replace function set_patient_research_consent(
  p_patient_id uuid,
  p_consent boolean
) returns void
  language plpgsql security definer set search_path = public
as $$
declare v_role role; v_was boolean;
begin
  v_role := current_app_role();
  if v_role <> 'clinician' then
    raise exception 'only a clinician can record research consent';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;
  select research_consent into v_was from patient where id = p_patient_id;
  update patient
     set research_consent = coalesce(p_consent, false),
         research_consent_source = 'clinician',
         research_consent_recorded_at =
           case when coalesce(p_consent,false) then now() else research_consent_recorded_at end,
         research_consent_recorded_by =
           case when coalesce(p_consent,false) then auth.uid() else research_consent_recorded_by end,
         research_consent_withdrawn_at =
           case when coalesce(v_was,false) and not coalesce(p_consent,false)
                then now() else
                  case when coalesce(p_consent,false) then null else research_consent_withdrawn_at end
           end
   where id = p_patient_id;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), v_role,
          case when coalesce(p_consent,false) then 'research_consent_granted' else 'research_consent_withdrawn' end,
          'patient', p_patient_id::text);
end; $$;
revoke all on function set_patient_research_consent(uuid, boolean) from public;
grant execute on function set_patient_research_consent(uuid, boolean) to authenticated;

-- Patient records or withdraws their own.
create or replace function set_own_research_consent(
  p_consent boolean
) returns void
  language plpgsql security definer set search_path = public
as $$
declare v_patient_id uuid; v_was boolean;
begin
  v_patient_id := current_patient_id();
  if v_patient_id is null then
    raise exception 'caller is not a patient';
  end if;
  select research_consent into v_was from patient where id = v_patient_id;
  update patient
     set research_consent = coalesce(p_consent, false),
         research_consent_source = 'patient',
         research_consent_recorded_at =
           case when coalesce(p_consent,false) then now() else research_consent_recorded_at end,
         research_consent_recorded_by =
           case when coalesce(p_consent,false) then auth.uid() else research_consent_recorded_by end,
         research_consent_withdrawn_at =
           case when coalesce(v_was,false) and not coalesce(p_consent,false)
                then now() else
                  case when coalesce(p_consent,false) then null else research_consent_withdrawn_at end
           end
   where id = v_patient_id;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), 'patient',
          case when coalesce(p_consent,false) then 'research_consent_self_granted' else 'research_consent_self_withdrawn' end,
          'patient', v_patient_id::text);
end; $$;
revoke all on function set_own_research_consent(boolean) from public;
grant execute on function set_own_research_consent(boolean) to authenticated;

-- Admin confirms purge of already-exported records after a withdrawal.
create or replace function confirm_research_purge(
  p_patient_id uuid
) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not current_user_is_admin() then
    raise exception 'only an admin can confirm a research purge';
  end if;
  update patient
     set research_consent_purged_at = now()
   where id = p_patient_id
     and research_consent_withdrawn_at is not null;
  if not found then
    raise exception 'patient has no pending withdrawal to purge';
  end if;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), 'admin', 'research_consent_purge_confirmed', 'patient', p_patient_id::text);
end; $$;
revoke all on function confirm_research_purge(uuid) from public;
grant execute on function confirm_research_purge(uuid) to authenticated;
