-- 0062_goal_video.sql
-- ---------------------------------------------------------------------------
-- Optional short patient video as part of goal reporting.
--
--   * A clinician may enable video for a specific goal (video_enabled).
--   * At check-in, for a video-enabled goal in the peak-effect window
--     (weeks 6–8, enforced in the app), the patient may OPTIONALLY record a
--     short (≤30s) clip after giving explicit consent.
--   * The clip is uploaded to the private `goal-videos` Storage bucket and
--     its object key is stored on the per-goal rating (video_path).
--
-- Storage access mirrors the app's existing model: a patient can manage
-- only objects under their own patient-id folder; a clinician can read only
-- the videos of patients they currently have an active session with.
-- ---------------------------------------------------------------------------

-- 1. Per-goal opt-in flag (clinician-controlled).
alter table approved_goal
  add column if not exists video_enabled boolean not null default false;

-- 2. Per-(goal, check-in) Storage object key. Null = no video for this goal
--    in this check-in. Path convention: <patient_id>/<prompt_id>/<goal_id>.<ext>
alter table weekly_goal_rating
  add column if not exists video_path text;

-- ---------------------------------------------------------------------------
-- 3. Clinician toggles video for a goal they can access.
-- ---------------------------------------------------------------------------
create or replace function set_approved_goal_video_enabled(
  p_goal_id uuid,
  p_enabled boolean
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
  update approved_goal set video_enabled = p_enabled where id = p_goal_id;
end;
$$;

revoke all on function set_approved_goal_video_enabled(uuid, boolean) from public;
grant execute on function set_approved_goal_video_enabled(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. submit_weekly_checkin_v4 — identical to v3, plus an optional per-rating
--    video path. The path is stored only when the goal has video enabled
--    (defensive: the app already gates this, but the DB does not trust it).
--    v3 is left intact for any client still calling it.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'weekly_goal_rating_input_v4'
  ) then
    create type weekly_goal_rating_input_v4 as (
      approved_goal_id uuid,
      nrs_value int,
      gas_value int,
      video_path text
    );
  end if;
end$$;

create or replace function submit_weekly_checkin_v4(
  p_prompt_id uuid,
  p_ratings weekly_goal_rating_input_v4[],
  p_comment text default null,
  p_submitter_label submitter_label default 'self'
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient_id uuid;
  v_prompt record;
  v_checkin_id uuid;
  v_rating weekly_goal_rating_input_v4;
  v_goal record;
  v_gas int;
  v_video text;
begin
  v_patient_id := current_patient_id();
  if v_patient_id is null then
    raise exception 'caller is not a patient';
  end if;

  select id, treatment_cycle_id, patient_id, week_number, status
    into v_prompt
    from weekly_prompt
   where id = p_prompt_id
   for update;

  if v_prompt is null then
    raise exception 'prompt not found';
  end if;
  if v_prompt.patient_id <> v_patient_id then
    raise exception 'prompt does not belong to caller';
  end if;
  if v_prompt.status <> 'pending' then
    raise exception 'prompt is not pending';
  end if;

  insert into weekly_checkin (
    weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment,
    submitter_label
  ) values (
    p_prompt_id, v_patient_id, v_prompt.treatment_cycle_id, v_prompt.week_number,
    nullif(trim(p_comment), ''),
    p_submitter_label
  ) returning id into v_checkin_id;

  foreach v_rating in array p_ratings loop
    select goal_kind, nrs_direction, video_enabled,
           nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high
      into v_goal
      from approved_goal
     where id = v_rating.approved_goal_id;

    if v_goal is null then
      raise exception 'goal not found: %', v_rating.approved_goal_id;
    end if;

    -- Only keep a video path for goals that actually have video enabled.
    v_video := case
      when v_goal.video_enabled then nullif(trim(v_rating.video_path), '')
      else null
    end;

    if v_goal.goal_kind = 'nrs' then
      if v_rating.nrs_value is null then
        raise exception 'nrs_value required for NRS goal %', v_rating.approved_goal_id;
      end if;
      if v_rating.nrs_value < 0 or v_rating.nrs_value > 10 then
        raise exception 'NRS value out of range: %', v_rating.nrs_value;
      end if;
      v_gas := nrs_to_gas(
        v_rating.nrs_value, v_goal.nrs_direction,
        v_goal.nrs_cut_low_low, v_goal.nrs_cut_low,
        v_goal.nrs_cut_zero, v_goal.nrs_cut_high
      );
      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value,
        nrs_value, video_path
      ) values (
        v_checkin_id, v_rating.approved_goal_id, gas_label(v_gas), v_gas,
        v_rating.nrs_value, v_video
      );
    else
      if v_rating.gas_value is null then
        raise exception 'gas_value required for GAS goal %', v_rating.approved_goal_id;
      end if;
      if v_rating.gas_value < -2 or v_rating.gas_value > 2 then
        raise exception 'GAS value out of range: %', v_rating.gas_value;
      end if;
      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value,
        nrs_value, video_path
      ) values (
        v_checkin_id, v_rating.approved_goal_id, gas_label(v_rating.gas_value),
        v_rating.gas_value, null, v_video
      );
    end if;
  end loop;

  update weekly_prompt
     set status = 'completed'
   where id = p_prompt_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'patient', 'checkin_submitted', 'weekly_checkin',
    v_checkin_id::text
  );

  return v_checkin_id;
end;
$$;

revoke all on function submit_weekly_checkin_v4(uuid, weekly_goal_rating_input_v4[], text, submitter_label) from public;
grant execute on function submit_weekly_checkin_v4(uuid, weekly_goal_rating_input_v4[], text, submitter_label) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Private Storage bucket for goal videos + row-level policies.
--    Path convention: <patient_id>/<prompt_id>/<goal_id>.<ext>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('goal-videos', 'goal-videos', false)
  on conflict (id) do nothing;

-- Patients: full access to objects under their own patient-id folder.
drop policy if exists "patient manages own goal videos" on storage.objects;
create policy "patient manages own goal videos"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'goal-videos'
    and (storage.foldername(name))[1] = current_patient_id()::text
  )
  with check (
    bucket_id = 'goal-videos'
    and (storage.foldername(name))[1] = current_patient_id()::text
  );

-- Clinicians: read-only access to videos of patients they currently have
-- an active (un-expired) session with.
drop policy if exists "clinician reads patient goal videos" on storage.objects;
create policy "clinician reads patient goal videos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'goal-videos'
    and current_patient_id() is null  -- not the patient path; clinician only
    and clinician_can_access_patient(((storage.foldername(name))[1])::uuid)
  );
