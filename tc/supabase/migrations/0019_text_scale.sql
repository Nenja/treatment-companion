-- ============================================================================
-- 0019 — Add text scale preference to profile.
--
-- Patients (and clinicians who want it) can choose larger text. The
-- value is a multiplier applied to the base font size in the UI:
--   1.00 = default
--   1.25 = larger
--   1.50 = largest
--
-- Stored on the profile so it travels across devices. Default 1.00
-- so existing rows don't break.
-- ============================================================================

alter table profile
  add column if not exists text_scale numeric(3, 2) not null default 1.00
  check (text_scale in (1.00, 1.25, 1.50));
