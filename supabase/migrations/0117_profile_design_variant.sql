-- ===========================================================================
-- 0117_profile_design_variant.sql
-- ---------------------------------------------------------------------------
-- Adds a per-profile DESIGN direction, orthogonal to the colour palette.
--   design_variant: 'current' (rounded, the existing look) or 'editorial'
--   (near-square corners — the "warm editorial" direction). NULL resolves to
--   'current' in the client. Applied as a data-design attribute on <html>,
--   exactly like color_scheme drives the palette CSS variables.
-- No new RLS policy: the existing self-update policy on profile is row-level,
-- so it already covers this new column (same as color_scheme / night_mode).
-- ===========================================================================
alter table profile add column if not exists design_variant text;
comment on column profile.design_variant is
  'Design direction: current | editorial. NULL = current. Orthogonal to color_scheme.';
