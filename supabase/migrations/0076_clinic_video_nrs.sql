-- 0076_clinic_video_nrs.sql
-- ---------------------------------------------------------------------------
-- Pass C: clinic scores the peak-effect video. GAS goals are scored against
-- the anchors on the existing −2..+2 `clinic_video_rating` (0072). NRS goals
-- have no anchors, so the clinician scores the clip on the SAME 0–10 scale the
-- patient uses — giving a clinician-0–10 vs patient-0–10 comparison on one
-- axis. This adds that 0–10 field + its setter; the unusable flag and the
-- scored_by/at columns are shared with the GAS path.
-- ---------------------------------------------------------------------------

alter table weekly_goal_rating
  add column if not exists clinic_video_nrs int
    check (clinic_video_nrs is null or clinic_video_nrs between 0 and 10);

comment on column weekly_goal_rating.clinic_video_nrs is
  'Clinic 0–10 assessment of the standardized check-in video for an NRS goal, '
  'by one consistent rater — comparable to the patient''s own 0–10 self-report. '
  'Null when not yet scored or when the clip is marked unusable.';

-- Clinician scores (or marks unusable) an NRS clip on a rating they can
-- access. Mirrors set_clinic_video_score; unusable wins and clears the score.
create or replace function set_clinic_video_nrs(
  p_rating_id uuid,
  p_nrs int,
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
  if p_nrs is not null and (p_nrs < 0 or p_nrs > 10) then
    raise exception 'nrs must be between 0 and 10';
  end if;
  update weekly_goal_rating
     set clinic_video_unusable = coalesce(p_unusable, false),
         clinic_video_nrs =
           case when coalesce(p_unusable, false) then null else p_nrs end,
         clinic_video_scored_by = current_clinician_id(),
         clinic_video_scored_at = now()
   where id = p_rating_id;
end;
$$;

revoke all on function set_clinic_video_nrs(uuid, int, boolean) from public;
grant execute on function set_clinic_video_nrs(uuid, int, boolean) to authenticated;
