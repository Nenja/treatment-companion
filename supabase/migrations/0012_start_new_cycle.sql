-- ============================================================================
-- 0012 — start_new_cycle RPC.
--
-- Atomically:
--   1. Marks the patient's currently-active cycle as 'completed'
--   2. Creates a new active cycle, cycle_number = previous + 1
--   3. Seeds 16 pending weekly prompts (the soft cap for botox cycles)
--
-- Called by the clinician from the patient view. Does NOT create the
-- treatment session itself — the clinician records that immediately
-- after (the UI navigates straight into the treatment form pre-filled
-- with the new cycle's start date).
-- ============================================================================

create or replace function start_new_cycle(
  p_patient_id uuid,
  p_treatment_date date
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_prev_cycle_number int;
  v_new_cycle_id uuid;
  v_week int;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- Close the current active cycle (if one exists)
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

  -- Create the new cycle
  insert into treatment_cycle (
    patient_id, cycle_number, start_date, status
  ) values (
    p_patient_id, v_prev_cycle_number + 1, p_treatment_date, 'active'
  ) returning id into v_new_cycle_id;

  -- Seed 16 weekly prompts (the soft cap for botox cycles)
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

  return v_new_cycle_id;
end;
$$;

revoke all on function start_new_cycle(uuid, date) from public;
grant execute on function start_new_cycle(uuid, date) to authenticated;
