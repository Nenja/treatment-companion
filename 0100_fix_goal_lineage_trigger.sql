-- ============================================================================
-- 0100 — Repair the approved_goal lineage trigger.
--
-- 0086 (goal versioning) made approved_goal.lineage_id NOT NULL and added a
-- BEFORE INSERT trigger that defaults lineage_id to the new row's own id when
-- it isn't set explicitly — so every goal-creation path (approve_suggestion,
-- create_goal_for_patient, the GAS RPC, and the dev seed) keeps working without
-- naming lineage_id. On databases where the constraint took effect but the
-- trigger did not (a partial/older 0086), inserts that omit lineage_id fail
-- with "null value in column lineage_id violates not-null constraint".
--
-- This re-creates the function + trigger verbatim (idempotent) and backfills any
-- stray nulls. Safe to run whether or not the trigger already exists.
-- ============================================================================

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

-- Safety: any existing rows left with a null lineage become their own lineage.
update approved_goal set lineage_id = id where lineage_id is null;
