-- ============================================================================
-- 0021 — Update RPCs to accept submitter_label.
--
-- submit_weekly_checkin takes an optional p_submitter_label; defaults
-- to 'self'. The suggestion submit path is via plain INSERT (no RPC),
-- so the client inserts the value directly via the existing column.
-- ============================================================================

drop function if exists submit_weekly_checkin(uuid, weekly_nrs_rating_input[], text);

create or replace function submit_weekly_checkin(
  p_prompt_id uuid,
  p_ratings weekly_nrs_rating_input[],
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
  v_rating weekly_nrs_rating_input;
  v_goal record;
  v_gas int;
  v_label rating_label;
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
    if v_rating.nrs_value < 0 or v_rating.nrs_value > 10 then
      raise exception 'NRS value out of range: %', v_rating.nrs_value;
    end if;

    select nrs_direction, nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high
      into v_goal
      from approved_goal
     where id = v_rating.approved_goal_id;

    if v_goal is null then
      raise exception 'goal not found: %', v_rating.approved_goal_id;
    end if;

    v_gas := nrs_to_gas(
      v_rating.nrs_value, v_goal.nrs_direction,
      v_goal.nrs_cut_low_low, v_goal.nrs_cut_low,
      v_goal.nrs_cut_zero, v_goal.nrs_cut_high
    );

    v_label := case v_gas
      when -2 then 'muchWorseThanExpected'::rating_label
      when -1 then 'aLittleWorseThanExpected'::rating_label
      when 0 then 'asExpected'::rating_label
      when 1 then 'betterThanExpected'::rating_label
      when 2 then 'muchBetterThanExpected'::rating_label
    end;

    insert into weekly_goal_rating (
      weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
    ) values (
      v_checkin_id, v_rating.approved_goal_id, v_label, v_gas, v_rating.nrs_value
    );
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

revoke all on function submit_weekly_checkin(uuid, weekly_nrs_rating_input[], text, submitter_label) from public;
grant execute on function submit_weekly_checkin(uuid, weekly_nrs_rating_input[], text, submitter_label) to authenticated;
