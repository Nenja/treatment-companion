-- 0086_goal_versioning.sql
-- ---------------------------------------------------------------------------
-- Goal versioning. A goal is now a *lineage* of frozen versions rather than a
-- single mutable row. Editing a goal at a visit creates a new approved_goal
-- row (same lineage_id, version + 1) and freezes the previous one
-- (superseded_at / superseded_by). Ratings already point at a specific
-- approved_goal row, so every historical rating stays bound to the exact
-- calibration it was made under — the version log is the goal's evolution.
--
--   * lineage_id  — stable identity shared by all versions of one goal.
--   * version     — 1, 2, 3 … within a lineage.
--   * superseded_at / superseded_by — null on the single live version.
--
-- "Live" everywhere = superseded_at is null. Adding a brand-new goal starts a
-- fresh lineage. (A manual "link this goal to an existing lineage" action and
-- the per-goal history view come in the next build.)
-- ---------------------------------------------------------------------------

alter table approved_goal
  add column if not exists lineage_id uuid;
alter table approved_goal
  add column if not exists version int not null default 1;
alter table approved_goal
  add column if not exists superseded_at timestamptz;
alter table approved_goal
  add column if not exists superseded_by uuid references approved_goal(id);

-- An edited version has no originating suggestion (only the first version
-- does), so the suggestion link becomes optional.
alter table approved_goal
  alter column suggestion_id drop not null;

-- Backfill: every existing goal becomes version 1 of its own lineage, live.
-- (Cross-cycle continuity for pre-existing goals isn't recoverable; it begins
-- accumulating from the first edit after this migration.)
update approved_goal set lineage_id = id where lineage_id is null;

alter table approved_goal
  alter column lineage_id set not null;

create index if not exists approved_goal_lineage_idx
  on approved_goal(lineage_id);

-- A fresh goal is its own lineage. A BEFORE INSERT trigger defaults
-- lineage_id to the new row's id when not set explicitly, so every existing
-- goal-creation path (approve_suggestion, create_goal_for_patient, the GAS
-- creation RPC, seeds) keeps working unchanged. edit_goal sets lineage_id
-- explicitly, so the trigger leaves it alone.
create or replace function approved_goal_set_lineage()
  returns trigger language plpgsql as $$
begin
  if new.lineage_id is null then
    new.lineage_id := new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists approved_goal_lineage_default on approved_goal;
create trigger approved_goal_lineage_default
  before insert on approved_goal
  for each row execute function approved_goal_set_lineage();

-- At most one live version per lineage.
create unique index if not exists approved_goal_one_live_per_lineage
  on approved_goal(lineage_id) where superseded_at is null;

comment on column approved_goal.lineage_id is
  'Stable goal identity shared by every version in the lineage.';
comment on column approved_goal.version is
  'Version number within the lineage (1 = first).';
comment on column approved_goal.superseded_at is
  'Set when a later version replaces this one. NULL = the live version.';
comment on column approved_goal.superseded_by is
  'The version that replaced this one (chain pointer for the history view).';

-- ── edit_goal: create a new version, freeze the previous ────────────────────
-- Called at a visit. Clones the live version of the goal into the patient's
-- active cycle with version + 1, applying any edited fields (null = keep), and
-- supersedes the prior version. Ratings are untouched, so the old version
-- keeps its history.
create or replace function edit_goal(
  p_source_goal_id uuid,
  p_patient_facing_text text default null,
  p_smart_text text default null,
  p_nrs_question text default null,
  p_nrs_direction nrs_direction default null,
  p_nrs_cut_low_low int default null,
  p_nrs_cut_low int default null,
  p_nrs_cut_zero int default null,
  p_nrs_cut_high int default null,
  p_nrs_baseline_value int default null,
  p_nrs_target_value int default null,
  p_anchor_minus2 text default null,
  p_anchor_minus1 text default null,
  p_anchor_zero text default null,
  p_anchor_plus1 text default null,
  p_anchor_plus2 text default null
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_clinician_id uuid;
  v_patient_id uuid;
  v_new_cycle uuid;
  v_is_live boolean;
  v_new_id uuid;
begin
  if current_app_role() <> 'clinician' then
    raise exception 'caller is not a clinician';
  end if;
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'no professional record for caller';
  end if;

  select patient_id, (superseded_at is null)
    into v_patient_id, v_is_live
    from approved_goal where id = p_source_goal_id;
  if v_patient_id is null then
    raise exception 'goal not found';
  end if;
  if not clinician_can_access_patient(v_patient_id) then
    raise exception 'no active session for this patient';
  end if;
  if not v_is_live then
    raise exception 'can only edit the live version of a goal';
  end if;

  -- Edits happen at a visit, so an active cycle exists; the new version
  -- belongs to it.
  select id into v_new_cycle
    from treatment_cycle
   where patient_id = v_patient_id and status = 'active'
   order by cycle_number desc
   limit 1;
  if v_new_cycle is null then
    raise exception 'patient has no active treatment cycle';
  end if;

  -- Freeze the current version first so the one-live-per-lineage guard never
  -- sees two live rows. superseded_by is filled in once the new row exists.
  update approved_goal
     set superseded_at = now()
   where id = p_source_goal_id;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2,
    approved_by_clinician_id, status, goal_kind, goal_outcome,
    nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    nrs_baseline_value, nrs_target_value,
    baseline_video_path, video_enabled,
    video_task_instruction, video_task_seconds, video_task_setup,
    therapy, lineage_id, version
  )
  select
    null, patient_id, v_new_cycle,
    coalesce(p_patient_facing_text, patient_facing_text),
    coalesce(p_smart_text, smart_text),
    coalesce(p_anchor_minus2, anchor_minus2),
    coalesce(p_anchor_minus1, anchor_minus1),
    coalesce(p_anchor_zero, anchor_zero),
    coalesce(p_anchor_plus1, anchor_plus1),
    coalesce(p_anchor_plus2, anchor_plus2),
    v_clinician_id, 'active', goal_kind, goal_outcome,
    coalesce(p_nrs_question, nrs_question),
    coalesce(p_nrs_direction, nrs_direction),
    coalesce(p_nrs_cut_low_low, nrs_cut_low_low),
    coalesce(p_nrs_cut_low, nrs_cut_low),
    coalesce(p_nrs_cut_zero, nrs_cut_zero),
    coalesce(p_nrs_cut_high, nrs_cut_high),
    coalesce(p_nrs_baseline_value, nrs_baseline_value),
    coalesce(p_nrs_target_value, nrs_target_value),
    baseline_video_path, video_enabled,
    video_task_instruction, video_task_seconds, video_task_setup,
    therapy, lineage_id, version + 1
  from approved_goal where id = p_source_goal_id
  returning id into v_new_id;

  update approved_goal
     set superseded_by = v_new_id
   where id = p_source_goal_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician', 'goal_edited_new_version',
    'approved_goal', v_new_id::text
  );

  return v_new_id;
end;
$$;

revoke all on function edit_goal(
  uuid, text, text, text, nrs_direction, int, int, int, int, int, int,
  text, text, text, text, text
) from public;
grant execute on function edit_goal(
  uuid, text, text, text, nrs_direction, int, int, int, int, int, int,
  text, text, text, text, text
) to authenticated;
