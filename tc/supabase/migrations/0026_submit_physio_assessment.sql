-- ============================================================================
-- 0026 — submit_physio_assessment RPC.
--
-- Atomically creates a physio_assessment plus its per-goal ratings.
-- The physiotherapist must have an active unlock for the patient.
--
-- Input:
--   p_patient_id   — the patient being assessed
--   p_date         — date of the physio visit
--   p_note         — visit-level clinical note (nullable)
--   p_ratings      — array of (approved_goal_id, nrs_value); goals the
--                    physio skipped are simply absent from the array
--
-- Returns the new physio_assessment id.
-- ============================================================================

-- Reuse a composite type for the ratings input. weekly_nrs_rating_input
-- already has exactly the shape we need (approved_goal_id, nrs_value),
-- but to keep the physio path independent we define our own so a future
-- change to one doesn't silently affect the other.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'physio_goal_rating_input') then
    create type physio_goal_rating_input as (
      approved_goal_id uuid,
      nrs_value int
    );
  end if;
end $$;

create or replace function submit_physio_assessment(
  p_patient_id uuid,
  p_date date,
  p_note text,
  p_ratings physio_goal_rating_input[]
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_physio_id uuid;
  v_cycle_id uuid;
  v_assessment_id uuid;
  v_rating physio_goal_rating_input;
  v_goal_patient uuid;
begin
  -- Caller must be a physiotherapist.
  if current_app_role() <> 'physiotherapist' then
    raise exception 'caller is not a physiotherapist';
  end if;

  -- ...with a `clinician` table row (the unlocking-professional id).
  v_physio_id := current_clinician_id();
  if v_physio_id is null then
    raise exception 'no professional record for caller';
  end if;

  -- ...and an active unlock for this patient.
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- Resolve the patient's active treatment cycle.
  select id into v_cycle_id
    from treatment_cycle
   where patient_id = p_patient_id
     and status = 'active'
   order by cycle_number desc
   limit 1;

  if v_cycle_id is null then
    raise exception 'patient has no active treatment cycle';
  end if;

  -- Create the assessment.
  insert into physio_assessment (
    patient_id, treatment_cycle_id, physiotherapist_id,
    assessment_date, note
  ) values (
    p_patient_id, v_cycle_id, v_physio_id,
    p_date, nullif(trim(p_note), '')
  ) returning id into v_assessment_id;

  -- Insert each per-goal rating. Validate the goal belongs to this
  -- patient so a caller can't attach a rating to someone else's goal.
  foreach v_rating in array p_ratings loop
    if v_rating.nrs_value < 0 or v_rating.nrs_value > 10 then
      raise exception 'NRS value out of range: %', v_rating.nrs_value;
    end if;

    select patient_id into v_goal_patient
      from approved_goal
     where id = v_rating.approved_goal_id;

    if v_goal_patient is null then
      raise exception 'goal not found: %', v_rating.approved_goal_id;
    end if;
    if v_goal_patient <> p_patient_id then
      raise exception 'goal does not belong to this patient';
    end if;

    insert into physio_goal_rating (
      physio_assessment_id, approved_goal_id, nrs_value
    ) values (
      v_assessment_id, v_rating.approved_goal_id, v_rating.nrs_value
    );
  end loop;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'physiotherapist', 'physio_assessment_submitted',
    'physio_assessment', v_assessment_id::text
  );

  return v_assessment_id;
end;
$$;

revoke all on function submit_physio_assessment(uuid, date, text, physio_goal_rating_input[]) from public;
grant execute on function submit_physio_assessment(uuid, date, text, physio_goal_rating_input[]) to authenticated;
