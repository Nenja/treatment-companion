-- 0078_nav_style.sql
-- ---------------------------------------------------------------------------
-- Navigation style preference on the profile: where the clinician patient
-- page's action menu lives.
--   'top'  — a horizontal icon row under the patient name (the default;
--            matches today's behaviour).
--   'side' — a vertical icon rail down the left edge, content to the right.
--
-- Like layout_preference (0050), this only has an effect on large screens
-- (a left rail needs the width); phones/narrow windows always use the
-- stacked body row regardless. Self-update only — the existing profile RLS
-- already lets a user update their own row, so no new policy is needed.
-- ---------------------------------------------------------------------------

alter table profile
  add column if not exists nav_style text
    not null
    default 'top'
    check (nav_style in ('top', 'side'));

comment on column profile.nav_style is
  'Clinician patient-page menu placement on large screens: top icon row '
  '(''top'', default) or left side rail (''side'').';
