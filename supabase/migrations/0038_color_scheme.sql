-- ============================================================================
-- 0038 — Per-user colour scheme.
--
-- The app ships four colour schemes (light, dark, high-contrast,
-- high-contrast-dark) as accessibility accommodations — light
-- sensitivity and low vision are common in this patient group. The
-- chosen scheme is stored on the profile so it persists across devices
-- and sessions, the same way text_scale already is.
--
-- Stored as text (the scheme id). Null means "not chosen yet" — the
-- app then falls back to the device's OS light/dark preference on
-- first run, so a light-sensitive patient whose phone is in dark mode
-- isn't hit with a bright screen before they find the setting.
-- ============================================================================

alter table profile
  add column if not exists color_scheme text;

-- A light check constraint — the column only ever holds one of the
-- known scheme ids, or null.
alter table profile
  drop constraint if exists profile_color_scheme_valid;
alter table profile
  add constraint profile_color_scheme_valid
  check (
    color_scheme is null
    or color_scheme in (
      'light', 'dark', 'high-contrast', 'high-contrast-dark'
    )
  );
