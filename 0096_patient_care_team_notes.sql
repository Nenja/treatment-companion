-- 0096_patient_care_team_notes.sql
-- Patient read access to the three care-team note channels.
--
-- The patient has a right of access to records about their own care. These
-- notes are surfaced READ-ONLY on the patient page (quiet, opt-in section):
--   * treatment_handoff  — physician → therapist, per-cycle (note + change flag)
--   * goal_handoff_note   — physician → therapist, per-goal note
--   * therapist_note      — therapist → clinic, free-text
--
-- RLS is ADDITIVE: each table keeps its existing clinician policy
-- (clinician_can_access_patient(patient_id)); we add a patient self-read.
-- current_patient_id() returns NULL for clinician callers, so the new policy
-- grants nothing to clinicians and the patient sees only their own rows.
-- Permissive SELECT policies are OR-ed, so clinician access is unchanged.
--
-- No data is destroyed or modified; this only widens read access.

drop policy if exists treatment_handoff_patient_read on treatment_handoff;
create policy treatment_handoff_patient_read on treatment_handoff
  for select to authenticated
  using (patient_id = current_patient_id());

drop policy if exists goal_handoff_note_patient_read on goal_handoff_note;
create policy goal_handoff_note_patient_read on goal_handoff_note
  for select to authenticated
  using (patient_id = current_patient_id());

drop policy if exists therapist_note_patient_read on therapist_note;
create policy therapist_note_patient_read on therapist_note
  for select to authenticated
  using (patient_id = current_patient_id());
