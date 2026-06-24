-- ============================================================================
-- 0028 — submit_physio_goal_suggestion RPC.
--
-- Creates one physiotherapist goal suggestion. The physiotherapist must
-- have an active unlock for the patient. Resolves the patient's active
-- treatment cycle server-side so the client doesn't pass it.
--
-- Mirrors submit_physio_assessment's validation shape (migration 0026).
-- ============================================================================

create or replace function submit_physio_goal_suggestion(
  p_patient_id uuid,
  p_suggested_goal text,
  p_rationale text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_physio_id uuid;
  v_cycle_id uuid;
  v_suggestion_id uuid;
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

  if p_suggested_goal is null or length(trim(p_suggested_goal)) = 0 then
    raise exception 'suggested goal is required';
  end if;
  if p_rationale is null or length(trim(p_rationale)) = 0 then
    raise exception 'rationale is required';
  end if;

  select id into v_cycle_id
    from treatment_cycle
   where patient_id = p_patient_id
     and status = 'active'
   order by cycle_number desc
   limit 1;

  if v_cycle_id is null then
    raise exception 'patient has no active treatment cycle';
  end if;

  insert into physio_goal_suggestion (
    patient_id, treatment_cycle_id, physiotherapist_id,
    suggested_goal, rationale
  ) values (
    p_patient_id, v_cycle_id, v_physio_id,
    trim(p_suggested_goal), trim(p_rationale)
  ) returning id into v_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'physiotherapist', 'physio_goal_suggestion_submitted',
    'physio_goal_suggestion', v_suggestion_id::text
  );

  return v_suggestion_id;
end;
$$;

revoke all on function submit_physio_goal_suggestion(uuid, text, text) from public;
grant execute on function submit_physio_goal_suggestion(uuid, text, text) to authenticated;
