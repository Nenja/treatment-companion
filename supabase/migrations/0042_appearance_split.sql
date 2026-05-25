-- ============================================================================
-- 0042 — Appearance: palette choice + day/night toggle.
--
-- Appearance is two independent stored values on the profile:
--   * color_scheme — a PALETTE id: 'green', 'plum', 'slate', 'clay',
--                    or 'high-contrast'.
--   * night_mode   — a boolean day/night toggle, applied to whatever
--                    palette is chosen.
--
-- High contrast is one of the palette options (not a separate flag):
-- choosing it applies the dedicated high-contrast palette, which still
-- honours night_mode (light or dark form).
--
-- IMPORTANT — ordering. This migration NORMALISES existing data into
-- valid palette ids BEFORE applying the check constraint, so it is
-- safe to run even if an earlier draft of this migration (with
-- warm-/cool- or green-day/blue-night style ids, and/or a
-- high_contrast column) was already applied. Idempotent.
-- ============================================================================

-- 1. Add the night-mode toggle (no-op if it already exists).
alter table profile
  add column if not exists night_mode boolean not null default false;

-- 2. Drop the old color_scheme constraint up front so the normalising
--    updates below cannot trip over a stale constraint.
alter table profile
  drop constraint if exists profile_color_scheme_valid;

-- 3. If an earlier draft added a `high_contrast` boolean, fold it in:
--    a row with high_contrast = true becomes the 'high-contrast'
--    palette. Done before the per-value normalisation below.
--    Wrapped so it is harmless if the column was never added.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'profile' and column_name = 'high_contrast'
  ) then
    update profile set color_scheme = 'high-contrast'
      where high_contrast = true;
    alter table profile drop column high_contrast;
  end if;
end $$;

-- 4. Seed night_mode from any legacy value that implied a dark form,
--    so a user who had chosen a dark/night appearance keeps it.
update profile set night_mode = true
  where color_scheme in (
    'dark', 'high-contrast-dark',
    'green-night', 'blue-night', 'clay-night',
    'warm-night', 'cool-night'
  );

-- 5. Normalise every known legacy color_scheme value to a palette id.
update profile set color_scheme = 'green'
  where color_scheme in (
    'light', 'dark',
    'green-day', 'green-night',
    'warm-day', 'warm-night'
  );
update profile set color_scheme = 'slate'
  where color_scheme in (
    'blue-day', 'blue-night',
    'cool-day', 'cool-night'
  );
update profile set color_scheme = 'clay'
  where color_scheme in ('clay-day', 'clay-night');
update profile set color_scheme = 'high-contrast'
  where color_scheme in ('high-contrast', 'high-contrast-dark');

-- 6. Safety net: anything still not a recognised palette id is reset
--    to null (the app then follows the OS preference).
update profile set color_scheme = null
  where color_scheme is not null
    and color_scheme not in (
      'green', 'plum', 'slate', 'clay', 'high-contrast'
    );

-- 7. Now every row holds null or a valid palette id — add the
--    constraint.
alter table profile
  add constraint profile_color_scheme_valid
  check (
    color_scheme is null
    or color_scheme in (
      'green', 'plum', 'slate', 'clay', 'high-contrast'
    )
  );
