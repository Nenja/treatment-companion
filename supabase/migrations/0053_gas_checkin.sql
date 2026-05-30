-- ============================================================================
-- 0053 — GAS goals, slice two: optional anchors + patient check-in.
--
-- Two changes that together let patients rate GAS goals:
--
-- 1. OPTIONAL ANCHORS. Slice one (0052) required all five GAS anchor
--    sentences. The physician now wants the option to leave anchors
--    blank — the patient then rates the goal from −2..+2 against the
--    goal text itself, with each level shown by its generic meaning
--    (e.g. "much more than expected"). So anchors become fully optional
--    for a GAS goal: any mix of filled and blank is allowed, including
--    none. We relax the discriminated-union constraint accordingly: a
--    GAS goal still must have NO NRS fields, but anchors are no longer
--    required. An NRS goal is unchanged (its NRS fields are required,
--    no anchors).
--
-- 2. GAS-AWARE SUBMISSION. submit_checkin_v2 (0021) reads each goal's
--    NRS cut points and derives the GAS level via nrs_to_gas. A GAS
--    goal has no cut points and the patient picks the level directly,
--    so for GAS goals we must accept the chosen level as-is and skip
--    the NRS derivation. This adds a new submit RPC that takes, per
--    goal, EITHER an nrs_value (NRS goals) OR a gas_value (GAS goals),
--    and stores the rating correctly for each kind. The old RPC is left
--    in place for safety; the check-in UI moves to the new one.
-- ============================================================================

-- 1. Relax the kind-fields constraint: anchors optional for GAS goals.
alter table approved_goal
  drop constraint if exists approved_goal_kind_fields;
alter table approved_goal
  add constraint approved_goal_kind_fields check (
    (
      goal_kind = 'nrs'
      and nrs_question is not null
      and nrs_direction is not null
      and nrs_cut_low_low is not null
      and nrs_cut_low is not null
      and nrs_cut_zero is not null
      and nrs_cut_high is not null
      and anchor_minus2 is null
      and anchor_minus1 is null
      and anchor_zero is null
      and anchor_plus1 is null
      and anchor_plus2 is null
    )
    or (
      -- GAS goal: no NRS fields. Anchors are all optional.
      goal_kind = 'gas'
      and nrs_question is null
      and nrs_direction is null
      and nrs_cut_low_low is null
      and nrs_cut_low is null
      and nrs_cut_zero is null
      and nrs_cut_high is null
    )
  );

-- ---------------------------------------------------------------------------
-- gas_label — map a GAS level (−2..2) to the rating_label enum. Factors
-- out the case expression 0021 inlined, so both the NRS and GAS paths
-- in the new submit RPC label consistently.
-- ---------------------------------------------------------------------------
create or replace function gas_label(p_gas int)
  returns rating_label
  language sql
  immutable
as $$
  select case p_gas
    when -2 then 'muchWorseThanExpected'::rating_label
    when -1 then 'aLittleWorseThanExpected'::rating_label
    when 0 then 'asExpected'::rating_label
    when 1 then 'betterThanExpected'::rating_label
    when 2 then 'muchBetterThanExpected'::rating_label
  end;
$$;

-- ---------------------------------------------------------------------------
-- 2. submit_weekly_checkin_v3 — kind-aware weekly check-in submission.
--
-- A faithful copy of submit_weekly_checkin (0021): prompt-driven,
-- caller is the patient (current_patient_id), one check-in per prompt,
-- marks the prompt completed, writes the same audit event. The only
-- difference is the per-rating derivation, which now dispatches on the
-- goal's kind:
--   * nrs goal → require nrs_value in 0..10, derive GAS via nrs_to_gas,
--     store rating_value = derived GAS and nrs_value = the raw answer.
--   * gas goal → require gas_value in −2..2 (the level the patient
--     picked), store rating_value = gas_value directly, nrs_value null.
--
-- Ratings use a new composite type that carries both an optional
-- nrs_value and an optional gas_value, so a single check-in can mix
-- NRS and GAS goals.
-- ---------------------------------------------------------------------------

-- Composite input type: one per goal, carrying whichever value applies.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'weekly_goal_rating_input') then
    create type weekly_goal_rating_input as (
      approved_goal_id uuid,
      nrs_value int,
      gas_value int
    );
  end if;
end$$;

create or replace function submit_weekly_checkin_v3(
  p_prompt_id uuid,
  p_ratings weekly_goal_rating_input[],
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
  v_rating weekly_goal_rating_input;
  v_goal record;
  v_gas int;
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
    select goal_kind, nrs_direction,
           nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high
      into v_goal
      from approved_goal
     where id = v_rating.approved_goal_id;

    if v_goal is null then
      raise exception 'goal not found: %', v_rating.approved_goal_id;
    end if;

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
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values (
        v_checkin_id, v_rating.approved_goal_id, gas_label(v_gas), v_gas,
        v_rating.nrs_value
      );
    else
      -- GAS goal: the patient picked the level directly.
      if v_rating.gas_value is null then
        raise exception 'gas_value required for GAS goal %', v_rating.approved_goal_id;
      end if;
      if v_rating.gas_value < -2 or v_rating.gas_value > 2 then
        raise exception 'GAS value out of range: %', v_rating.gas_value;
      end if;
      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values (
        v_checkin_id, v_rating.approved_goal_id, gas_label(v_rating.gas_value),
        v_rating.gas_value, null
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

revoke all on function submit_weekly_checkin_v3(uuid, weekly_goal_rating_input[], text, submitter_label) from public;
grant execute on function submit_weekly_checkin_v3(uuid, weekly_goal_rating_input[], text, submitter_label) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Relax create_gas_goal_for_patient: anchors are now optional.
--
-- Slice one (0052) required all five anchors. The physician now wants
-- the option to leave some or all blank (the patient then rates against
-- the goal text using the generic level meanings). Blank/whitespace
-- anchors are stored as null. The goal text itself remains required.
-- ---------------------------------------------------------------------------
create or replace function create_gas_goal_for_patient(
  p_patient_id uuid,
  p_patient_facing_text text,
  p_smart_text text,
  p_anchor_minus2 text,
  p_anchor_minus1 text,
  p_anchor_zero text,
  p_anchor_plus1 text,
  p_anchor_plus2 text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can record a goal';
  end if;

  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  if p_patient_facing_text is null
     or length(trim(p_patient_facing_text)) = 0 then
    raise exception 'goal text is required';
  end if;

  select id into v_cycle_id
    from treatment_cycle
   where patient_id = p_patient_id
     and status = 'active'
   order by cycle_number desc
   limit 1;

  if v_cycle_id is null then
    raise exception 'patient has no active treatment cycle';
  end if;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    goal_kind,
    anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2,
    approved_by_clinician_id, status
  ) values (
    null, p_patient_id, v_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    'gas',
    nullif(trim(p_anchor_minus2), ''), nullif(trim(p_anchor_minus1), ''),
    nullif(trim(p_anchor_zero), ''), nullif(trim(p_anchor_plus1), ''),
    nullif(trim(p_anchor_plus2), ''),
    v_clinician_id, 'active'
  ) returning id into v_goal_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'goal_recorded_by_clinician',
    'approved_goal', v_goal_id::text
  );

  return v_goal_id;
end;
$$;
