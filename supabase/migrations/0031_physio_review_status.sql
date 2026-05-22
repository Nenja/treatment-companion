-- ============================================================================
-- 0031 — Physiotherapist-suggestion review status.  [v5 — drop indexes first]
--
-- Migrates physio_goal_suggestion.status and physio_muscle_suggestion.status
-- from the patient-oriented suggestion_status enum onto a purpose-built
-- physio_review_status enum.
--
-- CRITICAL ORDERING: the two physio *_needs_review_idx partial indexes
-- (created in slices 3/4) have stored predicates bound to the old
-- suggestion_status enum. Any ALTER on the status column re-validates
-- those indexes and fails with "operator does not exist:
-- text = suggestion_status". They MUST be dropped before the column is
-- touched, and recreated against the new enum afterwards.
-- ============================================================================

-- 1. Drop the type-bound partial indexes FIRST.
drop index if exists physio_goal_suggestion_needs_review_idx;
drop index if exists physio_muscle_suggestion_needs_review_idx;

-- 2. New enum.
create type physio_review_status as enum (
  'needsReview', 'accepted', 'reviewed', 'dismissed'
);

-- 3. physio_goal_suggestion.status — enum -> text -> new enum.
alter table physio_goal_suggestion alter column status drop default;
alter table physio_goal_suggestion alter column status type text using status::text;
update physio_goal_suggestion set status = 'accepted'
 where status = 'active'::text;
update physio_goal_suggestion set status = 'dismissed'
 where status in ('discussAtNextVisit'::text,'combinedWithAnother'::text,'notSuitableThisCycle'::text,'archived'::text);
alter table physio_goal_suggestion alter column status type physio_review_status
  using status::physio_review_status;
alter table physio_goal_suggestion alter column status set default 'needsReview'::physio_review_status;

-- 4. physio_muscle_suggestion.status — same.
alter table physio_muscle_suggestion alter column status drop default;
alter table physio_muscle_suggestion alter column status type text using status::text;
update physio_muscle_suggestion set status = 'reviewed'
 where status = 'active'::text;
update physio_muscle_suggestion set status = 'dismissed'
 where status in ('discussAtNextVisit'::text,'combinedWithAnother'::text,'notSuitableThisCycle'::text,'archived'::text);
alter table physio_muscle_suggestion alter column status type physio_review_status
  using status::physio_review_status;
alter table physio_muscle_suggestion alter column status set default 'needsReview'::physio_review_status;

-- 5. Recreate the partial indexes, now bound to physio_review_status.
create index physio_goal_suggestion_needs_review_idx
  on physio_goal_suggestion(treatment_cycle_id)
  where status = 'needsReview'::physio_review_status;
create index physio_muscle_suggestion_needs_review_idx
  on physio_muscle_suggestion(treatment_cycle_id)
  where status = 'needsReview'::physio_review_status;
