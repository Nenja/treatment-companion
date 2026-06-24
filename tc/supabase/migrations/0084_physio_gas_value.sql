-- 0084_physio_gas_value.sql
-- ---------------------------------------------------------------------------
-- GAS-aware therapist rating. Until now the therapist rated every goal on a
-- 0–10 NRS scale, even GAS goals — which then had to be cast to a −2..+2
-- level (lossy and unanchored). This adds a dedicated gas_value so the
-- therapist rates a GAS goal against its outcome levels directly, exactly as
-- the patient and clinician do. NRS goals keep using nrs_value; GAS goals use
-- gas_value; a flag-only row uses neither.
-- ---------------------------------------------------------------------------

alter table physio_goal_rating
  add column if not exists gas_value int check (gas_value between -2 and 2);

comment on column physio_goal_rating.gas_value is
  'GAS outcome level (−2..+2) for GAS goals, rated against the goal''s anchors. '
  'NULL for NRS goals (which use nrs_value) and for flag-only rows.';

-- Extended ratings input (adds gas_value alongside the slice-1 signals).
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'physio_goal_rating_input_v3'
  ) then
    create type physio_goal_rating_input_v3 as (
      approved_goal_id uuid,
      nrs_value int,
      gas_value int,
      working_on boolean,
      needs_adjustment boolean,
      adjustment_note text
    );
  end if;
end$$;

drop function if exists submit_physio_assessment(
  uuid, date, text, physio_goal_rating_input_v2[]
);

create or replace function submit_physio_assessment(
  p_patient_id uuid,
  p_date date,
  p_note text,
  p_ratings physio_goal_rating_input_v3[]
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_physio_id uuid;
  v_cycle_id uuid;
  v_assessment_id uuid;
  v_rating physio_goal_rating_input_v3;
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

  select id into v_cycle_id
    from treatment_cycle
   where patient_id = p_patient_id and status = 'active'
   order by cycle_number desc
   limit 1;
  if v_cycle_id is null then
    raise exception 'patient has no active treatment cycle';
  end if;

  insert into physio_assessment (
    patient_id, treatment_cycle_id, physiotherapist_id, assessment_date, note
  ) values (
    p_patient_id, v_cycle_id, v_physio_id, p_date, nullif(trim(p_note), '')
  ) returning id into v_assessment_id;

  foreach v_rating in array p_ratings loop
    if v_rating.nrs_value is not null
       and (v_rating.nrs_value < 0 or v_rating.nrs_value > 10) then
      raise exception 'NRS value out of range: %', v_rating.nrs_value;
    end if;
    if v_rating.gas_value is not null
       and (v_rating.gas_value < -2 or v_rating.gas_value > 2) then
      raise exception 'GAS value out of range: %', v_rating.gas_value;
    end if;

    select patient_id into v_goal_patient
      from approved_goal where id = v_rating.approved_goal_id;
    if v_goal_patient is null then
      raise exception 'goal not found: %', v_rating.approved_goal_id;
    end if;
    if v_goal_patient <> p_patient_id then
      raise exception 'goal does not belong to this patient';
    end if;

    insert into physio_goal_rating (
      physio_assessment_id, approved_goal_id, nrs_value, gas_value,
      working_on, needs_adjustment, adjustment_note
    ) values (
      v_assessment_id, v_rating.approved_goal_id,
      v_rating.nrs_value, v_rating.gas_value,
      coalesce(v_rating.working_on, false),
      coalesce(v_rating.needs_adjustment, false),
      nullif(trim(coalesce(v_rating.adjustment_note, '')), '')
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

revoke all on function submit_physio_assessment(
  uuid, date, text, physio_goal_rating_input_v3[]
) from public;
grant execute on function submit_physio_assessment(
  uuid, date, text, physio_goal_rating_input_v3[]
) to authenticated;
