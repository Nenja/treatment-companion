-- ============================================================================
-- 0030 — submit_physio_muscle_suggestion RPC.
--
-- Creates one physiotherapist muscle suggestion. The physiotherapist
-- must have an active unlock for the patient. The patient's active
-- treatment cycle is resolved server-side.
--
-- p_related_goal_id is optional (nullable). When provided it must be a
-- goal belonging to this patient, or the call is rejected.
--
-- Mirrors submit_physio_goal_suggestion's validation shape (0028).
-- ============================================================================

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

  -- If a goal link is supplied, it must belong to this patient.
  if p_related_goal_id is not null then
    select patient_id into v_goal_patient
      from approved_goal
     where id = p_related_goal_id;
    if v_goal_patient is null then
      raise exception 'related goal not found';
    end if;
    if v_goal_patient <> p_patient_id then
      raise exception 'related goal does not belong to this patient';
    end if;
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

revoke all on function submit_physio_muscle_suggestion(uuid, text, injection_side, text, uuid) from public;
grant execute on function submit_physio_muscle_suggestion(uuid, text, injection_side, text, uuid) to authenticated;
