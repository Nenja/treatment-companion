-- ============================================================================
-- 0094 — Patient-chosen weekly reminder day.
--
-- notify_weekday: the weekday the patient wants their weekly check-in
-- reminder push to fire. 0 = Sunday … 6 = Saturday (matches JS
-- Date.getUTCDay(), which the send-checkin-notifications Edge Function
-- uses to decide who to notify each day).
--
-- NULL = the patient hasn't chosen yet. The app shows the reminder-day
-- modal on every login until a day is set (skip only dismisses it for
-- the current session).
--
-- Stored on profile. Patients already update their own profile row via
-- the profile_self_update RLS policy (USING id = auth.uid(); the WITH
-- CHECK only forbids changing role, which this never does). UPDATE on
-- profile is already granted table-wide to authenticated, so no new
-- policy or column grant is required.
-- ============================================================================

alter table profile
  add column if not exists notify_weekday smallint
    check (notify_weekday is null or notify_weekday between 0 and 6);

comment on column profile.notify_weekday is
  'Weekly check-in reminder day: 0=Sun .. 6=Sat (JS getUTCDay). NULL = not chosen yet.';
