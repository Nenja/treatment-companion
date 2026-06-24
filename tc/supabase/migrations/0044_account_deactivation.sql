-- ============================================================================
-- 0044 — Account deactivation.
--
-- Adds `deactivated_at` to profile. A deactivated account:
--   * is blocked from signing in (enforced in the auth layer / the
--     admin deactivate endpoint also disables the auth user)
--   * keeps ALL its data and its place in the audit trail — nothing is
--     destroyed; deactivation is fully reversible.
--
-- This is distinct from permanent deletion (the admin page also
-- offers that, via a separate destructive endpoint). Deactivation is
-- the safe, reversible default; deletion is the irreversible last
-- resort.
--
-- null  = active (the normal state).
-- a timestamp = the account was deactivated at that moment.
-- ============================================================================

alter table profile
  add column if not exists deactivated_at timestamptz;
