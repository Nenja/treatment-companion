-- 0082_reopen_checkin.sql
-- ---------------------------------------------------------------------------
-- Let a patient undo a check-in they just submitted (e.g. a mis-tapped
-- rating) within a short window, then redo it.
--
-- "Undo" deletes the weekly_checkin (its ratings cascade) and flips the
-- prompt back to 'pending', so the normal check-in flow can run again. It is
-- deliberately bounded:
--   * only the patient's OWN check-in,
--   * only within 24 hours of submission,
--   * and refused once a clinician has scored a video on it (at that point
--     it's clinical data under review, not a quick fix).
-- ---------------------------------------------------------------------------

create or replace function reopen_weekly_checkin(
  p_checkin_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient_id uuid;
  v_checkin record;
begin
  v_patient_id := current_patient_id();
  if v_patient_id is null then
    raise exception 'caller is not a patient';
  end if;

  select id, patient_id, weekly_prompt_id, submitted_at
    into v_checkin
    from weekly_checkin
   where id = p_checkin_id
   for update;

  if v_checkin is null then
    raise exception 'check-in not found';
  end if;
  if v_checkin.patient_id <> v_patient_id then
    raise exception 'not your check-in';
  end if;
  if v_checkin.submitted_at <= now() - interval '24 hours' then
    raise exception 'the edit window has passed';
  end if;

  -- Once a clinician has scored a clip on this check-in, it's under review.
  if exists (
    select 1 from weekly_goal_rating r
     where r.weekly_checkin_id = p_checkin_id
       and (
         r.clinic_video_rating is not null
         or r.clinic_video_nrs is not null
         or r.clinic_video_unusable = true
       )
  ) then
    raise exception 'this check-in has already been reviewed by your clinician';
  end if;

  delete from weekly_checkin where id = p_checkin_id;

  update weekly_prompt
     set status = 'pending'
   where id = v_checkin.weekly_prompt_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'patient', 'checkin_reopened', 'weekly_prompt',
    v_checkin.weekly_prompt_id::text
  );
end;
$$;

revoke all on function reopen_weekly_checkin(uuid) from public;
grant execute on function reopen_weekly_checkin(uuid) to authenticated;
