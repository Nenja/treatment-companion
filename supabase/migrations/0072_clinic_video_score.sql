-- 0072_clinic_video_score.sql
-- ---------------------------------------------------------------------------
-- Slice 2 of informant-independent measurement (separate capturing from
-- judging). Slice 1 (0071) made the *capture* standardized; this makes the
-- *judging* consistent: the clinic scores each standardized video against the
-- goal's GAS levels (-2..2), producing an authoritative outcome series rated
-- by ONE assessor — comparable week to week even as the at-home informant
-- rotates. An "unusable" flag keeps off-protocol clips out of that series.
--
-- Additive: a rating with a video but no score reads as "pending".
-- ---------------------------------------------------------------------------

alter table weekly_goal_rating
  add column if not exists clinic_video_rating int
    check (clinic_video_rating is null or clinic_video_rating between -2 and 2),
  add column if not exists clinic_video_unusable boolean not null default false,
  add column if not exists clinic_video_scored_by uuid
    references clinician(id) on delete set null,
  add column if not exists clinic_video_scored_at timestamptz;

comment on column weekly_goal_rating.clinic_video_rating is
  'Clinic GAS-level (-2..2) assessment of the standardized check-in video, by '
  'one consistent rater — the authoritative, informant-independent outcome. '
  'Null when not yet scored or when the clip is marked unusable.';

-- Clinician scores (or marks unusable) the video on a rating they can access.
-- Unusable wins: it clears the numeric score so the clip is excluded from the
-- series. Mirrors the access pattern of the other goal-video RPCs.
create or replace function set_clinic_video_score(
  p_rating_id uuid,
  p_rating int,
  p_unusable boolean
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
begin
  select ag.patient_id
    into v_patient
    from weekly_goal_rating wgr
    join approved_goal ag on ag.id = wgr.approved_goal_id
   where wgr.id = p_rating_id;
  if v_patient is null then
    raise exception 'rating not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;
  if p_rating is not null and (p_rating < -2 or p_rating > 2) then
    raise exception 'rating must be between -2 and 2';
  end if;
  update weekly_goal_rating
     set clinic_video_unusable = coalesce(p_unusable, false),
         clinic_video_rating =
           case when coalesce(p_unusable, false) then null else p_rating end,
         clinic_video_scored_by = current_clinician_id(),
         clinic_video_scored_at = now()
   where id = p_rating_id;
end;
$$;

revoke all on function set_clinic_video_score(uuid, int, boolean) from public;
grant execute on function set_clinic_video_score(uuid, int, boolean) to authenticated;
