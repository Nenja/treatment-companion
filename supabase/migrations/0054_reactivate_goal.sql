-- ============================================================================
-- 0054 — Reactivate a retired goal.
--
-- Retiring a goal (0051) sets status = 'archived' and records a
-- goal_outcome. Sometimes that was a mistake — the wrong goal was
-- retired, or it was retired prematurely. This adds the reverse: move
-- an archived goal back to 'active' and clear its outcome, so it
-- reappears in the patient's check-ins and looks untouched again.
--
-- Scope note: the clinician patient view only shows archived goals from
-- the *current* cycle, so reactivation returns a goal to the active set
-- of the same cycle it already belonged to — there is no cross-cycle
-- resurrection. The RPC still guards against reactivating a goal from a
-- non-active cycle, defensively.
--
-- Physician-only, mirroring retire_goal: the physician owns goal
-- lifecycle. A physiotherapist cannot reactivate a goal.
-- ============================================================================

create or replace function reactivate_goal(
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
  v_cycle_id uuid;
  v_cycle_status cycle_status;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Physician (role 'clinician') only.
  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can reactivate a goal';
  end if;

  select patient_id, status, treatment_cycle_id
    into v_patient_id, v_status, v_cycle_id
    from approved_goal
   where id = p_goal_id;

  if v_patient_id is null then
    raise exception 'goal not found';
  end if;

  -- The physician must have an active unlocked session for this patient.
  if not clinician_can_access_patient(v_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- Only an archived goal can be reactivated. (A no-op on an already
  -- active goal would be harmless, but we surface it rather than hide
  -- a possible mistake.)
  if v_status <> 'archived' then
    raise exception 'only an archived goal can be reactivated';
  end if;

  -- Defensive: the goal's cycle must still be active. Reactivating a
  -- goal into a completed cycle would put it in a context that no
  -- longer accepts check-ins.
  select status into v_cycle_status
    from treatment_cycle
   where id = v_cycle_id;

  if v_cycle_status is distinct from 'active' then
    raise exception 'cannot reactivate a goal in a non-active cycle';
  end if;

  -- Reverse the retirement: active again, outcome cleared.
  update approved_goal
     set status = 'active',
         goal_outcome = null
   where id = p_goal_id;
end;
$$;

comment on function reactivate_goal(uuid) is
  'Physician-only: reverses a goal retirement. Sets status back to '
  'active and clears goal_outcome, so the goal returns to the patient''s '
  'check-ins. Only valid for an archived goal in an active cycle.';
