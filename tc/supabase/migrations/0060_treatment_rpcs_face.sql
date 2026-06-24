-- ============================================================================
-- 0060 — Treatment RPCs: area flags + face marks.
--
-- Extends start_cycle_with_treatment and save_treatment_session to:
--   * accept the cycle area flags (p_includes_standard, p_includes_face)
--     and the face display mode (p_face_display_mode),
--   * accept a SEPARATE array of face marks (p_face_marks), which are
--     located muscle injections (Option A: a face mark IS a muscle
--     injection with pos_x/pos_y).
--
-- Standard injections (p_injections) are stored exactly as before, with
-- pos_x/pos_y NULL. Face marks are stored in the same muscle_injection
-- table WITH pos_x/pos_y set.
--
-- New composite input type face_mark_input carries the position. We add
-- NEW function overloads rather than mutating the existing signatures
-- (Postgres can't easily ALTER a composite type that is used in a
-- function signature). The OLD signatures are dropped at the end so the
-- name resolves unambiguously to the new versions.
-- ============================================================================

create type face_mark_input as (
  muscle text,
  side injection_side,
  dose_units numeric,
  note text,
  pos_x numeric,
  pos_y numeric
);

-- ----------------------------------------------------------------------------
-- start_cycle_with_treatment (new signature)
-- ----------------------------------------------------------------------------
create or replace function start_cycle_with_treatment(
  p_patient_id uuid,
  p_treatment_date date,
  p_drug_product text,
  p_total_units numeric,
  p_dilution text,
  p_guidance guidance_method,
  p_notes text,
  p_injections muscle_injection_input[],
  p_includes_standard boolean,
  p_includes_face boolean,
  p_face_display_mode face_display_mode,
  p_face_marks face_mark_input[]
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
  v_mark face_mark_input;
  v_position int := 0;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  if not (coalesce(p_includes_standard, false) or coalesce(p_includes_face, false)) then
    raise exception 'a treatment must include at least one area (standard or face)';
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

  -- 2. Create the new cycle (with area flags + display mode).
  insert into treatment_cycle (
    patient_id, cycle_number, start_date, status,
    includes_standard, includes_face, face_display_mode
  ) values (
    p_patient_id, v_prev_cycle_number + 1, p_treatment_date, 'active',
    coalesce(p_includes_standard, true),
    coalesce(p_includes_face, false),
    coalesce(p_face_display_mode, 'color')
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

  -- 4a. Standard injections (no position).
  if p_injections is not null then
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
  end if;

  -- 4b. Face marks (located injections).
  if p_face_marks is not null then
    foreach v_mark in array p_face_marks loop
      insert into muscle_injection (
        treatment_session_id, muscle, side, dose_units, note, position,
        pos_x, pos_y
      ) values (
        v_session_id, trim(v_mark.muscle), v_mark.side,
        v_mark.dose_units,
        nullif(trim(coalesce(v_mark.note, '')), ''),
        v_position, v_mark.pos_x, v_mark.pos_y
      );
      v_position := v_position + 1;
    end loop;
  end if;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'treatment_session_saved', 'treatment_session',
    v_session_id::text
  );

  return v_new_cycle_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- save_treatment_session (new signature) — edits the current cycle's
-- treatment. Also updates the cycle's area flags + display mode.
-- ----------------------------------------------------------------------------
create or replace function save_treatment_session(
  p_treatment_cycle_id uuid,
  p_date date,
  p_drug_product text,
  p_total_units numeric,
  p_dilution text,
  p_guidance guidance_method,
  p_notes text,
  p_injections muscle_injection_input[],
  p_includes_standard boolean,
  p_includes_face boolean,
  p_face_display_mode face_display_mode,
  p_face_marks face_mark_input[]
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
  v_mark face_mark_input;
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

  if not (coalesce(p_includes_standard, false) or coalesce(p_includes_face, false)) then
    raise exception 'a treatment must include at least one area (standard or face)';
  end if;

  update treatment_cycle
     set includes_standard = coalesce(p_includes_standard, true),
         includes_face = coalesce(p_includes_face, false),
         face_display_mode = coalesce(p_face_display_mode, 'color')
   where id = p_treatment_cycle_id;

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

  if p_injections is not null then
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
  end if;

  if p_face_marks is not null then
    foreach v_mark in array p_face_marks loop
      insert into muscle_injection (
        treatment_session_id, muscle, side, dose_units, note, position,
        pos_x, pos_y
      ) values (
        v_session_id, trim(v_mark.muscle), v_mark.side,
        v_mark.dose_units,
        nullif(trim(coalesce(v_mark.note, '')), ''),
        v_position, v_mark.pos_x, v_mark.pos_y
      );
      v_position := v_position + 1;
    end loop;
  end if;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'treatment_session_saved', 'treatment_session',
    v_session_id::text
  );

  return v_session_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Drop the OLD signatures so the function name resolves to the new ones.
-- ----------------------------------------------------------------------------
drop function if exists start_cycle_with_treatment(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[]
);
drop function if exists save_treatment_session(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[]
);

-- Grants for the new signatures.
revoke all on function start_cycle_with_treatment(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[], boolean, boolean, face_display_mode, face_mark_input[]
) from public;
grant execute on function start_cycle_with_treatment(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[], boolean, boolean, face_display_mode, face_mark_input[]
) to authenticated;

revoke all on function save_treatment_session(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[], boolean, boolean, face_display_mode, face_mark_input[]
) from public;
grant execute on function save_treatment_session(
  uuid, date, text, numeric, text, guidance_method, text,
  muscle_injection_input[], boolean, boolean, face_display_mode, face_mark_input[]
) to authenticated;
