-- ============================================================================
-- 0008 — Per-muscle clinical note.
--
-- Allows the clinician to attach a short observation to each muscle row
-- in a treatment session (e.g. "high EMG activity", "minimal response").
-- Optional; free text; 200 char ceiling so it stays a note, not a
-- novella.
--
-- Also updates the muscle_injection_input composite type so the
-- save_treatment_session RPC accepts the new field.
-- ============================================================================

-- 1. Column on the table
alter table muscle_injection
  add column if not exists note text
    check (note is null or length(note) between 1 and 200);

-- 2. Replace the composite input type so the RPC accepts `note`.
--    Cannot ALTER TYPE ... ADD ATTRIBUTE on a type used in a function
--    signature; we drop+recreate. The function below depends on it so
--    we drop the function first, recreate the type, then re-create the
--    function with the same body but the new field handled.

drop function if exists save_treatment_session(
  uuid, date, text, numeric, text, text, muscle_injection_input[]
);
drop type if exists muscle_injection_input;

create type muscle_injection_input as (
  muscle text,
  side injection_side,
  dose_units numeric,
  guidance guidance_method,
  note text
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
      treatment_session_id, muscle, side, dose_units, guidance, note, position
    ) values (
      v_session_id, trim(v_injection.muscle), v_injection.side,
      v_injection.dose_units, v_injection.guidance,
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

  return v_session_id;
end;
$$;

revoke all on function save_treatment_session(uuid, date, text, numeric, text, text, muscle_injection_input[]) from public;
grant execute on function save_treatment_session(uuid, date, text, numeric, text, text, muscle_injection_input[]) to authenticated;
