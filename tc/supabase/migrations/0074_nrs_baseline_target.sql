-- 0074_nrs_baseline_target.sql
-- ---------------------------------------------------------------------------
-- NRS goals gain a baseline and a target value (0–10), agreed with the
-- patient in clinic when the goal is recorded. They make the weekly 0–10
-- self-report interpretable: "started at 8, aiming for 4". The clinical
-- direction (higher- vs lower-is-better) is now derived from these on the
-- client, so the record-goal form no longer asks for it separately.
--
-- Both columns are nullable: existing goals (and GAS goals) have no values
-- and simply don't render a start/target line.
-- ---------------------------------------------------------------------------

alter table approved_goal
  add column nrs_baseline_value int
    check (nrs_baseline_value between 0 and 10),
  add column nrs_target_value int
    check (nrs_target_value between 0 and 10);

-- Extend create_goal_for_patient with the two values. Body is identical to
-- 0035 except for the two new insert columns; the old 9-arg signature is
-- dropped so there is a single definition.
drop function if exists create_goal_for_patient(
  uuid, text, text, text, nrs_direction, int, int, int, int
);

create or replace function create_goal_for_patient(
  p_patient_id uuid,
  p_patient_facing_text text,
  p_smart_text text,
  p_nrs_question text,
  p_nrs_direction nrs_direction,
  p_nrs_cut_low_low int,
  p_nrs_cut_low int,
  p_nrs_cut_zero int,
  p_nrs_cut_high int,
  p_nrs_baseline_value int,
  p_nrs_target_value int
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

  if not (
    p_nrs_cut_low_low < p_nrs_cut_low
    and p_nrs_cut_low < p_nrs_cut_zero
    and p_nrs_cut_zero < p_nrs_cut_high
  ) then
    raise exception 'cut points must be strictly increasing';
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
    nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    nrs_baseline_value, nrs_target_value,
    approved_by_clinician_id, status
  ) values (
    null, p_patient_id, v_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    trim(p_nrs_question), p_nrs_direction,
    p_nrs_cut_low_low, p_nrs_cut_low, p_nrs_cut_zero, p_nrs_cut_high,
    p_nrs_baseline_value, p_nrs_target_value,
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

revoke all on function create_goal_for_patient(
  uuid, text, text, text, nrs_direction, int, int, int, int, int, int
) from public;
grant execute on function create_goal_for_patient(
  uuid, text, text, text, nrs_direction, int, int, int, int, int, int
) to authenticated;
