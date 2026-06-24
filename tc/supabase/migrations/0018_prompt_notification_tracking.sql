-- ============================================================================
-- 0018 — Track when notifications were sent for each weekly_prompt.
--
-- Two distinct events per prompt:
--   notified_at  — set when the first push fires (on the due date)
--   reminded_at  — set when the 2-day-late reminder push fires
--
-- The Edge Function uses these to avoid duplicate sends. Each is set
-- by the function at send time using the service role key (RLS bypass).
-- ============================================================================

alter table weekly_prompt
  add column if not exists notified_at timestamptz,
  add column if not exists reminded_at timestamptz;

-- Index to make the "find prompts due today, not yet notified" query
-- cheap. Partial index since most prompts will already be notified.
create index if not exists weekly_prompt_pending_due_idx
  on weekly_prompt(due_date)
  where status = 'pending' and notified_at is null;
