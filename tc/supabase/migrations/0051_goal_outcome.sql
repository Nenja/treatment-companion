-- ============================================================================
-- 0051 — Goal outcome on retirement (achieved / partial / no longer suitable)
--
-- Goals are living: reviewed and adjusted at every visit. When a goal
-- leaves the patient's active check-ins, *why* it left is clinically
-- meaningful and currently lost — archive_goal (0041) only ever set
-- status = 'archived', so "we achieved it and moved on to something
-- harder" looks identical to "it wasn't the right goal, we dropped it".
-- Those are different clinical events and the physician wants to tell
-- them apart (and, later, to see the climb of achieved goals over
-- cycles).
--
-- Design: keep `status` answering the orthogonal question "does this
-- goal show in check-ins" (active vs not). Add a SEPARATE nullable
-- `goal_outcome` column that records how a goal ended. Null while the
-- goal is active; set when it is retired. This leaves every existing
-- `status = 'active'` filter untouched (lower risk than overloading
-- the status enum with retirement reasons).
--
-- Outcomes:
--   'achieved'         — the goal was met
--   'partial'          — meaningful progress, but moving on
--   'noLongerSuitable' — reframed, dropped, or overtaken (the goal was
--                        not the right one / no longer relevant)
--
-- A retired goal still has status 'archived' (so it drops out of
-- check-ins exactly as before); goal_outcome adds the reason alongside.
-- Check-in history is preserved as always.
--
-- Physician-only, mirroring archive_goal: the physician owns goal
-- approval and retirement. A physiotherapist cannot retire a goal.
-- ============================================================================

-- The outcome enum.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'goal_outcome') then
    create type goal_outcome as enum (
      'achieved',
      'partial',
      'noLongerSuitable'
    );
  end if;
end$$;

-- The column — nullable, only set on retirement.
alter table approved_goal
  add column if not exists goal_outcome goal_outcome;

comment on column approved_goal.goal_outcome is
  'How the goal ended, set when it is retired: achieved / partial / '
  'noLongerSuitable. Null while the goal is active. Separate from '
  'status, which tracks active-vs-archived for check-in filtering.';

-- retire_goal — the outcome-aware replacement for archive_goal. Moves
-- the goal to 'archived' (so it leaves check-ins) AND records the
-- outcome. archive_goal is left in place for backward compatibility;
-- new UI uses retire_goal.
create or replace function retire_goal(
  p_goal_id uuid,
  p_outcome goal_outcome
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

  -- Physician (role 'clinician') only.
  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can retire a goal';
  end if;

  if p_outcome is null then
    raise exception 'an outcome is required to retire a goal';
  end if;

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

  -- Only an active goal can be retired. A double-tap or stale screen
  -- on an already-archived goal is a no-op (but still records/refreshes
  -- the outcome, so a correction of the chosen outcome is possible).
  if v_status = 'active' then
    update approved_goal
       set status = 'archived',
           goal_outcome = p_outcome
     where id = p_goal_id;
  elsif v_status = 'archived' then
    -- Allow updating the recorded outcome on an already-archived goal
    -- (e.g. the physician picked the wrong one and reopened the dialog).
    update approved_goal
       set goal_outcome = p_outcome
     where id = p_goal_id;
  else
    raise exception 'only an active or archived goal can be retired';
  end if;
end;
$$;

comment on function retire_goal(uuid, goal_outcome) is
  'Physician-only: retires a goal with an outcome (achieved / partial / '
  'noLongerSuitable). Sets status to archived so it leaves check-ins, '
  'and records goal_outcome. Preserves all check-in history.';
