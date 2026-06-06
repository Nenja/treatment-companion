-- 0075_baseline_video.sql
-- ---------------------------------------------------------------------------
-- Baseline video for a goal (Pass B of the video/baseline work).
--
-- A clinician records a baseline clip IN CLINIC, performing the goal's
-- standardized task at the start of the cycle. It is stored on the goal
-- and serves two purposes:
--   * a "before" reference shown to the patient when they record the
--     peak-effect clip at the weeks-6–8 check-in, so they reproduce the
--     same task;
--   * the before/after partner for the clinician's later video score.
--
-- Storage path convention for a baseline clip:
--     <patient_id>/baseline/<goal_id>.<ext>
-- The patient already has full (read+write) access to anything under their
-- own <patient_id>/ folder (0062), so no new PATIENT policy is needed for
-- the reference playback. The new access path is letting a CLINICIAN write
-- a baseline object — narrowly: only under the "baseline" subfolder, only
-- for a patient they currently have an active session with.
-- ---------------------------------------------------------------------------

alter table approved_goal
  add column if not exists baseline_video_path text;

-- Clinician records (or re-records) the baseline path for a goal they can
-- access. Mirrors set_approved_goal_video_enabled's authorization.
create or replace function set_goal_baseline_video(
  p_goal_id uuid,
  p_path text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
begin
  select patient_id into v_patient from approved_goal where id = p_goal_id;
  if v_patient is null then
    raise exception 'goal not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;
  update approved_goal
     set baseline_video_path = nullif(trim(p_path), '')
   where id = p_goal_id;
end;
$$;

revoke all on function set_goal_baseline_video(uuid, text) from public;
grant execute on function set_goal_baseline_video(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: let a clinician WRITE a baseline clip for a patient they can
-- access. Limited to the "baseline" subfolder so a clinician can never
-- touch the patient's own weekly check-in clips. Read is already granted to
-- clinicians by the 0062 "clinician reads patient goal videos" policy, and
-- to the patient by the 0062 "patient manages own goal videos" policy.
-- ---------------------------------------------------------------------------
drop policy if exists "clinician writes baseline goal videos" on storage.objects;
create policy "clinician writes baseline goal videos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'goal-videos'
    and current_patient_id() is null
    and (storage.foldername(name))[2] = 'baseline'
    and clinician_can_access_patient(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "clinician updates baseline goal videos" on storage.objects;
create policy "clinician updates baseline goal videos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'goal-videos'
    and current_patient_id() is null
    and (storage.foldername(name))[2] = 'baseline'
    and clinician_can_access_patient(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'goal-videos'
    and current_patient_id() is null
    and (storage.foldername(name))[2] = 'baseline'
    and clinician_can_access_patient(((storage.foldername(name))[1])::uuid)
  );
