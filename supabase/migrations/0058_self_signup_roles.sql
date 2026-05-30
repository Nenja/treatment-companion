-- ============================================================================
-- 0058 — Self-signup for patients and therapists (never clinicians).
--
-- Until now every signup became a 'patient' (the trigger hardcoded it),
-- and clinician/therapist accounts were created only by an admin. We now
-- want patients AND therapists to self-register, while the CLINICIAN
-- role stays centrally controlled (admin-created only).
--
-- THE SECURITY BOUNDARY IS THIS TRIGGER. It runs as security definer on
-- auth.users insert and is the one place the role is decided. The signup
-- form may pass an intended role in user metadata, but the trigger
-- CLAMPS it: only 'patient' or 'physiotherapist' are ever honoured.
-- Anything else — 'clinician', a typo, an injection attempt, or nothing
-- — falls back to 'patient'. So even a tampered client request cannot
-- self-create a clinician; the worst a caller can do is make themselves
-- a patient or a therapist. Clinician accounts continue to be created
-- ONLY via the admin service-role route, which sets the role explicitly.
--
-- The trigger also reads an optional profession label for therapists
-- (same fixed code set the admin route validates); an invalid or absent
-- profession is simply stored as null.
--
-- IMPORTANT — attaching the trigger: this migration updates the trigger
-- FUNCTION. The trigger itself is attached to auth.users, which in
-- Supabase must be (re)created from the SQL editor / dashboard with the
-- elevated privileges that schema requires. The CREATE TRIGGER at the
-- bottom is included for completeness; if your project already has the
-- trigger attached, "create or replace function" alone is enough — the
-- attached trigger picks up the new function body automatically.
--
-- REGULATORY NOTE — please surface to the regulatory advisor:
--   This opens the THERAPIST role to public self-registration. A
--   self-registered therapist still cannot reach any patient without a
--   single-use visit code the patient generates (the consent gate is
--   unchanged), and cannot inject, dose, or approve goals (those are
--   clinician-only). But "who can hold the therapist role" changes from
--   "admin-vetted" to "self-serve", which is a change to the access
--   model and should be reviewed alongside the rest.
-- ============================================================================

create or replace function ensure_profile_for_auth_user()
  returns trigger as $$
declare
  v_requested text;
  v_role role;
  v_profession text;
begin
  -- Intended role from signup metadata, CLAMPED. Only patient or
  -- physiotherapist are honoured; everything else (including clinician)
  -- becomes patient. This is the security boundary — do not loosen it.
  v_requested := new.raw_user_meta_data->>'signup_role';
  if v_requested = 'physiotherapist' then
    v_role := 'physiotherapist';
  else
    v_role := 'patient';
  end if;

  -- Optional profession label for therapists. Only a known code is
  -- stored; anything else is null. (Free-text "other" detail is set
  -- later by the therapist in their profile, not trusted from signup.)
  v_profession := null;
  if v_role = 'physiotherapist' then
    v_profession := new.raw_user_meta_data->>'signup_profession';
    if v_profession is null or v_profession not in (
      'physiotherapist', 'occupational_therapist', 'nurse',
      'speech_therapist', 'other'
    ) then
      v_profession := null;
    end if;
  end if;

  insert into profile (id, role, display_name, email, profession)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'display_name', 'Unnamed'),
    new.email,
    v_profession
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

comment on function ensure_profile_for_auth_user() is
  'Runs on auth.users insert to create a profile. Role is taken from '
  'signup metadata but CLAMPED to patient/physiotherapist — clinician '
  'can never be self-assigned. Clinician accounts are created only by '
  'the admin service-role route.';

-- Trigger attachment (idempotent). In Supabase this may need to be run
-- from the SQL editor with auth-schema privileges; if the trigger is
-- already attached, the function replacement above is sufficient.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function ensure_profile_for_auth_user();
