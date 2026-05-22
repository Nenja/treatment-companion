-- ============================================================================
-- 0033 — Forced password change on first login.
--
-- Admin-created accounts start with a clinic-issued temporary password
-- (a random 12-char string). Until the person replaces it with one of
-- their own choosing, they are using an unmemorable string — which is
-- exactly what drives them to get locked out later.
--
-- This flag marks an account as still on its temp password. The app
-- routes such a user to the set-password screen on every load until
-- they choose their own password, at which point the flag is cleared.
--
-- Default true: it is set at account creation. Existing accounts that
-- predate this migration are backfilled to false below — we don't want
-- to suddenly force every current user through a password change.
-- ============================================================================

alter table profile
  add column if not exists must_change_password boolean not null default true;

-- Backfill: accounts that already exist were created before this flow
-- and should NOT be forced to change. Only accounts created from here
-- on (which get the default true) go through the forced change.
update profile set must_change_password = false;
