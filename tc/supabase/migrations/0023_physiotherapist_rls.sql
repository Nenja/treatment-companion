-- ============================================================================
-- 0023 — RLS updates for physiotherapist read access.
--
-- Runs after 0022 added the 'physiotherapist' enum value (enum values
-- can't be added and used in the same transaction, hence two files).
--
-- Most clinician-facing RLS uses clinician_can_access_patient(), which
-- is role-agnostic — it only checks for an active clinician_session.
-- Since physiotherapists get a `clinician` table row and unlock via the
-- same visit-code mechanism, those policies already cover them.
--
-- The only policy that gates on the literal role 'clinician' AND that
-- physiotherapists also need is profile_clinician_read_patient — it
-- lets an unlocking professional read their patient's profile row.
-- We widen it to include physiotherapists.
--
-- Policies that physiotherapists must NOT get (writing treatment
-- cycles, recording treatments, approving goals) keep their
-- role = 'clinician' check and are deliberately left unchanged.
-- ============================================================================

-- Helper: true if the caller is an unlocking professional — either a
-- physician (role 'clinician') or a physiotherapist. Used in place of
-- bare `current_app_role() = 'clinician'` where both should pass.
create or replace function current_role_is_care_professional()
  returns boolean as $$
  select current_app_role() in ('clinician', 'physiotherapist');
$$ language sql stable security definer;

-- Widen the patient-profile read policy to include physiotherapists.
drop policy if exists profile_clinician_read_patient on profile;
create policy profile_clinician_read_patient on profile
  for select using (
    current_role_is_care_professional()
    and exists (
      select 1 from patient p
       where p.profile_id = profile.id
         and clinician_can_access_patient(p.id)
    )
  );
