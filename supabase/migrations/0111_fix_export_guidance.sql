-- 0111 — Fix export_research_dataset(): guidance moved to session level in 0009,
-- but the export still read m.guidance (muscle_injection), which no longer has
-- that column — so the RPC threw "column m.guidance does not exist" at runtime
-- (the JS row-builder tests don't exercise the SQL, so it slipped through).
-- The treatment_session alias s is already joined in that subquery, so we read
-- s.guidance instead. Pure create-or-replace; no schema/data change.

create or replace function export_research_dataset()
returns jsonb
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_result jsonb;
begin
  if current_app_role() <> 'clinician' then
    raise exception 'only a clinician can export the research dataset';
  end if;

  -- Assign a study code to any consented patient that lacks one (stable once set).
  with to_assign as (
    select id from patient
    where research_consent
      and research_consent_purged_at is null
      and study_code is null
    order by created_at, id
  )
  update patient p
    set study_code = 'TC-' || lpad(nextval('study_code_seq')::text, 4, '0')
    from to_assign a
    where p.id = a.id;

  with consented as (
    select * from patient
    where research_consent and research_consent_purged_at is null
  ),
  -- Stable per-cycle goal numbering, reused by goal / goal_rating / physio_goal_rating.
  goal_idx as (
    select g.id as goal_id, c.cycle_number,
           row_number() over (
             partition by g.treatment_cycle_id order by g.approved_at, g.id
           ) as goal_index
    from approved_goal g
    join treatment_cycle c on c.id = g.treatment_cycle_id
    where g.patient_id in (select id from consented)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'record_id', p.study_code,
      'birth_year', p.birth_year,
      'sex', p.sex,
      'etiology', p.etiology,
      'etiology_detail', p.etiology_detail,
      'current_medication', p.current_medication,
      'previous_medication', p.previous_medication,
      'affected_side', p.affected_side,
      'ambulation', p.ambulation,
      'research_consent', p.research_consent,
      'research_consent_recorded_at', p.research_consent_recorded_at,
      'created_at', p.created_at,
      'cycles', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', c.cycle_number, 'start_date', c.start_date,
          'status', c.status, 'modality', c.modality) order by c.cycle_number), '[]')
        from treatment_cycle c where c.patient_id = p.id),
      'sessions', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', c.cycle_number, 'date', s.date, 'drug_product', s.drug_product,
          'total_units', s.total_units, 'dilution', s.dilution, 'notes', s.notes)), '[]')
        from treatment_session s join treatment_cycle c on c.id = s.treatment_cycle_id
        where s.patient_id = p.id),
      'muscles', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', c.cycle_number, 'muscle', m.muscle, 'side', m.side,
          'dose_units', m.dose_units, 'guidance', s.guidance) order by c.cycle_number, m.position), '[]')
        from muscle_injection m
        join treatment_session s on s.id = m.treatment_session_id
        join treatment_cycle c on c.id = s.treatment_cycle_id
        where s.patient_id = p.id),
      'goals', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', gi.cycle_number, 'goal_index', gi.goal_index,
          'lineage_id', g.lineage_id, 'version', g.version, 'goal_kind', g.goal_kind,
          'patient_facing_text', g.patient_facing_text, 'smart_text', g.smart_text,
          'nrs_direction', g.nrs_direction, 'nrs_cut_low_low', g.nrs_cut_low_low,
          'nrs_cut_low', g.nrs_cut_low, 'nrs_cut_zero', g.nrs_cut_zero,
          'nrs_cut_high', g.nrs_cut_high, 'nrs_baseline_value', g.nrs_baseline_value,
          'anchor_minus2', g.anchor_minus2, 'anchor_minus1', g.anchor_minus1,
          'anchor_zero', g.anchor_zero, 'anchor_plus1', g.anchor_plus1, 'anchor_plus2', g.anchor_plus2,
          'status', g.status, 'goal_outcome', g.goal_outcome) order by gi.cycle_number, gi.goal_index), '[]')
        from approved_goal g join goal_idx gi on gi.goal_id = g.id
        where g.patient_id = p.id),
      'checkins', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', c.cycle_number, 'week_number', w.week_number,
          'submitted_at', w.submitted_at, 'submitter_label', w.submitter_label,
          'pain', w.pain, 'stiffness', w.stiffness, 'spasm_frequency', w.spasm_frequency,
          'daily_care', w.daily_care, 'side_effects', to_jsonb(w.side_effects),
          'other_side_effect_text', w.other_side_effect_text, 'comment', w.comment,
          'training_days', cardinality(w.training_days),
          'training_days_therapist', cardinality(w.training_days_therapist))), '[]')
        from weekly_checkin w join treatment_cycle c on c.id = w.treatment_cycle_id
        where w.patient_id = p.id),
      'goal_ratings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', c.cycle_number, 'week_number', w.week_number, 'goal_index', gi.goal_index,
          'nrs_value', r.nrs_value, 'rating_value', r.rating_value, 'rating_label', r.rating_label,
          'clinic_video_rating', r.clinic_video_rating, 'clinic_video_nrs', r.clinic_video_nrs)), '[]')
        from weekly_goal_rating r
        join weekly_checkin w on w.id = r.weekly_checkin_id
        join treatment_cycle c on c.id = w.treatment_cycle_id
        join goal_idx gi on gi.goal_id = r.approved_goal_id
        where w.patient_id = p.id),
      'physio', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', c.cycle_number, 'assessment_date', pa.assessment_date, 'note', pa.note)), '[]')
        from physio_assessment pa join treatment_cycle c on c.id = pa.treatment_cycle_id
        where pa.patient_id = p.id),
      'physio_ratings', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'cycle_number', c.cycle_number, 'assessment_date', pa.assessment_date, 'goal_index', gi.goal_index,
          'nrs_value', pr.nrs_value, 'gas_value', pr.gas_value, 'working_on', pr.working_on,
          'needs_adjustment', pr.needs_adjustment, 'adjustment_note', pr.adjustment_note)), '[]')
        from physio_goal_rating pr
        join physio_assessment pa on pa.id = pr.physio_assessment_id
        join treatment_cycle c on c.id = pa.treatment_cycle_id
        join goal_idx gi on gi.goal_id = pr.approved_goal_id
        where pa.patient_id = p.id),
      'itb', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'started_on', it.started_on, 'ended_on', it.ended_on, 'note', it.note)), '[]')
        from itb_therapy it where it.patient_id = p.id),
      'itb_doses', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'started_on', it.started_on, 'changed_on', d.changed_on,
          'dose_mcg_per_day', d.dose_mcg_per_day, 'note', d.note)), '[]')
        from itb_dose_change d join itb_therapy it on it.id = d.itb_therapy_id
        where it.patient_id = p.id)
    ) order by p.study_code
  ), '[]'::jsonb)
  into v_result
  from consented p;

  return v_result;
end;
$$;

grant execute on function export_research_dataset() to authenticated;
