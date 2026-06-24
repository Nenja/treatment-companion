-- ============================================================================
-- 0034 — First-run orientation flag.
--
-- A brand-new user (patient, physiotherapist, or physician) sees a
-- one-time inline panel on their main screen explaining what the app
-- is and what they'll do. has_seen_intro records that they've
-- dismissed it, so it never shows again — on any device, since it's
-- on the profile rather than localStorage.
--
-- Default true: existing accounts predate the orientation and should
-- NOT suddenly see it, so we backfill them to true below. Only accounts
-- created from here on want the panel — and the admin create-account
-- path sets has_seen_intro = false explicitly for new accounts.
-- ============================================================================

alter table profile
  add column if not exists has_seen_intro boolean not null default true;

-- Backfill: every account that already exists has effectively "seen"
-- the (previously non-existent) intro — don't show it to them.
update profile set has_seen_intro = true;
