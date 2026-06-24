-- ============================================================================
-- 0010 — Drop length_weeks and review_date from treatment_cycle.
--
-- A cycle's length is now implicit: it starts when a treatment session
-- is recorded and ends when the next treatment is recorded. There's no
-- fixed planned duration.
--
-- Patient-facing UI shows "week N since treatment" with no total.
-- Weekly check-in prompts continue to be generated, capped at 16 weeks
-- (enforced in the seed and the future prompt scheduler).
-- ============================================================================

-- Drop the columns. Existing data is dropped; this is acceptable for
-- the prototype since we're also re-seeding the test patient below.

alter table treatment_cycle
  drop column if exists length_weeks,
  drop column if exists review_date;
