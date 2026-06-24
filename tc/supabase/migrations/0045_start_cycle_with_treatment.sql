-- ============================================================================
-- 0045 — start_cycle_with_treatment (atomic new-cycle + treatment).
--
-- THE BUG THIS FIXES:
--   Previously, confirming the "start new cycle" dialog called
--   start_new_cycle() immediately — creating the cycle (and closing the
--   previous one) BEFORE the clinician recorded the treatment. If they
--   then cancelled the treatment form, the new cycle was already
--   committed: an empty cycle with no treatment, and the previous cycle
--   left closed. Cancelling could not undo it.
--
-- THE FIX:
--   This function does the whole operation in ONE transaction, called
--   only when the treatment is actually recorded:
--     1. close the current active cycle
--     2. create the new cycle
--     3. seed its 16 weekly prompts
--     4. save the treatment session + muscle injections
--   Because it is one atomic function, nothing commits unless the
--   treatment records successfully. Cancelling the form beforehand
--   calls nothing, so no cycle is ever created prematurely.
--
--   start_new_cycle() and save_treatment_session() are LEFT IN PLACE —
--   save_treatment_session is still used to EDIT the current cycle's
--   treatment (which must not create a new cycle). This function is
--   only for the "start a new cycle" path.
--
-- Mirrors the exact logic of start_new_cycle (0012) + save_treatment_
-- session (0009), fused. Keep them in sync if either changes.
-- ============================================================================

create or replace function start_cycle_with_treatment(
  p_patient_id uuid,
  p_treatment_date date,
  p_drug_product text,
  p_total_units numeric,
  p_dilution text,
  p_guidance guidance_method,
  p_notes text,
  p_injections muscle_injection_input[]
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_prev_cycle_number int;
  v_new_cycle_id uuid;
  v_session_id uuid;
  v_week int;
  v_injection muscle_injection_input;
  v_position int := 0;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- 1. Close the current active cycle (if one exists).
  select cycle_number into v_prev_cycle_number
    from treatment_cycle
   where patient_id = p_patient_id
     and status = 'active'
   order by cycle_number desc
   limit 1
   for update;

  if v_prev_cycle_number is not null then
    update treatment_cycle
       set status = 'completed'
     where patient_id = p_patient_id
       and cycle_number = v_prev_cycle_number;
  else
    v_prev_cycle_number := 0;
  end if;

  -- 2. Create the new cycle.
  insert into treatment_cycle (
    patient_id, cycle_number, start_date, status
  ) values (
    p_patient_id, v_prev_cycle_number + 1, p_treatment_date, 'active'
  ) returning id into v_new_cycle_id;

  -- 3. Seed 16 weekly prompts.
  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      p_patient_id, v_new_cycle_id, v_week,
      p_treatment_date + (v_week * 7), 'pending'
    );
  end loop;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'cycle_started', 'treatment_cycle',
    v_new_cycle_id::text
  );

  -- 4. Save the treatment session into the new cycle.
  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    p_patient_id, v_new_cycle_id, p_treatment_date,
    trim(p_drug_product), p_total_units,
    nullif(trim(coalesce(p_dilution, '')), ''),
    p_guidance,
    nullif(trim(coalesce(p_notes, '')), ''),
    v_clinician_id
  ) returning id into v_session_id;

  foreach v_injection in array p_injections loop
    insert into muscle_injection (
      treatment_session_id, muscle, side, dose_units, note, position
    ) values (
      v_session_id, trim(v_injection.muscle), v_injection.side,
      v_injection.dose_units,
      nullif(trim(coalesce(v_injection.note, '')), ''),
      v_position
    );
    v_position := v_position + 1;
  end loop;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'treatment_session_saved', 'treatment_session',
    v_session_id::text
  );

  return v_new_cycle_id;
end;
$$;

revoke all on function start_cycle_with_treatment(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[]
) from public;
grant execute on function start_cycle_with_treatment(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[]
) to authenticated;
