-- ============================================================================
-- 0013 — NRS overhaul.
--
-- Replaces the five descriptive GAS anchor columns on approved_goal
-- with a clinician-written NRS question, a direction flag, and four
-- cut points that partition 0-10 into the five GAS buckets.
--
-- Weekly ratings now store the patient's raw NRS value alongside the
-- derived GAS value. GAS is computed server-side from the goal's cut
-- points at submission time (in 0014's RPC update), so the patient
-- never has to think about GAS.
--
-- This is a "big bang" migration: existing rows in approved_goal and
-- weekly_goal_rating are dropped. The seed in 0014 re-creates the
-- test patient's data with realistic NRS values.
-- ============================================================================

-- 1. Clear data so the new NOT NULL columns can be added cleanly.
--    Foreign-key cascades handle the deletion order automatically.
delete from weekly_goal_rating;
delete from approved_goal;
-- Mark all suggestions as needsReview so the clinician can re-approve.
update goal_suggestion set status = 'needsReview';

-- 2. NRS direction enum.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'nrs_direction') then
    create type nrs_direction as enum ('higherIsBetter', 'lowerIsBetter');
  end if;
end $$;

-- 3. approved_goal: drop anchor columns, add NRS columns.
alter table approved_goal
  drop column if exists anchor_minus2,
  drop column if exists anchor_minus1,
  drop column if exists anchor_zero,
  drop column if exists anchor_plus1,
  drop column if exists anchor_plus2;

alter table approved_goal
  add column nrs_question text not null
    check (length(nrs_question) between 1 and 300),
  add column nrs_direction nrs_direction not null,
  -- Four cut points define five buckets. Stored as the upper bound of
  -- each non-+2 bucket. For higherIsBetter:
  --   nrs ≤ cut_low_low      → -2
  --   cut_low_low < nrs ≤ cut_low → -1
  --   cut_low < nrs ≤ cut_zero    →  0
  --   cut_zero < nrs ≤ cut_high   → +1
  --   nrs > cut_high              → +2
  -- For lowerIsBetter, the mapping flips (-2 and +2 swap, etc.).
  add column nrs_cut_low_low int not null check (nrs_cut_low_low between 0 and 9),
  add column nrs_cut_low int not null check (nrs_cut_low between 0 and 9),
  add column nrs_cut_zero int not null check (nrs_cut_zero between 0 and 9),
  add column nrs_cut_high int not null check (nrs_cut_high between 0 and 9),
  add constraint approved_goal_cuts_monotonic check (
    nrs_cut_low_low < nrs_cut_low
    and nrs_cut_low < nrs_cut_zero
    and nrs_cut_zero < nrs_cut_high
  );

-- 4. weekly_goal_rating: add nrs_value, make rating_label nullable.
--    rating_value remains the derived GAS (-2..+2) for display
--    convenience; nrs_value is the raw signal.
alter table weekly_goal_rating
  add column nrs_value int check (nrs_value between 0 and 10),
  alter column rating_label drop not null;
