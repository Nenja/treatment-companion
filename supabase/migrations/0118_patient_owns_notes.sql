-- 0118_patient_owns_notes.sql
-- ---------------------------------------------------------------------------
-- Patient data ownership. Core principle of Treatment Companion: the patient
-- owns their record, so nothing about them is hidden from them.
--
-- Three tables were originally built "RLS-isolated from the patient" — each has
-- a clinician-only SELECT (clinician_can_access_patient) and, deliberately, NO
-- patient policy:
--   * treatment_handoff   (0088) — physician → therapist cycle handoff note
--   * goal_handoff_note   (0090) — physician → therapist per-goal handoff note
--   * archived_goal_video (0092) — the patient's archived video clips + the
--                                  clinic score/note each carried
-- All three hold information ABOUT the patient (notes addressed to their
-- therapist; their own videos and the clinic's scoring of them). Hiding them
-- contradicts the ownership principle, so this migration grants the patient a
-- self-read on each.
--
-- Scope: READ ONLY. Authoring is unchanged — these remain physician/clinician
-- -authored via their existing SECURITY DEFINER RPCs; only the patient's SELECT
-- is added. The predicate is the canonical one used across the schema
-- (treatment_cycle / approved_goal / weekly_checkin / ...):
--     patient_id = current_patient_id()
-- Forward-only and idempotent; does not alter the 0088 / 0090 / 0092 policies,
-- only adds a patient policy alongside them and refreshes the table comments
-- so they no longer assert "NEVER patient-visible".
--
-- NOTE (deliberately out of scope, flagged for review): questionnaire /
-- questionnaire_library / study are clinician-authored DEFINITIONS, not
-- information about a specific patient; visit_code_unlock_attempt is a security
-- audit log. None are touched here.
-- ---------------------------------------------------------------------------

-- Physician → therapist cycle handoff note (0088).
drop policy if exists treatment_handoff_patient_read on treatment_handoff;
create policy treatment_handoff_patient_read on treatment_handoff
  for select using (patient_id = current_patient_id());

-- Physician → therapist per-goal handoff note (0090).
drop policy if exists goal_handoff_note_patient_read on goal_handoff_note;
create policy goal_handoff_note_patient_read on goal_handoff_note
  for select using (patient_id = current_patient_id());

-- Archived goal-video snapshots — the patient's own clip plus the clinic score
-- it carried (0092).
drop policy if exists archived_goal_video_patient_read on archived_goal_video;
create policy archived_goal_video_patient_read on archived_goal_video
  for select using (patient_id = current_patient_id());

-- Refresh comments so they reflect the ownership principle (the previous text
-- asserted these were never patient-visible).
comment on table treatment_handoff is
  'Physician-authored handoff note for the weekly therapist, tied 1:1 to a '
  'treatment cycle. Patient-readable (the patient owns their record). Authored '
  'by the physician only, via RPC; read by the physician, the therapist, and '
  'the patient.';
comment on table goal_handoff_note is
  'Physician-authored, goal-specific handoff note for the weekly therapist, '
  'keyed per (cycle, goal). Patient-readable (the patient owns their record). '
  'Authored by the physician only, via RPC.';
comment on table archived_goal_video is
  'Archived goal-video snapshots (the patient''s clip plus the clinic score it '
  'carried). Patient-readable (the patient owns their record). Authored by '
  'clinicians via RPC.';
