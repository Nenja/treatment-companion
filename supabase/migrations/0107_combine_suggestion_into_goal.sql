-- 0107_combine_suggestion_into_goal.sql
-- ---------------------------------------------------------------------------
-- Fold a patient's goal suggestion into an EXISTING approved goal.
--
-- During review (which happens at the visit) a clinician may decide a
-- suggestion is already covered by a goal the patient has. Rather than
-- creating a duplicate goal, they can fold it in. We only RECORD the
-- fold-in: the suggestion's status becomes 'combinedWithAnother' and we
-- store which goal it was folded into. No new goal is created, and the
-- patient's wording is NOT copied onto the target goal — the target goal
-- is left exactly as it was.
--
-- This is a dedicated RPC rather than an extra argument on
-- set_suggestion_status so that the existing signature
-- set_suggestion_status(uuid, suggestion_status) and its callers are
-- untouched.
-- ---------------------------------------------------------------------------

alter table goal_suggestion
  add column if not exists combined_into_goal_id uuid
    references approved_goal(id) on delete set null;

create or replace function combine_suggestion_into_goal(
  p_suggestion_id uuid,
  p_goal_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_suggestion record;
  v_goal record;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  select id, patient_id into v_suggestion
    from goal_suggestion
   where id = p_suggestion_id;
  if v_suggestion is null then
    raise exception 'suggestion not found';
  end if;

  if not clinician_can_access_patient(v_suggestion.patient_id) then
    raise exception 'no active session for this patient';
  end if;

  -- The target goal must exist and belong to the SAME patient. This blocks
  -- folding a suggestion into another patient's goal.
  select id, patient_id into v_goal
    from approved_goal
   where id = p_goal_id;
  if v_goal is null then
    raise exception 'target goal not found';
  end if;
  if v_goal.patient_id <> v_suggestion.patient_id then
    raise exception 'target goal belongs to a different patient';
  end if;

  update goal_suggestion
     set status = 'combinedWithAnother',
         combined_into_goal_id = p_goal_id
   where id = p_suggestion_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'suggestion_status_updated', 'goal_suggestion',
    p_suggestion_id::text
  );
end;
$$;

grant execute on function combine_suggestion_into_goal(uuid, uuid) to authenticated;
