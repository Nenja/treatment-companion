-- 0085_cycle_agnostic_physio_suggestions.sql
-- ---------------------------------------------------------------------------
-- Cycle-agnostic therapist suggestions (audit follow-up; mirrors the patient
-- fix in 0081). A therapist working with a patient before the first injection
-- cycle (or in the gap between cycles) could not suggest a goal or flag a
-- muscle — the RPCs hard-raised "patient has no active treatment cycle". Now
-- the cycle is optional: the suggestion still records during an active session
-- (the consent gate is unchanged), and simply carries a null cycle when there
-- isn't one. The physician's review surface picks up null-cycle suggestions
-- alongside the current cycle's (handled in the app read).
-- ---------------------------------------------------------------------------

alter table physio_goal_suggestion
  alter column treatment_cycle_id drop not null;
alter table physio_muscle_suggestion
  alter column treatment_cycle_id drop not null;

-- ── Goal suggestion: resolve active cycle, do not raise when absent ─────────
create or replace function submit_physio_goal_suggestion(
  p_patient_id uuid,
  p_suggested_goal text,
  p_rationale text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_physio_id uuid;
  v_cycle_id uuid;
  v_suggestion_id uuid;
begin
  if current_app_role() <> 'physiotherapist' then
    raise exception 'caller is not a physiotherapist';
  end if;

  v_physio_id := current_clinician_id();
  if v_physio_id is null then
    raise exception 'no professional record for caller';
  end if;

  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  if p_suggested_goal is null or length(trim(p_suggested_goal)) = 0 then
    raise exception 'suggested goal is required';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'rationale is required';
  end if;

  -- Resolve the active cycle if there is one; null is allowed (pre-cycle).
  select id into v_cycle_id
    from treatment_cycle
   where patient_id = p_patient_id and status = 'active'
   order by cycle_number desc
   limit 1;

  insert into physio_goal_suggestion (
    patient_id, treatment_cycle_id, physiotherapist_id,
    suggested_goal, rationale
  ) values (
    p_patient_id, v_cycle_id, v_physio_id,
    trim(p_suggested_goal), trim(p_rationale)
  ) returning id into v_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'physiotherapist', 'physio_goal_suggestion_submitted',
    'physio_goal_suggestion', v_suggestion_id::text
  );

  return v_suggestion_id;
end;
$$;

-- ── Muscle suggestion: resolve active cycle, do not raise when absent ───────
create or replace function submit_physio_muscle_suggestion(
  p_patient_id uuid,
  p_muscle text,
  p_side injection_side,
  p_rationale text,
  p_related_goal_id uuid default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_physio_id uuid;
  v_cycle_id uuid;
  v_suggestion_id uuid;
  v_goal_patient uuid;
begin
  if current_app_role() <> 'physiotherapist' then
    raise exception 'caller is not a physiotherapist';
  end if;

  v_physio_id := current_clinician_id();
  if v_physio_id is null then
    raise exception 'no professional record for caller';
  end if;

  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  if p_muscle is null or length(trim(p_muscle)) = 0 then
    raise exception 'muscle is required';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'rationale is required';
  end if;

  if p_related_goal_id is not null then
    select patient_id into v_goal_patient
      from approved_goal where id = p_related_goal_id;
    if v_goal_patient is null then
      raise exception 'related goal not found';
    end if;
    if v_goal_patient <> p_patient_id then
      raise exception 'related goal does not belong to this patient';
    end if;
  end if;

  select id into v_cycle_id
    from treatment_cycle
   where patient_id = p_patient_id and status = 'active'
   order by cycle_number desc
   limit 1;

  insert into physio_muscle_suggestion (
    patient_id, treatment_cycle_id, physiotherapist_id,
    muscle, side, rationale, related_goal_id
  ) values (
    p_patient_id, v_cycle_id, v_physio_id,
    trim(p_muscle), p_side, trim(p_rationale), p_related_goal_id
  ) returning id into v_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'physiotherapist', 'physio_muscle_suggestion_submitted',
    'physio_muscle_suggestion', v_suggestion_id::text
  );

  return v_suggestion_id;
end;
$$;
