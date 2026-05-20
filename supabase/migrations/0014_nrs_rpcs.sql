-- ============================================================================
-- 0014 — Update RPCs for NRS.
--
-- approve_suggestion now takes NRS configuration instead of anchor texts.
-- submit_weekly_checkin now takes NRS values and computes GAS from each
-- goal's cut points.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- approve_suggestion (replaces the anchor-text version)
-- ---------------------------------------------------------------------------

drop function if exists approve_suggestion(uuid, text, text, text, text, text, text, text);

create or replace function approve_suggestion(
  p_suggestion_id uuid,
  p_patient_facing_text text,
  p_smart_text text,
  p_nrs_question text,
  p_nrs_direction nrs_direction,
  p_nrs_cut_low_low int,
  p_nrs_cut_low int,
  p_nrs_cut_zero int,
  p_nrs_cut_high int
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_suggestion record;
  v_goal_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  select id, patient_id, treatment_cycle_id, status
    into v_suggestion
    from goal_suggestion
   where id = p_suggestion_id
   for update;

  if v_suggestion is null then
    raise exception 'suggestion not found';
  end if;

  if not clinician_can_access_patient(v_suggestion.patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- Validate cut points (the table constraint also checks this, but
  -- failing here gives a friendlier error message).
  if not (
    p_nrs_cut_low_low < p_nrs_cut_low
    and p_nrs_cut_low < p_nrs_cut_zero
    and p_nrs_cut_zero < p_nrs_cut_high
  ) then
    raise exception 'cut points must be strictly increasing';
  end if;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion.id, v_suggestion.patient_id, v_suggestion.treatment_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    trim(p_nrs_question), p_nrs_direction,
    p_nrs_cut_low_low, p_nrs_cut_low, p_nrs_cut_zero, p_nrs_cut_high,
    v_clinician_id, 'active'
  ) returning id into v_goal_id;

  update goal_suggestion
     set status = 'active'
   where id = p_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'suggestion_approved', 'approved_goal',
    v_goal_id::text
  );

  return v_goal_id;
end;
$$;

revoke all on function approve_suggestion(uuid, text, text, text, nrs_direction, int, int, int, int) from public;
grant execute on function approve_suggestion(uuid, text, text, text, nrs_direction, int, int, int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- nrs_to_gas helper — maps an NRS value to a GAS value given a goal's
-- cut points and direction. Used by submit_weekly_checkin.
-- ---------------------------------------------------------------------------

create or replace function nrs_to_gas(
  p_nrs int,
  p_direction nrs_direction,
  p_cut_low_low int,
  p_cut_low int,
  p_cut_zero int,
  p_cut_high int
) returns int
  language plpgsql
  immutable
as $$
declare
  v_gas int;
begin
  -- Compute as if higherIsBetter, then flip sign if lowerIsBetter.
  if p_nrs <= p_cut_low_low then
    v_gas := -2;
  elsif p_nrs <= p_cut_low then
    v_gas := -1;
  elsif p_nrs <= p_cut_zero then
    v_gas := 0;
  elsif p_nrs <= p_cut_high then
    v_gas := 1;
  else
    v_gas := 2;
  end if;

  if p_direction = 'lowerIsBetter' then
    v_gas := -v_gas;
  end if;

  return v_gas;
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_weekly_checkin (replaces previous version)
-- ---------------------------------------------------------------------------

-- New input type: just the goal id and the NRS value. GAS is derived.
drop function if exists submit_weekly_checkin(uuid, weekly_goal_rating_input[], text);
drop type if exists weekly_goal_rating_input;

create type weekly_nrs_rating_input as (
  approved_goal_id uuid,
  nrs_value int
);

create or replace function submit_weekly_checkin(
  p_prompt_id uuid,
  p_ratings weekly_nrs_rating_input[],
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
    weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
  ) values (
    p_prompt_id, v_patient_id, v_prompt.treatment_cycle_id, v_prompt.week_number,
    nullif(trim(p_comment), '')
  ) returning id into v_checkin_id;

  foreach v_rating in array p_ratings loop
    if v_rating.nrs_value < 0 or v_rating.nrs_value > 10 then
      raise exception 'NRS value out of range: %', v_rating.nrs_value;
    end if;

    -- Look up the goal's cut points and direction to derive GAS.
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

revoke all on function submit_weekly_checkin(uuid, weekly_nrs_rating_input[], text) from public;
grant execute on function submit_weekly_checkin(uuid, weekly_nrs_rating_input[], text) to authenticated;
