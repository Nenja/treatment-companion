-- ============================================================================
-- 0035 — Physician records a goal on the patient's behalf.
--
-- The app's model is patient-first: a patient suggests a goal, the
-- physician approves it. But in clinic a patient often voices a goal
-- out loud — and an elderly patient won't reliably go home and type it
-- into the app. This lets the physician act as scribe: enter the goal
-- the patient stated and approve it in one step.
--
-- The goal still ORIGINATES from the patient; the physician only
-- records it. There is no patient goal_suggestion row in this path, so
-- approved_goal.suggestion_id — until now NOT NULL — must allow null.
--
-- Two changes:
--   1. Make approved_goal.suggestion_id nullable. The UNIQUE stays:
--      Postgres unique indexes permit multiple nulls, so several
--      physician-recorded goals (all null suggestion_id) don't collide.
--   2. New RPC create_goal_for_patient — mirrors approve_suggestion but
--      takes a patient_id, resolves the active cycle itself, and
--      inserts the approved_goal with suggestion_id null.
-- ============================================================================

alter table approved_goal
  alter column suggestion_id drop not null;

-- ---------------------------------------------------------------------------
-- create_goal_for_patient — physician records + approves a goal in one
-- step. Same validation and shape as approve_suggestion (0014), minus
-- the suggestion lookup; the active cycle is resolved server-side.
-- ---------------------------------------------------------------------------

create or replace function create_goal_for_patient(
  p_patient_id uuid,
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
  v_cycle_id uuid;
  v_goal_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Only a physician (role 'clinician') may record a goal. A
  -- physiotherapist unlocking the same patient must not — they suggest
  -- goals through physio_goal_suggestion, which is inspiration only.
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
    approved_by_clinician_id, status
  ) values (
    null, p_patient_id, v_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    trim(p_nrs_question), p_nrs_direction,
    p_nrs_cut_low_low, p_nrs_cut_low, p_nrs_cut_zero, p_nrs_cut_high,
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

revoke all on function create_goal_for_patient(uuid, text, text, text, nrs_direction, int, int, int, int) from public;
grant execute on function create_goal_for_patient(uuid, text, text, text, nrs_direction, int, int, int, int) to authenticated;
