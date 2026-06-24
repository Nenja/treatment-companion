-- ============================================================================
-- 0068 — read-aloud (text-to-speech) accessibility preference.
--
-- Adds a per-user opt-in for the read-aloud feature: when on, a small
-- speaker button appears next to key patient-facing text (goal, weekly
-- question, safety notice) and reads it using the device's built-in
-- speech synthesis. Mirrors the existing appearance prefs (text_scale,
-- color_scheme, night_mode) — a plain column on profile, written by the
-- user via the existing profile self-update RLS policy. Off by default.
-- ============================================================================

alter table profile
  add column if not exists read_aloud boolean not null default false;

comment on column profile.read_aloud is
  'Accessibility opt-in: when true, show read-aloud (text-to-speech) '
  'controls on patient-facing text. Read aloud uses the device''s own '
  'speech synthesis; no audio leaves the device. Defaults to false.';
