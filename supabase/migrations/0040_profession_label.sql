-- ============================================================================
-- 0040 — Profession label for non-physician professionals.
--
-- The application has one non-physician professional role (stored as
-- role = 'physiotherapist' for historical reasons). In practice this
-- role is held not only by physiotherapists but also by occupational
-- therapists, nurses, speech therapists, and others.
--
-- Rather than splitting the role — which would multiply every role
-- check and RLS policy for no difference in permissions — we keep the
-- single role and add a `profession` LABEL. The label is descriptive
-- only: it changes what is displayed on screen and in the EHR export,
-- never what the user is permitted to do.
--
-- `profession` holds one of a fixed set of codes, or null. `profession_other`
-- holds free text, used only when profession = 'other' so that an
-- "Other" professional still reads meaningfully on an export.
--
-- The column is intended for the non-physician professional role.
-- It is left null for patients, physicians, and admin-only accounts;
-- the application is responsible for only setting it where meaningful.
-- ============================================================================

alter table profile
  add column if not exists profession text;

alter table profile
  add column if not exists profession_other text;

-- profession only ever holds one of the known codes, or null.
alter table profile
  drop constraint if exists profile_profession_valid;
alter table profile
  add constraint profile_profession_valid
  check (
    profession is null
    or profession in (
      'physiotherapist',
      'occupational_therapist',
      'nurse',
      'speech_therapist',
      'other'
    )
  );

-- profession_other is only meaningful when profession = 'other'.
-- When profession is anything else (or null), profession_other must be
-- null too — this keeps the data clean and the export unambiguous.
alter table profile
  drop constraint if exists profile_profession_other_valid;
alter table profile
  add constraint profile_profession_other_valid
  check (
    (profession = 'other' and profession_other is not null
       and length(trim(profession_other)) > 0)
    or (profession is distinct from 'other' and profession_other is null)
  );

-- Backfill: existing accounts on the non-physician professional role
-- predate this column. They were all, in practice, physiotherapists —
-- so default them to that. New accounts get their profession set
-- explicitly at creation time.
update profile
  set profession = 'physiotherapist'
  where role = 'physiotherapist'
    and profession is null;
