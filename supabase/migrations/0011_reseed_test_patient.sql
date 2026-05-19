-- ============================================================================
-- Re-seed test@example.com's patient data with a realistic cycle.
--
-- Run after the 0010 migration. Idempotent: wipes existing test-patient
-- data before re-inserting, so you can run it multiple times safely.
--
-- Scenario:
--   - Patient is currently in week ~8 of cycle 1 (treatment given 8 weeks ago)
--   - Two active goals (hand-opening + night spasms) with full GAS anchors
--   - 16 weekly prompts seeded; first 7 completed with realistic ratings,
--     week 8 pending, weeks 9-16 still pending (will fire as weeks pass)
--   - Comments on weeks 3 and 6 so the speech bubble marker is testable
--   - Treatment session recorded for cycle 1
-- ============================================================================

do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal_hand uuid;
  v_goal_sleep uuid;
  v_treatment_id uuid;
  v_start_date date;
  v_week int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_rating_hand int;
  v_rating_sleep int;
  v_comment text;
begin
  -- Profile lookup
  select id into v_profile_id from profile where email = 'test@example.com';
  if v_profile_id is null then
    raise exception 'No profile for test@example.com — sign in once first to create it';
  end if;

  -- Make sure they're a patient (the auth trigger creates rows as patient
  -- by default, but defensive in case it was changed manually)
  update profile set role = 'patient' where id = v_profile_id and role <> 'patient';

  -- Find or create the patient row
  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id) returning id into v_patient_id;
  end if;

  -- Clean slate: delete everything downstream of this patient
  delete from weekly_goal_rating
   where weekly_checkin_id in (select id from weekly_checkin where patient_id = v_patient_id);
  delete from weekly_checkin where patient_id = v_patient_id;
  delete from weekly_prompt where patient_id = v_patient_id;
  delete from approved_goal where patient_id = v_patient_id;
  delete from goal_suggestion where patient_id = v_patient_id;
  delete from muscle_injection
   where treatment_session_id in (select id from treatment_session where patient_id = v_patient_id);
  delete from treatment_session where patient_id = v_patient_id;
  delete from treatment_cycle where patient_id = v_patient_id;

  -- Find a clinician to record the treatment (any active clinician will do)
  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise exception 'No clinician row exists yet — sign in as a clinician once first';
  end if;

  -- Cycle 1: started 8 weeks ago
  v_start_date := current_date - 56;  -- 56 days = 8 weeks ago

  insert into treatment_cycle (
    patient_id, cycle_number, start_date, status
  ) values (
    v_patient_id, 1, v_start_date, 'active'
  ) returning id into v_cycle_id;

  -- Treatment session for cycle 1
  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    v_patient_id, v_cycle_id, v_start_date, 'Botox', 400,
    '100 IU/ml', 'ultrasound', 'Patient tolerated procedure well.',
    v_clinician_id
  ) returning id into v_treatment_id;

  insert into muscle_injection (
    treatment_session_id, muscle, side, dose_units, note, position
  ) values
    (v_treatment_id, 'Flexor digitorum superficialis', 'left', 50, null, 0),
    (v_treatment_id, 'Flexor digitorum profundus', 'left', 50, 'high EMG activity', 1),
    (v_treatment_id, 'Gastrocnemius', 'left', 150, null, 2),
    (v_treatment_id, 'Soleus', 'left', 150, null, 3);

  -- Active goals for cycle 1
  insert into approved_goal (
    patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2,
    approved_by_clinician_id, status
  ) values (
    v_patient_id, v_cycle_id,
    'Make it easier to open my hand for washing',
    'Patient will be able to open their left hand sufficiently to wash the palm without assistance, at least once per day, within 6 weeks.',
    'Hand cannot be opened at all without assistance',
    'Hand opens partially with significant effort',
    'Hand opens enough to wash palm with effort, most days',
    'Hand opens easily for washing, daily',
    'Hand opens fully and easily, multiple times daily',
    v_clinician_id, 'active'
  ) returning id into v_goal_hand;

  insert into approved_goal (
    patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    anchor_minus2, anchor_minus1, anchor_zero, anchor_plus1, anchor_plus2,
    approved_by_clinician_id, status
  ) values (
    v_patient_id, v_cycle_id,
    'Have fewer night-time leg spasms',
    'Patient will report ≤2 spasm episodes per week disrupting sleep, within 4 weeks.',
    'Spasms wake me almost every night',
    'Spasms wake me 4-5 nights per week',
    'Spasms wake me 2-3 nights per week',
    'Spasms wake me 0-1 nights per week',
    'No night-time spasms at all'
  , v_clinician_id, 'active') returning id into v_goal_sleep;

  -- 16 weekly prompts (the soft cap for botox cycles).
  -- Weeks 1-7 are completed with realistic ratings.
  -- Week 8 is the current pending prompt.
  -- Weeks 9-16 are queued, will become due as time passes.
  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      v_patient_id, v_cycle_id, v_week,
      v_start_date + (v_week * 7), 
      case when v_week <= 7 then 'completed'::prompt_status else 'pending'::prompt_status end
    ) returning id into v_prompt_id;

    if v_week <= 7 then
      -- Realistic ratings: initial -1, climbs to +1 by week 3, peaks at +2 W4,
      -- holds at +1, starts wearing off by W7.
      v_rating_hand := case v_week
        when 1 then -1
        when 2 then 0
        when 3 then 1
        when 4 then 2
        when 5 then 1
        when 6 then 1
        when 7 then 0
      end;

      v_rating_sleep := case v_week
        when 1 then -2
        when 2 then -1
        when 3 then 0
        when 4 then 1
        when 5 then 1
        when 6 then 0
        when 7 then 0
      end;

      v_comment := case v_week
        when 3 then 'Hand opened easier when I tried that new stretch.'
        when 6 then 'Felt a bit tired this week. Spasms were noticeable on Tuesday night.'
        else null
      end;

      insert into weekly_checkin (
        weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
      ) values (
        v_prompt_id, v_patient_id, v_cycle_id, v_week, v_comment
      ) returning id into v_checkin_id;

      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value
      ) values
        (v_checkin_id, v_goal_hand,
         case v_rating_hand
           when -2 then 'muchWorseThanExpected'::rating_label
           when -1 then 'aLittleWorseThanExpected'::rating_label
           when 0 then 'asExpected'::rating_label
           when 1 then 'betterThanExpected'::rating_label
           when 2 then 'muchBetterThanExpected'::rating_label
         end,
         v_rating_hand),
        (v_checkin_id, v_goal_sleep,
         case v_rating_sleep
           when -2 then 'muchWorseThanExpected'::rating_label
           when -1 then 'aLittleWorseThanExpected'::rating_label
           when 0 then 'asExpected'::rating_label
           when 1 then 'betterThanExpected'::rating_label
           when 2 then 'muchBetterThanExpected'::rating_label
         end,
         v_rating_sleep);
    end if;
  end loop;

  raise notice 'Seeded test@example.com: cycle 1, started %, 7 of 16 weeks reported', v_start_date;
end $$;
