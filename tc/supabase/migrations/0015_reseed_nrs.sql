-- ci:skip — dev reseed; executes seed logic requiring test accounts, not applied in CI.
-- ============================================================================
-- 0015 — Re-seed test@example.com with NRS-based goals + history.
--
-- Runs after the 0013/0014 NRS migration. Re-creates the patient's
-- cycle, suggestions, approved goals (with NRS configs), and 7 weeks
-- of check-in history with realistic NRS values.
--
-- Hand goal:  higherIsBetter (10 = hand opens fully)
-- Sleep goal: lowerIsBetter  (0 = no spasms, 10 = every night)
--
-- Cut points are chosen so the GAS trajectory matches the previous
-- seed's rise-peak-decline pattern:
--   hand:  -2≤2, -1≤4, 0=5, +1=7, +2≥8  (rises 3 → 8 → 7 over 7 weeks)
--   sleep: -2≥8, -1=7, 0=5, +1=3, +2≤2  (falls 9 → 3 → 5 over 7 weeks)
-- ============================================================================

do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal_hand uuid;
  v_goal_sleep uuid;
  v_suggestion_hand uuid;
  v_suggestion_sleep uuid;
  v_treatment_id uuid;
  v_start_date date;
  v_week int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_nrs_hand int;
  v_nrs_sleep int;
  v_gas_hand int;
  v_gas_sleep int;
  v_comment text;
begin
  select id into v_profile_id from profile where email = 'test@example.com';
  if v_profile_id is null then
    raise exception 'No profile for test@example.com — sign in once first to create it';
  end if;

  update profile set role = 'patient' where id = v_profile_id and role <> 'patient';

  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id) returning id into v_patient_id;
  end if;

  -- Wipe existing data for this patient.
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

  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise exception 'No clinician row exists yet — sign in as a clinician once first';
  end if;

  v_start_date := current_date - 56;  -- 8 weeks ago

  insert into treatment_cycle (
    patient_id, cycle_number, start_date, status
  ) values (
    v_patient_id, 1, v_start_date, 'active'
  ) returning id into v_cycle_id;

  -- Treatment session
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

  -- Suggestions + approved goals -------------------------------------

  insert into goal_suggestion (
    patient_id, treatment_cycle_id,
    domain, patient_wording, importance, hoped_timeframe,
    difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id,
    'handUse', 'I want to open my hand more easily for washing',
    'high', '12w',
    'Hand stays curled most of the day, hard to clean.',
    'active'
  ) returning id into v_suggestion_hand;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion_hand, v_patient_id, v_cycle_id,
    'Make it easier to open my hand for washing',
    'Patient will be able to open their left hand sufficiently to wash the palm without assistance, at least once per day, within 6 weeks.',
    'On a scale of 0-10, how easy is it to open your hand for washing? (0 = impossible, 10 = completely easy)',
    'higherIsBetter',
    2, 4, 5, 7,
    v_clinician_id, 'active'
  ) returning id into v_goal_hand;

  insert into goal_suggestion (
    patient_id, treatment_cycle_id,
    domain, patient_wording, importance, hoped_timeframe,
    difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id,
    'sleep', 'I want fewer leg spasms at night',
    'high', '4w',
    'Wakes me 4-5 nights a week.',
    'active'
  ) returning id into v_suggestion_sleep;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text,
    nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion_sleep, v_patient_id, v_cycle_id,
    'Have fewer night-time leg spasms',
    'Patient will report ≤2 spasm episodes per week disrupting sleep, within 4 weeks.',
    'On a scale of 0-10, how often did night-time spasms disturb your sleep this week? (0 = never, 10 = every night)',
    'lowerIsBetter',
    2, 4, 5, 7,
    v_clinician_id, 'active'
  ) returning id into v_goal_sleep;

  -- 16 weekly prompts; first 7 completed with realistic NRS history.
  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      v_patient_id, v_cycle_id, v_week,
      v_start_date + (v_week * 7),
      case when v_week <= 7 then 'completed'::prompt_status else 'pending'::prompt_status end
    ) returning id into v_prompt_id;

    if v_week <= 7 then
      -- Hand: higherIsBetter. Starts at 3 (-1), rises to 8 (+2), falls to 5 (0).
      v_nrs_hand := case v_week
        when 1 then 3
        when 2 then 5
        when 3 then 6
        when 4 then 8
        when 5 then 7
        when 6 then 7
        when 7 then 5
      end;

      -- Sleep: lowerIsBetter. Starts at 9 (-2), falls to 3 (+1), rises to 5 (0).
      v_nrs_sleep := case v_week
        when 1 then 9
        when 2 then 7
        when 3 then 5
        when 4 then 3
        when 5 then 3
        when 6 then 5
        when 7 then 5
      end;

      v_gas_hand := nrs_to_gas(v_nrs_hand, 'higherIsBetter', 2, 4, 5, 7);
      v_gas_sleep := nrs_to_gas(v_nrs_sleep, 'lowerIsBetter', 2, 4, 5, 7);

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
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values
        (v_checkin_id, v_goal_hand,
         case v_gas_hand
           when -2 then 'muchWorseThanExpected'::rating_label
           when -1 then 'aLittleWorseThanExpected'::rating_label
           when 0 then 'asExpected'::rating_label
           when 1 then 'betterThanExpected'::rating_label
           when 2 then 'muchBetterThanExpected'::rating_label
         end,
         v_gas_hand, v_nrs_hand),
        (v_checkin_id, v_goal_sleep,
         case v_gas_sleep
           when -2 then 'muchWorseThanExpected'::rating_label
           when -1 then 'aLittleWorseThanExpected'::rating_label
           when 0 then 'asExpected'::rating_label
           when 1 then 'betterThanExpected'::rating_label
           when 2 then 'muchBetterThanExpected'::rating_label
         end,
         v_gas_sleep, v_nrs_sleep);
    end if;
  end loop;

  raise notice 'Seeded test@example.com with NRS data: cycle 1, 7 of 16 weeks reported';
end $$;
