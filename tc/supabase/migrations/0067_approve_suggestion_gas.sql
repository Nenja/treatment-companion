-- ============================================================================
-- 0067 — approve_suggestion_gas
--
-- A clinician can now approve a patient's goal suggestion as a GAS goal
-- (five descriptive anchors), not only as an NRS goal. This mirrors
-- approve_suggestion (0014) — same suggestion lookup, access check,
-- status flip, and audit event — but inserts a GAS approved_goal
-- (goal_kind = 'gas' with the five anchors) like create_gas_goal_for_patient
-- (0052) instead of an NRS goal.
--
-- Purely additive: approve_suggestion (the NRS path) is unchanged, and
-- nothing else is touched. The check-in pipeline is unaffected.
-- ============================================================================

create or replace function approve_suggestion_gas(
  p_suggestion_id uuid,
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
  v_suggestion record;
  v_goal_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Physician (role 'clinician') only — a physiotherapist suggests
  -- goals, never records them. Matches create_gas_goal_for_patient.
  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can record a goal';
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

  if p_patient_facing_text is null
     or length(trim(p_patient_facing_text)) = 0 then
    raise exception 'goal text is required';
  end if;

  -- All five anchors are required for a GAS goal (the table CHECK also
  -- enforces this; failing here gives a friendlier message).
  if p_anchor_minus2 is null or length(trim(p_anchor_minus2)) = 0
     or p_anchor_minus1 is null or length(trim(p_anchor_minus1)) = 0
     or p_anchor_zero  is null or length(trim(p_anchor_zero))  = 0
     or p_anchor_plus1 is null or length(trim(p_anchor_plus1)) = 0
     or p_anchor_plus2 is null or length(trim(p_anchor_plus2)) = 0 then
    raise exception 'all five GAS anchors are required';
  end if;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    goal_kind,
    anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2,
    approved_by_clinician_id, status
  ) values (
    v_suggestion.id, v_suggestion.patient_id, v_suggestion.treatment_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    'gas',
    trim(p_anchor_minus2), trim(p_anchor_minus1), trim(p_anchor_zero),
    trim(p_anchor_plus1), trim(p_anchor_plus2),
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

revoke all on function approve_suggestion_gas(
  uuid, text, text, text, text, text, text, text
) from public;
grant execute on function approve_suggestion_gas(
  uuid, text, text, text, text, text, text, text
) to authenticated;
