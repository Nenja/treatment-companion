-- ============================================================================
-- 0059 — Treatment area flags on treatment_cycle (standard / face).
--
-- WHY:
--   Until now every treatment cycle used the same treatment page. We are
--   introducing a face-dosing map that is only relevant for face treatment.
--   Standard and face are TWO INDEPENDENT areas — a cycle may be standard
--   only, face only, or both. So we model two booleans, not a single type.
--
--   Visibility of the face map keys off includes_face; the standard
--   treatment content shows when includes_standard. At least one must be
--   true (an empty treatment is meaningless).
--
--   No indication/diagnosis is stored — deliberately (privacy: a named
--   neurological indication is sensitive; a plain area flag is not).
--
-- BACKFILL:
--   All existing cycles are standard-only (that is all the app has done to
--   date): includes_standard = true, includes_face = false.
-- ============================================================================

alter table treatment_cycle
  add column if not exists includes_standard boolean not null default true,
  add column if not exists includes_face boolean not null default false;

-- At least one area must be selected.
alter table treatment_cycle
  drop constraint if exists treatment_cycle_at_least_one_area;
alter table treatment_cycle
  add constraint treatment_cycle_at_least_one_area
  check (includes_standard or includes_face);

-- Per-cycle display preference for the face map (colour dots vs symbols).
-- Only meaningful when includes_face; harmless default otherwise.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'face_display_mode') then
    create type face_display_mode as enum ('color', 'symbol');
  end if;
end$$;

alter table treatment_cycle
  add column if not exists face_display_mode face_display_mode not null default 'color';

-- ----------------------------------------------------------------------------
-- Face marks reuse muscle_injection (a face mark IS a located muscle
-- injection — Option A). Add an optional normalised position. Position is
-- NULL for standard injections; set for face marks. Coordinates are
-- normalised 0..1 against the base face image so they survive re-rendering
-- and base-image changes.
-- ----------------------------------------------------------------------------
alter table muscle_injection
  add column if not exists pos_x numeric(6,5),
  add column if not exists pos_y numeric(6,5);

-- If a position is given, both coordinates must be present and in range.
alter table muscle_injection
  drop constraint if exists muscle_injection_pos_complete;
alter table muscle_injection
  add constraint muscle_injection_pos_complete
  check (
    (pos_x is null and pos_y is null)
    or (pos_x between 0 and 1 and pos_y between 0 and 1)
  );

