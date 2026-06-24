-- ============================================================================
-- 0050 — Layout preference (wide vs compact) on the profile.
--
-- Clinicians (and therapists) work on desktop and may prefer either
-- the spacious two-pane layout or the simpler single-column one, on
-- the same wide screen. This stores that choice on the profile so it
-- follows the user across devices.
--
-- Values:
--   'wide'    — two-pane layout on large screens (the default; matches
--               the responsive behaviour a wide screen already gave).
--   'compact' — single-column layout even on large screens.
--
-- The preference only has an effect on large screens (≥1024px). On
-- phones and narrow windows the app is always single-column
-- regardless of this value, so the toggle is only shown on large
-- screens. We deliberately keep this binary (no 'auto'): on the only
-- screens where the toggle appears, 'auto' and 'wide' would be
-- identical, so the meaningful choice is just wide-or-compact.
--
-- Patients never see a two-pane layout (their surfaces are
-- mobile-first by design), so for them this column is simply unused.
--
-- Self-update only: the existing profile RLS already permits a user
-- to update their own row, which is how color_scheme / night_mode /
-- text_scale persist. No new policy needed.
-- ============================================================================

alter table profile
  add column if not exists layout_preference text
    not null
    default 'wide'
    check (layout_preference in ('wide', 'compact'));
