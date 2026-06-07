-- 0087_link_goal_to_lineage.sql
-- ---------------------------------------------------------------------------
-- Safety/correction action for goal versioning. If a clinician started a new
-- goal that was really the continuation of an existing one, link_goal_to_lineage
-- grafts the new goal onto the existing goal's lineage as its newest version:
-- the target lineage's current live version is frozen, and the source goal
-- adopts the target lineage_id with version = max+1, becoming the live version.
-- Ratings stay on their own rows, so both goals' histories merge into one
-- thread.
--
-- Scope: the source must be a single-version lineage (a freshly-created goal,
-- not yet recalibrated), so no predecessors are orphaned. Source and target
-- must be the same patient and the same measurement kind.
-- ---------------------------------------------------------------------------

create or replace function link_goal_to_lineage(
  p_source_goal_id uuid,   -- the goal to graft (becomes the newest version)
  p_target_goal_id uuid    -- any goal in the lineage to graft onto
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clin uuid;
  v_src_patient uuid;
  v_src_kind goal_kind;
  v_src_live boolean;
  v_src_lineage uuid;
  v_src_lineage_count int;
  v_tgt_patient uuid;
  v_tgt_kind goal_kind;
  v_tgt_lineage uuid;
  v_tgt_live_id uuid;
  v_max_version int;
begin
  if current_app_role() <> 'clinician' then
    raise exception 'caller is not a clinician';
  end if;
  v_clin := current_clinician_id();
  if v_clin is null then
    raise exception 'no professional record for caller';
  end if;

  select patient_id, goal_kind, (superseded_at is null), lineage_id
    into v_src_patient, v_src_kind, v_src_live, v_src_lineage
    from approved_goal where id = p_source_goal_id;
  if v_src_patient is null then
    raise exception 'source goal not found';
  end if;

  select patient_id, goal_kind, lineage_id
    into v_tgt_patient, v_tgt_kind, v_tgt_lineage
    from approved_goal where id = p_target_goal_id;
  if v_tgt_patient is null then
    raise exception 'target goal not found';
  end if;

  if not clinician_can_access_patient(v_src_patient) then
    raise exception 'no active session for this patient';
  end if;
  if v_src_patient <> v_tgt_patient then
    raise exception 'goals belong to different patients';
  end if;
  if not v_src_live then
    raise exception 'can only link the live version of a goal';
  end if;
  if v_src_kind <> v_tgt_kind then
    raise exception 'goals use different measurement types';
  end if;
  if v_src_lineage = v_tgt_lineage then
    raise exception 'goals are already in the same lineage';
  end if;

  -- Source must be a single-version lineage so nothing is orphaned.
  select count(*) into v_src_lineage_count
    from approved_goal where lineage_id = v_src_lineage;
  if v_src_lineage_count <> 1 then
    raise exception 'source goal already has its own history; cannot link';
  end if;

  select id into v_tgt_live_id
    from approved_goal
   where lineage_id = v_tgt_lineage and superseded_at is null;
  select max(version) into v_max_version
    from approved_goal where lineage_id = v_tgt_lineage;

  -- Freeze the target's current live version first (keep the one-live guard
  -- satisfied), then move the source in as the newest version.
  update approved_goal
     set superseded_at = now()
   where id = v_tgt_live_id;

  update approved_goal
     set lineage_id = v_tgt_lineage,
         version = v_max_version + 1
   where id = p_source_goal_id;

  update approved_goal
     set superseded_by = p_source_goal_id
   where id = v_tgt_live_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'goal_linked_to_lineage',
    'approved_goal', p_source_goal_id::text
  );

  return p_source_goal_id;
end;
$$;

revoke all on function link_goal_to_lineage(uuid, uuid) from public;
grant execute on function link_goal_to_lineage(uuid, uuid) to authenticated;
