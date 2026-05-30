-- ============================================================================
-- 0052 — GAS goals alongside NRS goals.
--
-- Until now every goal is an NRS goal: a clinician-written 0–10
-- question with a direction and four cut points, from which the server
-- derives a −2..+2 GAS bucket (migration 0013). The physician now wants
-- the option, *per goal*, to record a classic Goal Attainment Scaling
-- goal instead: five written descriptive anchors (one sentence each for
-- −2 / −1 / 0 / +1 / +2). For a GAS goal the patient reads the anchors
-- and picks the level that matches — there is no 0–10 layer, and the
-- chosen level IS the rating.
--
-- This restores the descriptive-anchor model the app had before 0013,
-- now as a *second* goal kind chosen per goal rather than a wholesale
-- replacement. Existing NRS goals are untouched.
--
-- Design — a discriminated union on approved_goal:
--   * goal_kind ('nrs' | 'gas'), default 'nrs' so every existing row is
--     correctly an NRS goal with no data change.
--   * The NRS columns (nrs_question, nrs_direction, the four cuts)
--     become NULLABLE — required only when goal_kind = 'nrs'.
--   * Five new nullable anchor columns — required only when
--     goal_kind = 'gas'.
--   * A CHECK constraint enforces "an NRS goal has its NRS fields and
--     no anchors; a GAS goal has its anchors and no NRS fields", so the
--     two kinds can't be half-populated.
--
-- This migration only adds the data model and the GAS create RPC (the
-- foundation, so GAS goals can be *recorded*). The patient check-in
-- rendering for GAS goals is a separate, careful follow-up slice; until
-- it ships, a GAS goal can be created but the patient check-in will not
-- yet know how to present it — so do not record GAS goals on a patient
-- a tester will check in as until that slice lands.
-- ============================================================================

-- 1. The kind discriminator.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_kind') then
    create type goal_kind as enum ('nrs', 'gas');
  end if;
end$$;

alter table approved_goal
  add column if not exists goal_kind goal_kind not null default 'nrs';

comment on column approved_goal.goal_kind is
  'Which measurement model this goal uses: nrs (0–10 question + cut '
  'points → derived GAS) or gas (five descriptive anchors, patient '
  'picks the level directly). Defaults to nrs.';

-- 2. NRS columns become nullable (required only for nrs goals; the
--    CHECK below enforces that). Dropping NOT NULL is safe for existing
--    rows, which all have these populated.
alter table approved_goal
  alter column nrs_question drop not null,
  alter column nrs_direction drop not null,
  alter column nrs_cut_low_low drop not null,
  alter column nrs_cut_low drop not null,
  alter column nrs_cut_zero drop not null,
  alter column nrs_cut_high drop not null;

-- The monotonic-cuts constraint from 0013 must tolerate all-null cuts
-- (a GAS goal has no cuts). Re-create it to pass when cuts are null.
alter table approved_goal
  drop constraint if exists approved_goal_cuts_monotonic;
alter table approved_goal
  add constraint approved_goal_cuts_monotonic check (
    nrs_cut_low_low is null
    or (
      nrs_cut_low_low < nrs_cut_low
      and nrs_cut_low < nrs_cut_zero
      and nrs_cut_zero < nrs_cut_high
    )
  );

-- 3. Five descriptive anchor columns for GAS goals (nullable; required
--    only for gas goals per the CHECK below).
alter table approved_goal
  add column if not exists anchor_minus2 text,
  add column if not exists anchor_minus1 text,
  add column if not exists anchor_zero text,
  add column if not exists anchor_plus1 text,
  add column if not exists anchor_plus2 text;

-- 4. The discriminated-union integrity constraint.
--    nrs goal: all four cuts + question + direction present; no anchors.
--    gas goal: all five anchors present; no NRS fields.
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
      goal_kind = 'gas'
      and anchor_minus2 is not null
      and anchor_minus1 is not null
      and anchor_zero is not null
      and anchor_plus1 is not null
      and anchor_plus2 is not null
      and nrs_question is null
      and nrs_direction is null
      and nrs_cut_low_low is null
      and nrs_cut_low is null
      and nrs_cut_zero is null
      and nrs_cut_high is null
    )
  );

-- ---------------------------------------------------------------------------
-- 5. create_gas_goal_for_patient — physician records + approves a GAS
--    goal in one step. Parallel to create_goal_for_patient (0035) but
--    takes five anchors instead of NRS question/direction/cuts. The
--    existing NRS RPC is unchanged (goal_kind defaults to 'nrs' there).
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

  -- Physician (role 'clinician') only — same as the NRS path. A
  -- physiotherapist suggests goals, never records them.
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

  -- All five anchors are required for a GAS goal.
  if p_anchor_minus2 is null or length(trim(p_anchor_minus2)) = 0
     or p_anchor_minus1 is null or length(trim(p_anchor_minus1)) = 0
     or p_anchor_zero  is null or length(trim(p_anchor_zero))  = 0
     or p_anchor_plus1 is null or length(trim(p_anchor_plus1)) = 0
     or p_anchor_plus2 is null or length(trim(p_anchor_plus2)) = 0 then
    raise exception 'all five GAS anchors are required';
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
    trim(p_anchor_minus2), trim(p_anchor_minus1), trim(p_anchor_zero),
    trim(p_anchor_plus1), trim(p_anchor_plus2),
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

revoke all on function create_gas_goal_for_patient(
  uuid, text, text, text, text, text, text, text
) from public;
grant execute on function create_gas_goal_for_patient(
  uuid, text, text, text, text, text, text, text
) to authenticated;
