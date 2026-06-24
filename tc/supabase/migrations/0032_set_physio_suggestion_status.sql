-- ============================================================================
-- 0032 — Physician acts on physiotherapist suggestions.
--
-- The physician reviews physiotherapist goal and muscle suggestions at
-- the injection visit and sets a status on each. Slices 3/4 gave the
-- physician read-only visibility; this adds the act-on-it path.
--
-- Two RPCs, one per suggestion type. Both:
--   - require the caller to be a physician (role 'clinician') with an
--     active unlock for the patient who owns the suggestion
--   - accept only the non-default statuses ('accepted' / 'reviewed' /
--     'dismissed') — you can't move something back to 'needsReview'
--     through these
--   - audit-log the action
--
-- Goal suggestions accept 'accepted' or 'dismissed'.
-- Muscle suggestions accept 'reviewed' or 'dismissed'.
-- (Passing the wrong status for the type is rejected.)
--
-- We deliberately keep these as RPCs rather than widening RLS to a raw
-- UPDATE: the validation — physician role, active unlock, allowed
-- status per type — is easier to keep correct in one place.
-- ============================================================================

create or replace function set_physio_goal_suggestion_status(
  p_suggestion_id uuid,
  p_status physio_review_status
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient_id uuid;
begin
  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can review suggestions';
  end if;

  if p_status not in ('accepted', 'dismissed') then
    raise exception 'invalid status for a goal suggestion: %', p_status;
  end if;

  select patient_id into v_patient_id
    from physio_goal_suggestion
   where id = p_suggestion_id;

  if v_patient_id is null then
    raise exception 'suggestion not found';
  end if;
  if not clinician_can_access_patient(v_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update physio_goal_suggestion
     set status = p_status
   where id = p_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'physio_goal_suggestion_' || p_status,
    'physio_goal_suggestion', p_suggestion_id::text
  );
end;
$$;

create or replace function set_physio_muscle_suggestion_status(
  p_suggestion_id uuid,
  p_status physio_review_status
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient_id uuid;
begin
  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can review suggestions';
  end if;

  if p_status not in ('reviewed', 'dismissed') then
    raise exception 'invalid status for a muscle suggestion: %', p_status;
  end if;

  select patient_id into v_patient_id
    from physio_muscle_suggestion
   where id = p_suggestion_id;

  if v_patient_id is null then
    raise exception 'suggestion not found';
  end if;
  if not clinician_can_access_patient(v_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update physio_muscle_suggestion
     set status = p_status
   where id = p_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'physio_muscle_suggestion_' || p_status,
    'physio_muscle_suggestion', p_suggestion_id::text
  );
end;
$$;

-- The RPCs run as SECURITY DEFINER, so they can UPDATE despite RLS not
-- granting a direct update policy. Grant execute to authenticated; the
-- in-function role check is the real gate.
revoke all on function set_physio_goal_suggestion_status(uuid, physio_review_status) from public;
grant execute on function set_physio_goal_suggestion_status(uuid, physio_review_status) to authenticated;

revoke all on function set_physio_muscle_suggestion_status(uuid, physio_review_status) from public;
grant execute on function set_physio_muscle_suggestion_status(uuid, physio_review_status) to authenticated;
