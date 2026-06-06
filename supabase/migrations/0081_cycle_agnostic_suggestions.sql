-- 0081_cycle_agnostic_suggestions.sql
-- ---------------------------------------------------------------------------
-- Let a patient suggest goals BEFORE their first clinical visit.
--
-- Two cold-start blockers existed:
--   1. A self-registered patient had a `profile` but no `patient` row
--      (patient rows were only created clinic-side / by seeds), so
--      current_patient_id() returned null and the suggestion-insert RLS
--      check (patient_id = current_patient_id()) could never pass.
--   2. goal_suggestion required a treatment_cycle_id, and a brand-new
--      patient has no cycle.
--
-- A suggestion is only a proposal awaiting clinician approval, so it does
-- not need a cycle. Tracking still requires an APPROVED goal, and approval
-- assigns the patient's active cycle at that moment — so nothing is trackable
-- until a clinician approves it into a real cycle.
-- ---------------------------------------------------------------------------

-- 1. Every patient profile gets a patient row. A trigger on profile inserts
--    one whenever a patient profile is created (the signup trigger creates
--    the profile; this fires right after), and we backfill existing ones.
create or replace function ensure_patient_row()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if new.role = 'patient' then
    insert into patient (profile_id)
    values (new.id)
    on conflict (profile_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_created_patient on profile;
create trigger on_profile_created_patient
  after insert on profile
  for each row execute function ensure_patient_row();

-- Backfill: existing patient profiles that never got a patient row.
insert into patient (profile_id)
select id from profile where role = 'patient'
on conflict (profile_id) do nothing;

-- 2. A suggestion no longer needs a cycle.
alter table goal_suggestion
  alter column treatment_cycle_id drop not null;

comment on column goal_suggestion.treatment_cycle_id is
  'Optional. A patient may suggest a goal before any cycle exists; the cycle '
  'is assigned when a clinician approves the suggestion into an approved_goal.';

-- 3. Approval resolves the patient''s active cycle when the suggestion has
--    none. Both approval RPCs are replaced with the same signature (only the
--    cycle resolution + the approved_goal insert change).

-- 3a. NRS approval (was 0014).
create or replace function approve_suggestion(
  p_suggestion_id uuid,
  p_patient_facing_text text,
  p_smart_text text,
  p_nrs_question text,
  p_nrs_direction nrs_direction,
  p_nrs_cut_low_low int,
  p_nrs_cut_low int,
  p_nrs_cut_zero int,
  p_nrs_cut_high int
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_suggestion record;
  v_cycle_id uuid;
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

  -- Resolve the cycle to track in: the suggestion's own, else the patient's
  -- active cycle. A goal can only be approved into an existing active cycle.
  v_cycle_id := v_suggestion.treatment_cycle_id;
  if v_cycle_id is null then
    select id into v_cycle_id
      from treatment_cycle
     where patient_id = v_suggestion.patient_id and status = 'active'
     order by cycle_number desc
     limit 1;
  end if;
  if v_cycle_id is null then
    raise exception 'no active treatment cycle to approve this goal into';
  end if;

  if not (
    p_nrs_cut_low_low < p_nrs_cut_low
    and p_nrs_cut_low < p_nrs_cut_zero
    and p_nrs_cut_zero < p_nrs_cut_high
  ) then
    raise exception 'cut points must be strictly increasing';
  end if;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion.id, v_suggestion.patient_id, v_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    trim(p_nrs_question), p_nrs_direction,
    p_nrs_cut_low_low, p_nrs_cut_low, p_nrs_cut_zero, p_nrs_cut_high,
    v_clinician_id, 'active'
  ) returning id into v_goal_id;

  update goal_suggestion set status = 'active' where id = p_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'suggestion_approved', 'approved_goal',
    v_goal_id::text
  );

  return v_goal_id;
end;
$$;

-- 3b. GAS approval (was 0067).
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
  v_cycle_id uuid;
  v_goal_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

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

  v_cycle_id := v_suggestion.treatment_cycle_id;
  if v_cycle_id is null then
    select id into v_cycle_id
      from treatment_cycle
     where patient_id = v_suggestion.patient_id and status = 'active'
     order by cycle_number desc
     limit 1;
  end if;
  if v_cycle_id is null then
    raise exception 'no active treatment cycle to approve this goal into';
  end if;

  if p_patient_facing_text is null
     or length(trim(p_patient_facing_text)) = 0 then
    raise exception 'goal text is required';
  end if;

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
    v_suggestion.id, v_suggestion.patient_id, v_cycle_id,
    trim(p_patient_facing_text), trim(p_smart_text),
    'gas',
    trim(p_anchor_minus2), trim(p_anchor_minus1), trim(p_anchor_zero),
    trim(p_anchor_plus1), trim(p_anchor_plus2),
    v_clinician_id, 'active'
  ) returning id into v_goal_id;

  update goal_suggestion set status = 'active' where id = p_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'suggestion_approved', 'approved_goal',
    v_goal_id::text
  );

  return v_goal_id;
end;
$$;
