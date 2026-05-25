-- ============================================================================
-- 0041 — Physician archives a goal that is no longer relevant.
--
-- Goals become irrelevant over time — achieved, or overtaken by a
-- change in the patient's situation. A patient should not keep doing
-- weekly check-ins on a goal that no longer matters.
--
-- approved_goal already has a `status` enum ('active', 'archived',
-- 'combined'). This migration adds the RPC that moves a goal to
-- 'archived'. It does NOT delete anything: the goal's check-in history
-- is real clinical data and stays in the record and in exports. An
-- archived goal simply stops being active — the check-in already
-- filters to status = 'active', so an archived goal drops out of the
-- patient's weekly check-in automatically.
--
-- Physician-only, mirroring create_goal_for_patient (0035): the
-- physician owns goal approval, so the physician owns retiring goals.
-- A physiotherapist unlocking the same patient cannot archive a goal.
-- ============================================================================

create or replace function archive_goal(
  p_goal_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_patient_id uuid;
  v_status approved_goal_status;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Only a physician (role 'clinician') may archive a goal.
  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can archive a goal';
  end if;

  -- Resolve the goal's patient and current status.
  select patient_id, status
    into v_patient_id, v_status
    from approved_goal
   where id = p_goal_id;

  if v_patient_id is null then
    raise exception 'goal not found';
  end if;

  -- The physician must have an active unlocked session for this patient.
  if not clinician_can_access_patient(v_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- Only an active goal can be archived. Re-archiving an already
  -- archived goal is a no-op rather than an error, so a double-tap or
  -- a stale screen does not surface a confusing failure.
  if v_status = 'archived' then
    return;
  end if;
  if v_status <> 'active' then
    raise exception 'only an active goal can be archived';
  end if;

  update approved_goal
     set status = 'archived'
   where id = p_goal_id;
end;
$$;

comment on function archive_goal(uuid) is
  'Physician-only: moves an active goal to archived status. Preserves '
  'all check-in history. The patient check-in filters to active goals, '
  'so an archived goal drops out of future check-ins.';
