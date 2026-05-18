-- ============================================================================
-- 0009 — Move guidance technique from per-muscle to session-level.
--
-- A treatment session uses one guidance technique throughout (EMG, US,
-- US+EMG, etc.). The previous per-muscle column was redundant — every
-- row in a given session had the same value. Moving it to the session
-- row reflects clinical reality.
--
-- Drops:
--   - muscle_injection.guidance
-- Adds:
--   - treatment_session.guidance
--
-- Recreates:
--   - muscle_injection_input composite type (without guidance)
--   - save_treatment_session RPC (with session-level guidance param)
-- ============================================================================

-- 1. Add the new column at session level. Default to 'ultrasound' for
--    any existing rows so the NOT NULL constraint succeeds; in this
--    dev environment there's at most one session per cycle.
alter table treatment_session
  add column if not exists guidance guidance_method not null default 'ultrasound';

-- Drop the default so future rows must supply guidance explicitly.
alter table treatment_session
  alter column guidance drop default;

-- 2. Drop the per-muscle column.
alter table muscle_injection
  drop column if exists guidance;

-- 3. Recreate the input type without guidance.
drop function if exists save_treatment_session(
  uuid, date, text, numeric, text, text, muscle_injection_input[]
);
drop type if exists muscle_injection_input;

create type muscle_injection_input as (
  muscle text,
  side injection_side,
  dose_units numeric,
  note text
);

create or replace function save_treatment_session(
  p_treatment_cycle_id uuid,
  p_date date,
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
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    v_cycle.patient_id, p_treatment_cycle_id, p_date,
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

  return v_session_id;
end;
$$;

revoke all on function save_treatment_session(uuid, date, text, numeric, text, guidance_method, text, muscle_injection_input[]) from public;
grant execute on function save_treatment_session(uuid, date, text, numeric, text, guidance_method, text, muscle_injection_input[]) to authenticated;
