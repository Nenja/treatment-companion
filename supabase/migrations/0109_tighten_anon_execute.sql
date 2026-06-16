-- 0109_tighten_anon_execute.sql
--
-- Audit follow-up F2 (least privilege on the anon role).
--
-- Context: EXECUTE on a function defaults to PUBLIC, so before this migration
-- every SECURITY DEFINER function in `public` was callable by the `anon`
-- (unauthenticated) role. The app's functions are all internally gated
-- (current_patient_id() / current_user_is_admin() / clinician_can_access_patient(),
-- all of which require a JWT and return null for anon), so this was not an
-- exploit on its own — but anon has no legitimate reason to invoke them, and
-- removing that reach is defence-in-depth: a future gating slip can't be reached
-- by an unauthenticated caller.
--
-- What this does: REVOKE EXECUTE ... FROM PUBLIC (the source of anon's access),
-- then GRANT it back only to the roles that legitimately call these functions:
--   - authenticated : every one of these is called from a logged-in patient or
--                      clinician surface (verified against the app's .rpc() sites;
--                      the only pre-login auth goes through Supabase Auth, not a
--                      custom function).
--   - service_role  : the trusted backend role (was already covered via PUBLIC;
--                      made explicit so nothing server-side regresses).
--
-- Deliberately NOT touched:
--   - The 6 auth-helper functions referenced inside RLS policies that apply to
--     PUBLIC (clinician_can_access_patient, current_app_role, current_clinician_id,
--     current_patient_id, current_role_is_care_professional, current_user_is_admin).
--     RLS policy expressions run as the *querying* role, so anon MUST keep EXECUTE
--     on these or anon queries against those tables would raise "permission denied
--     for function" instead of cleanly returning zero rows. (Confirmed via
--     pg_depend: these are the only SECURITY DEFINER functions any policy depends on.)
--   - The 10 dev_seed_* functions, already restricted to service_role in 0108.
--
-- Reversible: to undo, GRANT EXECUTE ... TO PUBLIC on the affected functions.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.approve_suggestion(p_suggestion_id uuid, p_patient_facing_text text, p_smart_text text, p_nrs_question text, p_nrs_direction nrs_direction, p_nrs_cut_low_low integer, p_nrs_cut_low integer, p_nrs_cut_zero integer, p_nrs_cut_high integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_suggestion(p_suggestion_id uuid, p_patient_facing_text text, p_smart_text text, p_nrs_question text, p_nrs_direction nrs_direction, p_nrs_cut_low_low integer, p_nrs_cut_low integer, p_nrs_cut_zero integer, p_nrs_cut_high integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.approve_suggestion_gas(p_suggestion_id uuid, p_patient_facing_text text, p_smart_text text, p_anchor_minus2 text, p_anchor_minus1 text, p_anchor_zero text, p_anchor_plus1 text, p_anchor_plus2 text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.approve_suggestion_gas(p_suggestion_id uuid, p_patient_facing_text text, p_smart_text text, p_anchor_minus2 text, p_anchor_minus1 text, p_anchor_zero text, p_anchor_plus1 text, p_anchor_plus2 text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.archive_goal(p_goal_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_goal(p_goal_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.archive_goal_video(p_approved_goal_id uuid, p_source text, p_rating_id uuid, p_note text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_goal_video(p_approved_goal_id uuid, p_source text, p_rating_id uuid, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.clear_goal_rating_video(p_rating_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.clear_goal_rating_video(p_rating_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.combine_suggestion_into_goal(p_suggestion_id uuid, p_goal_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.combine_suggestion_into_goal(p_suggestion_id uuid, p_goal_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_research_purge(p_patient_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_research_purge(p_patient_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_gas_goal_for_patient(p_patient_id uuid, p_patient_facing_text text, p_smart_text text, p_anchor_minus2 text, p_anchor_minus1 text, p_anchor_zero text, p_anchor_plus1 text, p_anchor_plus2 text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_gas_goal_for_patient(p_patient_id uuid, p_patient_facing_text text, p_smart_text text, p_anchor_minus2 text, p_anchor_minus1 text, p_anchor_zero text, p_anchor_plus1 text, p_anchor_plus2 text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.create_goal_for_patient(p_patient_id uuid, p_patient_facing_text text, p_smart_text text, p_nrs_question text, p_nrs_direction nrs_direction, p_nrs_cut_low_low integer, p_nrs_cut_low integer, p_nrs_cut_zero integer, p_nrs_cut_high integer, p_nrs_baseline_value integer, p_nrs_target_value integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_goal_for_patient(p_patient_id uuid, p_patient_facing_text text, p_smart_text text, p_nrs_question text, p_nrs_direction nrs_direction, p_nrs_cut_low_low integer, p_nrs_cut_low integer, p_nrs_cut_zero integer, p_nrs_cut_high integer, p_nrs_baseline_value integer, p_nrs_target_value integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.edit_goal(p_source_goal_id uuid, p_patient_facing_text text, p_smart_text text, p_nrs_question text, p_nrs_direction nrs_direction, p_nrs_cut_low_low integer, p_nrs_cut_low integer, p_nrs_cut_zero integer, p_nrs_cut_high integer, p_nrs_baseline_value integer, p_nrs_target_value integer, p_anchor_minus2 text, p_anchor_minus1 text, p_anchor_zero text, p_anchor_plus1 text, p_anchor_plus2 text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.edit_goal(p_source_goal_id uuid, p_patient_facing_text text, p_smart_text text, p_nrs_question text, p_nrs_direction nrs_direction, p_nrs_cut_low_low integer, p_nrs_cut_low integer, p_nrs_cut_zero integer, p_nrs_cut_high integer, p_nrs_baseline_value integer, p_nrs_target_value integer, p_anchor_minus2 text, p_anchor_minus1 text, p_anchor_zero text, p_anchor_plus1 text, p_anchor_plus2 text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.end_clinician_session() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.end_clinician_session() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.end_clinician_session(p_patient_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.end_clinician_session(p_patient_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_patient_row() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ensure_patient_row() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_profile_for_auth_user() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.ensure_profile_for_auth_user() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.export_research_dataset() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.export_research_dataset() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.generate_visit_code(p_code text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_visit_code(p_code text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.import_observations(p_patient_id uuid, p_observations jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.import_observations(p_patient_id uuid, p_observations jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.link_goal_to_lineage(p_source_goal_id uuid, p_target_goal_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.link_goal_to_lineage(p_source_goal_id uuid, p_target_goal_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.list_my_sessions() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.list_my_sessions() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.log_itb_dose_change(p_therapy_id uuid, p_changed_on date, p_dose numeric, p_note text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.log_itb_dose_change(p_therapy_id uuid, p_changed_on date, p_dose numeric, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mark_therapist_notes_seen(p_patient_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.mark_therapist_notes_seen(p_patient_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reactivate_goal(p_goal_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reactivate_goal(p_goal_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.register_device_push_token(p_token text, p_platform text, p_locale text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_device_push_token(p_token text, p_platform text, p_locale text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reopen_session(p_patient_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reopen_session(p_patient_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.reopen_weekly_checkin(p_checkin_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.reopen_weekly_checkin(p_checkin_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_adjustment_request(p_rating_id uuid, p_status text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.resolve_adjustment_request(p_rating_id uuid, p_status text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.retire_goal(p_goal_id uuid, p_outcome goal_outcome) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.retire_goal(p_goal_id uuid, p_outcome goal_outcome) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.save_treatment_session(p_treatment_cycle_id uuid, p_date date, p_drug_product text, p_total_units numeric, p_dilution text, p_guidance guidance_method, p_notes text, p_injections muscle_injection_input[], p_includes_standard boolean, p_includes_face boolean, p_face_display_mode face_display_mode, p_face_marks face_mark_input[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.save_treatment_session(p_treatment_cycle_id uuid, p_date date, p_drug_product text, p_total_units numeric, p_dilution text, p_guidance guidance_method, p_notes text, p_injections muscle_injection_input[], p_includes_standard boolean, p_includes_face boolean, p_face_display_mode face_display_mode, p_face_marks face_mark_input[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_approved_goal_video_enabled(p_goal_id uuid, p_enabled boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_approved_goal_video_enabled(p_goal_id uuid, p_enabled boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_checkin_training_days(p_checkin_id uuid, p_days smallint[], p_days_therapist smallint[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_checkin_training_days(p_checkin_id uuid, p_days smallint[], p_days_therapist smallint[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_clinic_video_nrs(p_rating_id uuid, p_nrs integer, p_unusable boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_clinic_video_nrs(p_rating_id uuid, p_nrs integer, p_unusable boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_clinic_video_score(p_rating_id uuid, p_rating integer, p_unusable boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_clinic_video_score(p_rating_id uuid, p_rating integer, p_unusable boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_cycle_clinician_note(p_cycle_id uuid, p_note text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_cycle_clinician_note(p_cycle_id uuid, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_goal_baseline_video(p_goal_id uuid, p_path text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_goal_baseline_video(p_goal_id uuid, p_path text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_goal_handoff_note(p_cycle_id uuid, p_goal_id uuid, p_note text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_goal_handoff_note(p_cycle_id uuid, p_goal_id uuid, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_goal_therapy(p_goal_id uuid, p_therapy text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_goal_therapy(p_goal_id uuid, p_therapy text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_goal_video_protocol(p_goal_id uuid, p_instruction text, p_setup text, p_seconds integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_goal_video_protocol(p_goal_id uuid, p_instruction text, p_setup text, p_seconds integer) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_muscle_sharing(p_patient_id uuid, p_share boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_muscle_sharing(p_patient_id uuid, p_share boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_own_date_of_birth(p_date_of_birth date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_own_date_of_birth(p_date_of_birth date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_own_research_consent(p_consent boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_own_research_consent(p_consent boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_own_sex(p_sex patient_sex) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_own_sex(p_sex patient_sex) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_own_video_consent(p_clinical boolean, p_educational boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_own_video_consent(p_clinical boolean, p_educational boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_patient_info(p_patient_id uuid, p_date_of_birth date, p_etiology etiology, p_etiology_detail text, p_affected_side injection_side, p_onset_year smallint, p_ambulation ambulation_status, p_background_notes text, p_sex patient_sex, p_assistive_devices text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_patient_info(p_patient_id uuid, p_date_of_birth date, p_etiology etiology, p_etiology_detail text, p_affected_side injection_side, p_onset_year smallint, p_ambulation ambulation_status, p_background_notes text, p_sex patient_sex, p_assistive_devices text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_patient_medication(p_patient_id uuid, p_current_medication text, p_previous_medication text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_patient_medication(p_patient_id uuid, p_current_medication text, p_previous_medication text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_patient_research_consent(p_patient_id uuid, p_consent boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_patient_research_consent(p_patient_id uuid, p_consent boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_patient_video_consent(p_patient_id uuid, p_clinical boolean, p_educational boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_patient_video_consent(p_patient_id uuid, p_clinical boolean, p_educational boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_patient_wearable_enabled(p_patient_id uuid, p_enabled boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_patient_wearable_enabled(p_patient_id uuid, p_enabled boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_physio_goal_suggestion_status(p_suggestion_id uuid, p_status physio_review_status) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_physio_goal_suggestion_status(p_suggestion_id uuid, p_status physio_review_status) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_physio_muscle_suggestion_status(p_suggestion_id uuid, p_status physio_review_status) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_physio_muscle_suggestion_status(p_suggestion_id uuid, p_status physio_review_status) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_physio_plan(p_patient_id uuid, p_exercise_plan text, p_assistive_devices text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_physio_plan(p_patient_id uuid, p_exercise_plan text, p_assistive_devices text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_suggestion_status(p_suggestion_id uuid, p_status suggestion_status) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_suggestion_status(p_suggestion_id uuid, p_status suggestion_status) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.set_treatment_handoff(p_cycle_id uuid, p_note text, p_treatment_changed boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_treatment_handoff(p_cycle_id uuid, p_note text, p_treatment_changed boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.start_cycle_with_treatment(p_patient_id uuid, p_treatment_date date, p_drug_product text, p_total_units numeric, p_dilution text, p_guidance guidance_method, p_notes text, p_injections muscle_injection_input[], p_includes_standard boolean, p_includes_face boolean, p_face_display_mode face_display_mode, p_face_marks face_mark_input[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_cycle_with_treatment(p_patient_id uuid, p_treatment_date date, p_drug_product text, p_total_units numeric, p_dilution text, p_guidance guidance_method, p_notes text, p_injections muscle_injection_input[], p_includes_standard boolean, p_includes_face boolean, p_face_display_mode face_display_mode, p_face_marks face_mark_input[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.start_itb_therapy(p_patient_id uuid, p_started_on date, p_note text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_itb_therapy(p_patient_id uuid, p_started_on date, p_note text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.start_new_cycle(p_patient_id uuid, p_treatment_date date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.start_new_cycle(p_patient_id uuid, p_treatment_date date) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_physio_assessment(p_patient_id uuid, p_date date, p_note text, p_ratings physio_goal_rating_input_v3[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_physio_assessment(p_patient_id uuid, p_date date, p_note text, p_ratings physio_goal_rating_input_v3[]) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_physio_goal_suggestion(p_patient_id uuid, p_suggested_goal text, p_rationale text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_physio_goal_suggestion(p_patient_id uuid, p_suggested_goal text, p_rationale text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_physio_muscle_suggestion(p_patient_id uuid, p_muscle text, p_side injection_side, p_rationale text, p_related_goal_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_physio_muscle_suggestion(p_patient_id uuid, p_muscle text, p_side injection_side, p_rationale text, p_related_goal_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_therapist_note(p_patient_id uuid, p_body text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_therapist_note(p_patient_id uuid, p_body text) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_weekly_checkin(p_prompt_id uuid, p_ratings weekly_nrs_rating_input[], p_comment text, p_submitter_label submitter_label) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_weekly_checkin(p_prompt_id uuid, p_ratings weekly_nrs_rating_input[], p_comment text, p_submitter_label submitter_label) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_weekly_checkin_v3(p_prompt_id uuid, p_ratings weekly_goal_rating_input[], p_comment text, p_submitter_label submitter_label) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_weekly_checkin_v3(p_prompt_id uuid, p_ratings weekly_goal_rating_input[], p_comment text, p_submitter_label submitter_label) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.submit_weekly_checkin_v4(p_prompt_id uuid, p_ratings weekly_goal_rating_input_v4[], p_comment text, p_submitter_label submitter_label) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_weekly_checkin_v4(p_prompt_id uuid, p_ratings weekly_goal_rating_input_v4[], p_comment text, p_submitter_label submitter_label) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.touch_clinician_session(p_patient_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.touch_clinician_session(p_patient_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.touch_clinician_session() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.touch_clinician_session() TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.unarchive_goal_video(p_archive_id uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unarchive_goal_video(p_archive_id uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.unlock_with_visit_code(p_code text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unlock_with_visit_code(p_code text) TO authenticated, service_role;

COMMIT;
