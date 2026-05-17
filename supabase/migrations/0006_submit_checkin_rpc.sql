-- ============================================================================
-- 0006 — submit_weekly_checkin RPC
--
-- Atomically writes a complete weekly check-in:
--   1. Inserts a row in weekly_checkin
--   2. Inserts one row per rating in weekly_goal_rating
--   3. Marks the linked weekly_prompt as 'completed'
--
-- Either everything succeeds, or nothing changes. The patient-facing UI
-- doesn't have to think about partial-failure rollback.
-- ============================================================================

-- Type for one rating row. Used as the input shape for the RPC.
create type weekly_goal_rating_input as (
  approved_goal_id uuid,
  rating_label rating_label,
  rating_value int
);

create or replace function submit_weekly_checkin(
  p_prompt_id uuid,
  p_ratings weekly_goal_rating_input[],
  p_comment text default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient_id uuid;
  v_prompt record;
  v_checkin_id uuid;
  v_rating weekly_goal_rating_input;
begin
  v_patient_id := current_patient_id();
  if v_patient_id is null then
    raise exception 'caller is not a patient';
  end if;

  -- Validate the prompt belongs to the caller and is still pending.
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

  -- Insert the check-in row.
  insert into weekly_checkin (
    weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
  ) values (
    p_prompt_id, v_patient_id, v_prompt.treatment_cycle_id, v_prompt.week_number,
    nullif(trim(p_comment), '')
  ) returning id into v_checkin_id;

  -- Insert one rating per element. Foreach in plpgsql handles the array.
  foreach v_rating in array p_ratings loop
    insert into weekly_goal_rating (
      weekly_checkin_id, approved_goal_id, rating_label, rating_value
    ) values (
      v_checkin_id, v_rating.approved_goal_id, v_rating.rating_label,
      v_rating.rating_value
    );
  end loop;

  -- Mark the prompt completed.
  update weekly_prompt
     set status = 'completed'
   where id = p_prompt_id;

  -- Audit log.
  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'patient', 'checkin_submitted', 'weekly_checkin',
    v_checkin_id::text
  );

  return v_checkin_id;
end;
$$;

revoke all on function submit_weekly_checkin(uuid, weekly_goal_rating_input[], text)
  from public;
grant execute on function submit_weekly_checkin(uuid, weekly_goal_rating_input[], text)
  to authenticated;

comment on function submit_weekly_checkin(uuid, weekly_goal_rating_input[], text) is
  'Atomically submit a patient''s weekly check-in: create checkin row, ' ||
  'insert all goal ratings, mark prompt as completed. All-or-nothing.';
