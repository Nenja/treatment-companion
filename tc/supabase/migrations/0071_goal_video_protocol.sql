-- 0071_goal_video_protocol.sql
-- ---------------------------------------------------------------------------
-- Standardized task protocol for a goal's check-in video.
--
-- The point (lever 3 — separate CAPTURING from JUDGING): a rotating, untrained
-- informant is a poor judge but a fine recorder IF handed a fixed recipe. So
-- the clinician defines, once per video-enabled goal, what to film and how to
-- frame it; that recipe is shown at the moment of recording (guided capture)
-- and travels with the goal, so the clip is the same task every week no matter
-- who holds the phone — which is what makes it comparable / scoreable later.
--
-- Additive + optional: goals without a protocol record exactly as before.
-- ---------------------------------------------------------------------------

alter table approved_goal
  add column if not exists video_task_instruction text,
  add column if not exists video_task_setup text,
  add column if not exists video_task_seconds int
    check (video_task_seconds is null or video_task_seconds between 3 and 30);

comment on column approved_goal.video_task_instruction is
  'Guided-capture recipe: what the patient/caregiver should film at check-in, '
  'shown at record time so the task is identical week to week regardless of who '
  'films it. Pairs with video_task_setup (framing) and video_task_seconds '
  '(target length). Capped at 30s to match the recorder.';

-- Clinician sets/updates the protocol for a goal they can access. Mirrors
-- set_approved_goal_video_enabled (0062). nullif(trim()) so blank clears.
create or replace function set_goal_video_protocol(
  p_goal_id uuid,
  p_instruction text,
  p_setup text,
  p_seconds int
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
  if p_seconds is not null and (p_seconds < 3 or p_seconds > 30) then
    raise exception 'target seconds must be between 3 and 30';
  end if;
  update approved_goal
     set video_task_instruction = nullif(trim(p_instruction), ''),
         video_task_setup = nullif(trim(p_setup), ''),
         video_task_seconds = p_seconds
   where id = p_goal_id;
end;
$$;

revoke all on function set_goal_video_protocol(uuid, text, text, int) from public;
grant execute on function set_goal_video_protocol(uuid, text, text, int) to authenticated;
