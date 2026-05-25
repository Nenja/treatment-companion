-- ============================================================================
-- 0042 — Appearance: separate theme from high contrast.
--
-- Until now `color_scheme` held one of four flat schemes that tangled
-- two separate choices together: light/dark AND high-contrast. This
-- migration splits them:
--
--   * `color_scheme` now holds a THEME id — a colour palette in a day
--     or night form. The app ships four: warm-day, warm-night,
--     cool-day, cool-night.
--   * `high_contrast` is a new boolean. When true, the app applies a
--     single dedicated high-contrast palette (in a light or dark form
--     matching the chosen theme's day/night) on top of — overriding —
--     the theme. High contrast is an accessibility need, not a fifth
--     colour, so it is a toggle that layers on any theme.
--
-- The check constraint accepts the four new theme ids. It also still
-- accepts the four OLD scheme ids ('light', 'dark', 'high-contrast',
-- 'high-contrast-dark') so that any profile saved before this
-- migration does not violate the constraint; the application maps
-- those legacy values to the new model at read time. New writes only
-- ever use the new theme ids.
-- ============================================================================

-- High-contrast toggle — defaults to false (off).
alter table profile
  add column if not exists high_contrast boolean not null default false;

-- Widen the color_scheme constraint to the new theme ids, while still
-- tolerating the legacy ids on existing rows.
alter table profile
  drop constraint if exists profile_color_scheme_valid;
alter table profile
  add constraint profile_color_scheme_valid
  check (
    color_scheme is null
    or color_scheme in (
      -- New theme ids.
      'warm-day', 'warm-night', 'cool-day', 'cool-night',
      -- Legacy ids, tolerated for rows saved before migration 0042.
      'light', 'dark', 'high-contrast', 'high-contrast-dark'
    )
  );

-- Backfill: translate any legacy color_scheme value to the new model.
-- A legacy high-contrast choice becomes the nearest theme PLUS the
-- high_contrast flag set true, so the user keeps the accessibility
-- accommodation they had chosen.
update profile set color_scheme = 'warm-day'
  where color_scheme = 'light';
update profile set color_scheme = 'warm-night'
  where color_scheme = 'dark';
update profile set color_scheme = 'warm-day', high_contrast = true
  where color_scheme = 'high-contrast';
update profile set color_scheme = 'warm-night', high_contrast = true
  where color_scheme = 'high-contrast-dark';
