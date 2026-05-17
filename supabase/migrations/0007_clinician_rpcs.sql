-- ============================================================================
-- 0007 — Clinician-side RPCs.
--
-- Three operations from the clinician's "review a patient" workflow:
--   - approve_suggestion         : turn a suggestion into an approved goal
--   - set_suggestion_status      : defer / combine / mark not suitable
--   - save_treatment_session     : write the cycle's treatment record
--
-- Each runs as the authenticated user (security definer with role
-- checks). They all require an active clinician_session for the
-- patient — enforced by reusing the clinician_can_access_patient()
-- helper from 0002.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- approve_suggestion
--
-- Inserts an approved_goal row with the five GAS anchors, the patient-
-- facing text, and the clinician-only SMART text. Updates the source
-- suggestion's status to 'active' so it disappears from the "needs
-- review" list.
-- ---------------------------------------------------------------------------

create or replace function approve_suggestion(
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

  -- Insert the approved goal.
  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2,
    approved_by_clinician_id, status
  ) values (
    v_suggestion.id, v_suggestion.patient_id, v_suggestion.treatment_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    trim(p_anchor_minus2), trim(p_anchor_minus1), trim(p_anchor_zero),
    trim(p_anchor_plus1), trim(p_anchor_plus2),
    v_clinician_id, 'active'
  ) returning id into v_goal_id;

  -- Mark the suggestion as active (its goal is now live).
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

revoke all on function approve_suggestion(uuid, text, text, text, text, text, text, text) from public;
grant execute on function approve_suggestion(uuid, text, text, text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- set_suggestion_status
--
-- Used for the non-approval outcomes from the clinician's review:
-- discuss at next visit, combined with another, not suitable this cycle.
-- ---------------------------------------------------------------------------

create or replace function set_suggestion_status(
  p_suggestion_id uuid,
  p_status suggestion_status
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_suggestion record;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Forbid using this for 'active' — that path goes through approve_suggestion.
  if p_status = 'active' then
    raise exception 'use approve_suggestion to move a suggestion to active';
  end if;

  select id, patient_id into v_suggestion
    from goal_suggestion
   where id = p_suggestion_id;

  if v_suggestion is null then
    raise exception 'suggestion not found';
  end if;

  if not clinician_can_access_patient(v_suggestion.patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update goal_suggestion
     set status = p_status
   where id = p_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'suggestion_status_updated', 'goal_suggestion',
    p_suggestion_id::text
  );
end;
$$;

revoke all on function set_suggestion_status(uuid, suggestion_status) from public;
grant execute on function set_suggestion_status(uuid, suggestion_status) to authenticated;

-- ---------------------------------------------------------------------------
-- save_treatment_session
--
-- One session per cycle. Inserts (or replaces) the treatment_session
-- row and all its muscle_injection rows. If a session already exists
-- for the cycle, it's replaced (cascade-deletes its injections, then
-- inserts the new ones).
-- ---------------------------------------------------------------------------

create type muscle_injection_input as (
  muscle text,
  side injection_side,
  dose_units numeric,
  guidance guidance_method
);

create or replace function save_treatment_session(
  p_treatment_cycle_id uuid,
  p_date date,
  p_drug_product text,
  p_total_units numeric,
  p_dilution text,
  p_notes text,
  p_injections muscle_injection_input[]
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_cycle record;
  v_session_id uuid;
  v_injection muscle_injection_input;
  v_position int := 0;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  select id, patient_id into v_cycle
    from treatment_cycle
   where id = p_treatment_cycle_id;

  if v_cycle is null then
    raise exception 'treatment cycle not found';
  end if;

  if not clinician_can_access_patient(v_cycle.patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- Remove any existing session for this cycle. The CASCADE on
  -- muscle_injection.treatment_session_id wipes its injections too.
  delete from treatment_session where treatment_cycle_id = p_treatment_cycle_id;

  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, notes, recorded_by_clinician_id
  ) values (
    v_cycle.patient_id, p_treatment_cycle_id, p_date,
    trim(p_drug_product), p_total_units,
    nullif(trim(coalesce(p_dilution, '')), ''),
    nullif(trim(coalesce(p_notes, '')), ''),
    v_clinician_id
  ) returning id into v_session_id;

  foreach v_injection in array p_injections loop
    insert into muscle_injection (
      treatment_session_id, muscle, side, dose_units, guidance, position
    ) values (
      v_session_id, trim(v_injection.muscle), v_injection.side,
      v_injection.dose_units, v_injection.guidance, v_position
    );
    v_position := v_position + 1;
  end loop;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'treatment_session_saved', 'treatment_session',
    v_session_id::text
  );

  return v_session_id;
end;
$$;

revoke all on function save_treatment_session(uuid, date, text, numeric, text, text, muscle_injection_input[]) from public;
grant execute on function save_treatment_session(uuid, date, text, numeric, text, text, muscle_injection_input[]) to authenticated;
