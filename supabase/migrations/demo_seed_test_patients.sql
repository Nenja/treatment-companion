-- ============================================================================
-- DEMO SEED — six test patients, one scenario each.
--
-- For the clinician test-run. Each patient shows a different workflow
-- state so clinicians can see the range without manufacturing it.
--
--   test1@example.com — mid-cycle, going well (positive NRS trend)
--   test2@example.com — mid-cycle, struggling (negative NRS trend)
--   test3@example.com — pending suggestions (patient + therapist) to review
--   test4@example.com — missed/late check-ins (gaps in weekly reporting)
--   test5@example.com — late cycle (~week 15), effect worn off, due re-treatment
--   test6@example.com — longitudinal: 3 completed cycles + 1 active
--
-- PREREQUISITES:
--   * All six patient accounts must already exist (create them via the
--     admin page first). The script looks each up by email.
--   * At least one clinician row must exist (e.g. clinic@example.dk).
--   * For test3, a therapist account is used for the physio suggestions
--     if one exists; if none exists the script falls back to any
--     clinician so it still runs.
--
-- IDEMPOTENT: each patient's data is wiped and re-inserted, so the
-- whole script can be re-run to reset the demo between sessions.
-- Each patient is in its own block — if one fails, the others still
-- apply. Read the NOTICEs at the end to see what succeeded.
-- ============================================================================


-- ===========================================================================
-- Shared helper: none. Each block is self-contained so a failure is
-- isolated. The blocks repeat some boilerplate (lookup, wipe) on
-- purpose — clarity and isolation over DRY for a one-off seed script.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- test1@example.com — MID-CYCLE, GOING WELL
-- Week ~8 of cycle 1. Two goals. 7 weeks of check-ins trending positive.
-- ---------------------------------------------------------------------------
do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal_hand uuid;
  v_goal_sleep uuid;
  v_suggestion uuid;
  v_treatment_id uuid;
  v_start_date date;
  v_week int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_nrs_hand int;
  v_nrs_sleep int;
  v_gas_hand int;
  v_gas_sleep int;
begin
  select id into v_profile_id from profile where email = 'test1@example.com';
  if v_profile_id is null then
    raise warning 'test1: no profile — create the account first. Skipped.';
    return;
  end if;
  update profile set role = 'patient'
    where id = v_profile_id and role <> 'patient';
  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id)
      returning id into v_patient_id;
  end if;

  -- Wipe.
  delete from weekly_goal_rating where weekly_checkin_id in
    (select id from weekly_checkin where patient_id = v_patient_id);
  delete from weekly_checkin where patient_id = v_patient_id;
  delete from weekly_prompt where patient_id = v_patient_id;
  delete from physio_muscle_suggestion where patient_id = v_patient_id;
  delete from physio_goal_suggestion where patient_id = v_patient_id;
  delete from approved_goal where patient_id = v_patient_id;
  delete from goal_suggestion where patient_id = v_patient_id;
  delete from muscle_injection where treatment_session_id in
    (select id from treatment_session where patient_id = v_patient_id);
  delete from treatment_session where patient_id = v_patient_id;
  delete from treatment_cycle where patient_id = v_patient_id;

  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise warning 'test1: no clinician row exists. Skipped.';
    return;
  end if;

  v_start_date := current_date - 56;  -- 8 weeks ago

  insert into treatment_cycle (patient_id, cycle_number, start_date, status)
    values (v_patient_id, 1, v_start_date, 'active')
    returning id into v_cycle_id;

  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    v_patient_id, v_cycle_id, v_start_date, 'Botox', 400,
    '100 IU/ml', 'ultrasound', 'Patient tolerated procedure well.',
    v_clinician_id
  ) returning id into v_treatment_id;

  insert into muscle_injection
    (treatment_session_id, muscle, side, dose_units, note, position)
  values
    (v_treatment_id, 'Flexor digitorum superficialis', 'left', 50, null, 0),
    (v_treatment_id, 'Flexor digitorum profundus', 'left', 50, null, 1),
    (v_treatment_id, 'Gastrocnemius', 'left', 150, null, 2),
    (v_treatment_id, 'Soleus', 'left', 150, null, 3);

  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id, 'handUse',
    'I want to open my hand more easily for washing',
    'high', '12w', 'Hand stays curled most of the day.', 'active'
  ) returning id into v_suggestion;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text, nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion, v_patient_id, v_cycle_id,
    'Make it easier to open my hand for washing',
    'Patient will open their left hand to wash the palm without assistance, daily, within 6 weeks.',
    'On a scale of 0-10, how easy is it to open your hand for washing? (0 = impossible, 10 = completely easy)',
    'higherIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
  ) returning id into v_goal_hand;

  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id, 'sleep',
    'I want fewer leg spasms at night',
    'high', '4w', 'Wakes me 4-5 nights a week.', 'active'
  ) returning id into v_suggestion;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text, nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion, v_patient_id, v_cycle_id,
    'Have fewer night-time leg spasms',
    'Patient will report 2 or fewer spasm episodes per week disrupting sleep, within 4 weeks.',
    'On a scale of 0-10, how often did night-time spasms disturb your sleep this week? (0 = never, 10 = every night)',
    'lowerIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
  ) returning id into v_goal_sleep;

  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      v_patient_id, v_cycle_id, v_week, v_start_date + (v_week * 7),
      case when v_week <= 7 then 'completed'::prompt_status
           else 'pending'::prompt_status end
    ) returning id into v_prompt_id;

    if v_week <= 7 then
      -- Positive trend: hand rises 3→8, sleep falls 9→3.
      v_nrs_hand := (array[3,5,6,8,7,7,6])[v_week];
      v_nrs_sleep := (array[9,7,5,3,3,4,3])[v_week];
      v_gas_hand := nrs_to_gas(v_nrs_hand, 'higherIsBetter', 2, 4, 5, 7);
      v_gas_sleep := nrs_to_gas(v_nrs_sleep, 'lowerIsBetter', 2, 4, 5, 7);

      insert into weekly_checkin (
        weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
      ) values (
        v_prompt_id, v_patient_id, v_cycle_id, v_week,
        case when v_week = 3
          then 'Hand opened easier when I tried that new stretch.'
          else null end
      ) returning id into v_checkin_id;

      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values
        (v_checkin_id, v_goal_hand,
         (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
                'betterThanExpected','muchBetterThanExpected'])[v_gas_hand + 3]::rating_label,
         v_gas_hand, v_nrs_hand),
        (v_checkin_id, v_goal_sleep,
         (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
                'betterThanExpected','muchBetterThanExpected'])[v_gas_sleep + 3]::rating_label,
         v_gas_sleep, v_nrs_sleep);
    end if;
  end loop;

  raise notice 'test1 seeded: mid-cycle, going well.';
end $$;


-- ---------------------------------------------------------------------------
-- test2@example.com — MID-CYCLE, STRUGGLING
-- Week ~8 of cycle 1. Same goals, but NRS history trends the wrong way.
-- ---------------------------------------------------------------------------
do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal_hand uuid;
  v_goal_sleep uuid;
  v_suggestion uuid;
  v_treatment_id uuid;
  v_start_date date;
  v_week int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_nrs_hand int;
  v_nrs_sleep int;
  v_gas_hand int;
  v_gas_sleep int;
begin
  select id into v_profile_id from profile where email = 'test2@example.com';
  if v_profile_id is null then
    raise warning 'test2: no profile — create the account first. Skipped.';
    return;
  end if;
  update profile set role = 'patient'
    where id = v_profile_id and role <> 'patient';
  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id)
      returning id into v_patient_id;
  end if;

  delete from weekly_goal_rating where weekly_checkin_id in
    (select id from weekly_checkin where patient_id = v_patient_id);
  delete from weekly_checkin where patient_id = v_patient_id;
  delete from weekly_prompt where patient_id = v_patient_id;
  delete from physio_muscle_suggestion where patient_id = v_patient_id;
  delete from physio_goal_suggestion where patient_id = v_patient_id;
  delete from approved_goal where patient_id = v_patient_id;
  delete from goal_suggestion where patient_id = v_patient_id;
  delete from muscle_injection where treatment_session_id in
    (select id from treatment_session where patient_id = v_patient_id);
  delete from treatment_session where patient_id = v_patient_id;
  delete from treatment_cycle where patient_id = v_patient_id;

  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise warning 'test2: no clinician row exists. Skipped.';
    return;
  end if;

  v_start_date := current_date - 56;

  insert into treatment_cycle (patient_id, cycle_number, start_date, status)
    values (v_patient_id, 1, v_start_date, 'active')
    returning id into v_cycle_id;

  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    v_patient_id, v_cycle_id, v_start_date, 'Dysport', 500,
    '100 IU/ml', 'electricalStimulation', 'Procedure uneventful.', v_clinician_id
  ) returning id into v_treatment_id;

  insert into muscle_injection
    (treatment_session_id, muscle, side, dose_units, note, position)
  values
    (v_treatment_id, 'Biceps brachii', 'right', 150, null, 0),
    (v_treatment_id, 'Brachialis', 'right', 100, null, 1),
    (v_treatment_id, 'Flexor carpi radialis', 'right', 125, null, 2),
    (v_treatment_id, 'Flexor carpi ulnaris', 'right', 125, null, 3);

  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id, 'handUse',
    'I want to straighten my arm to get dressed',
    'high', '12w', 'Arm stays bent, hard to put a sleeve on.', 'active'
  ) returning id into v_suggestion;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text, nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion, v_patient_id, v_cycle_id,
    'Straighten my arm enough to get dressed',
    'Patient will extend the right elbow enough to put on a sleeve without help, within 8 weeks.',
    'On a scale of 0-10, how easily can you straighten your arm to dress? (0 = not at all, 10 = completely easily)',
    'higherIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
  ) returning id into v_goal_hand;

  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id, 'pain',
    'I want less arm pain during the day',
    'high', '4w', 'Aching most afternoons.', 'active'
  ) returning id into v_suggestion;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text, nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion, v_patient_id, v_cycle_id,
    'Have less arm pain during the day',
    'Patient will report daytime arm pain of 3 or less on a 0-10 scale, within 4 weeks.',
    'On a scale of 0-10, how much arm pain did you have during the day this week? (0 = none, 10 = severe)',
    'lowerIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
  ) returning id into v_goal_sleep;

  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      v_patient_id, v_cycle_id, v_week, v_start_date + (v_week * 7),
      case when v_week <= 7 then 'completed'::prompt_status
           else 'pending'::prompt_status end
    ) returning id into v_prompt_id;

    if v_week <= 7 then
      -- Negative trend: arm barely moves then slips back; pain stays high.
      v_nrs_hand := (array[3,4,4,3,3,2,2])[v_week];
      v_nrs_sleep := (array[7,7,6,7,8,8,9])[v_week];
      v_gas_hand := nrs_to_gas(v_nrs_hand, 'higherIsBetter', 2, 4, 5, 7);
      v_gas_sleep := nrs_to_gas(v_nrs_sleep, 'lowerIsBetter', 2, 4, 5, 7);

      insert into weekly_checkin (
        weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
      ) values (
        v_prompt_id, v_patient_id, v_cycle_id, v_week,
        case when v_week = 5
          then 'Not noticing much change. Pain has been hard this week.'
          else null end
      ) returning id into v_checkin_id;

      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values
        (v_checkin_id, v_goal_hand,
         (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
                'betterThanExpected','muchBetterThanExpected'])[v_gas_hand + 3]::rating_label,
         v_gas_hand, v_nrs_hand),
        (v_checkin_id, v_goal_sleep,
         (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
                'betterThanExpected','muchBetterThanExpected'])[v_gas_sleep + 3]::rating_label,
         v_gas_sleep, v_nrs_sleep);
    end if;
  end loop;

  raise notice 'test2 seeded: mid-cycle, struggling.';
end $$;


-- ---------------------------------------------------------------------------
-- test3@example.com — PENDING SUGGESTIONS TO REVIEW
-- Mid-cycle with one approved goal, PLUS un-reviewed patient goal
-- suggestions and un-reviewed therapist goal + muscle suggestions.
-- ---------------------------------------------------------------------------
do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_therapist_id uuid;
  v_cycle_id uuid;
  v_goal uuid;
  v_suggestion uuid;
  v_treatment_id uuid;
  v_start_date date;
  v_week int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_nrs int;
  v_gas int;
begin
  select id into v_profile_id from profile where email = 'test3@example.com';
  if v_profile_id is null then
    raise warning 'test3: no profile — create the account first. Skipped.';
    return;
  end if;
  update profile set role = 'patient'
    where id = v_profile_id and role <> 'patient';
  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id)
      returning id into v_patient_id;
  end if;

  delete from weekly_goal_rating where weekly_checkin_id in
    (select id from weekly_checkin where patient_id = v_patient_id);
  delete from weekly_checkin where patient_id = v_patient_id;
  delete from weekly_prompt where patient_id = v_patient_id;
  delete from physio_muscle_suggestion where patient_id = v_patient_id;
  delete from physio_goal_suggestion where patient_id = v_patient_id;
  delete from approved_goal where patient_id = v_patient_id;
  delete from goal_suggestion where patient_id = v_patient_id;
  delete from muscle_injection where treatment_session_id in
    (select id from treatment_session where patient_id = v_patient_id);
  delete from treatment_session where patient_id = v_patient_id;
  delete from treatment_cycle where patient_id = v_patient_id;

  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise warning 'test3: no clinician row exists. Skipped.';
    return;
  end if;
  -- Prefer a therapist account for the physio suggestions; fall back
  -- to any clinician so the block still runs if none exists.
  select c.id into v_therapist_id
    from clinician c join profile p on p.id = c.profile_id
    where p.role = 'physiotherapist' limit 1;
  if v_therapist_id is null then
    v_therapist_id := v_clinician_id;
  end if;

  v_start_date := current_date - 35;  -- 5 weeks ago

  insert into treatment_cycle (patient_id, cycle_number, start_date, status)
    values (v_patient_id, 1, v_start_date, 'active')
    returning id into v_cycle_id;

  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    v_patient_id, v_cycle_id, v_start_date, 'Botox', 300,
    '100 IU/ml', 'ultrasound', null, v_clinician_id
  ) returning id into v_treatment_id;

  insert into muscle_injection
    (treatment_session_id, muscle, side, dose_units, note, position)
  values
    (v_treatment_id, 'Gastrocnemius', 'right', 150, null, 0),
    (v_treatment_id, 'Soleus', 'right', 150, null, 1);

  -- One already-approved goal, with a few weeks of check-ins.
  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id, 'walking',
    'I want to walk more steadily indoors',
    'high', '8w', 'Foot turns in, catches on the floor.', 'active'
  ) returning id into v_suggestion;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text, nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion, v_patient_id, v_cycle_id,
    'Walk more steadily indoors',
    'Patient will walk across a room without the foot catching, within 8 weeks.',
    'On a scale of 0-10, how steady did walking indoors feel this week? (0 = very unsteady, 10 = completely steady)',
    'higherIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
  ) returning id into v_goal;

  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      v_patient_id, v_cycle_id, v_week, v_start_date + (v_week * 7),
      case when v_week <= 4 then 'completed'::prompt_status
           else 'pending'::prompt_status end
    ) returning id into v_prompt_id;

    if v_week <= 4 then
      v_nrs := (array[4,5,6,7])[v_week];
      v_gas := nrs_to_gas(v_nrs, 'higherIsBetter', 2, 4, 5, 7);
      insert into weekly_checkin (
        weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
      ) values (
        v_prompt_id, v_patient_id, v_cycle_id, v_week, null
      ) returning id into v_checkin_id;
      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values (
        v_checkin_id, v_goal,
        (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
               'betterThanExpected','muchBetterThanExpected'])[v_gas + 3]::rating_label,
        v_gas, v_nrs);
    end if;
  end loop;

  -- TWO patient goal suggestions still awaiting physician review.
  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values
    (v_patient_id, v_cycle_id, 'sleep',
     'I would like to sleep through the night without cramping',
     'medium', '8w', 'Calf cramps wake me a few times a week.', 'needsReview'),
    (v_patient_id, v_cycle_id, 'handUse',
     'I want to hold a cup steadily with my right hand',
     'high', '12w', 'Hand shakes and grip is weak.', 'needsReview');

  -- ONE therapist goal suggestion awaiting review.
  insert into physio_goal_suggestion (
    patient_id, treatment_cycle_id, physiotherapist_id,
    suggested_goal, rationale, status
  ) values (
    v_patient_id, v_cycle_id, v_therapist_id,
    'Improve standing balance for safe transfers',
    'During sessions the patient shows reduced ankle control on the right; a standing-balance goal would support safer sit-to-stand transfers.',
    'needsReview'
  );

  -- ONE therapist muscle flag awaiting review, linked to the goal.
  insert into physio_muscle_suggestion (
    patient_id, treatment_cycle_id, physiotherapist_id,
    muscle, side, rationale, related_goal_id, status
  ) values (
    v_patient_id, v_cycle_id, v_therapist_id,
    'Tibialis posterior', 'right',
    'Marked inversion during gait; consider this muscle at the next injection visit.',
    v_goal, 'needsReview'
  );

  raise notice 'test3 seeded: pending patient + therapist suggestions.';
end $$;


-- ---------------------------------------------------------------------------
-- test4@example.com — MISSED / LATE CHECK-INS
-- Week ~9 of cycle 1, but several weekly prompts were never completed —
-- gaps in the reporting history. Prompts past their due date with no
-- check-in are left 'pending' (overdue).
-- ---------------------------------------------------------------------------
do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal uuid;
  v_suggestion uuid;
  v_treatment_id uuid;
  v_start_date date;
  v_week int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_nrs int;
  v_gas int;
  v_reported boolean;
begin
  select id into v_profile_id from profile where email = 'test4@example.com';
  if v_profile_id is null then
    raise warning 'test4: no profile — create the account first. Skipped.';
    return;
  end if;
  update profile set role = 'patient'
    where id = v_profile_id and role <> 'patient';
  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id)
      returning id into v_patient_id;
  end if;

  delete from weekly_goal_rating where weekly_checkin_id in
    (select id from weekly_checkin where patient_id = v_patient_id);
  delete from weekly_checkin where patient_id = v_patient_id;
  delete from weekly_prompt where patient_id = v_patient_id;
  delete from physio_muscle_suggestion where patient_id = v_patient_id;
  delete from physio_goal_suggestion where patient_id = v_patient_id;
  delete from approved_goal where patient_id = v_patient_id;
  delete from goal_suggestion where patient_id = v_patient_id;
  delete from muscle_injection where treatment_session_id in
    (select id from treatment_session where patient_id = v_patient_id);
  delete from treatment_session where patient_id = v_patient_id;
  delete from treatment_cycle where patient_id = v_patient_id;

  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise warning 'test4: no clinician row exists. Skipped.';
    return;
  end if;

  v_start_date := current_date - 63;  -- 9 weeks ago

  insert into treatment_cycle (patient_id, cycle_number, start_date, status)
    values (v_patient_id, 1, v_start_date, 'active')
    returning id into v_cycle_id;

  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    v_patient_id, v_cycle_id, v_start_date, 'Botox', 360,
    '100 IU/ml', 'anatomicalLandmarks', null, v_clinician_id
  ) returning id into v_treatment_id;

  insert into muscle_injection
    (treatment_session_id, muscle, side, dose_units, note, position)
  values
    (v_treatment_id, 'Gastrocnemius', 'left', 180, null, 0),
    (v_treatment_id, 'Soleus', 'left', 180, null, 1);

  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id, 'walking',
    'I want to walk to the mailbox without my ankle giving way',
    'high', '8w', 'Ankle rolls on uneven ground.', 'active'
  ) returning id into v_suggestion;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text, nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion, v_patient_id, v_cycle_id,
    'Walk to the mailbox without my ankle giving way',
    'Patient will walk to the mailbox and back without the ankle rolling, within 8 weeks.',
    'On a scale of 0-10, how stable did your ankle feel walking this week? (0 = very unstable, 10 = completely stable)',
    'higherIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
  ) returning id into v_goal;

  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      v_patient_id, v_cycle_id, v_week, v_start_date + (v_week * 7),
      -- Reported only on weeks 1, 2, 5, 8. Weeks 3,4,6,7,9 are gaps:
      -- past their due date but never completed → left pending.
      case when v_week in (1,2,5,8) then 'completed'::prompt_status
           else 'pending'::prompt_status end
    ) returning id into v_prompt_id;

    v_reported := v_week in (1,2,5,8);
    if v_reported then
      -- Reported weeks are 1,2,5,8 — only those indices are read.
      -- Non-reported positions are 0 placeholders, never accessed.
      v_nrs := (array[3,4,0,0,5,0,0,6])[v_week];
      v_gas := nrs_to_gas(v_nrs, 'higherIsBetter', 2, 4, 5, 7);
      insert into weekly_checkin (
        weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
      ) values (
        v_prompt_id, v_patient_id, v_cycle_id, v_week,
        case when v_week = 8
          then 'Sorry I missed a few weeks - was away. Ankle feels a bit better.'
          else null end
      ) returning id into v_checkin_id;
      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values (
        v_checkin_id, v_goal,
        (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
               'betterThanExpected','muchBetterThanExpected'])[v_gas + 3]::rating_label,
        v_gas, v_nrs);
    end if;
  end loop;

  raise notice 'test4 seeded: missed/late check-ins (gaps).';
end $$;


-- ---------------------------------------------------------------------------
-- test5@example.com — LATE CYCLE, DUE FOR RE-TREATMENT
-- Week ~15 of cycle 1. Full check-in history showing the effect peaking
-- then wearing off — the classic "time for the next injection" picture.
-- ---------------------------------------------------------------------------
do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal uuid;
  v_suggestion uuid;
  v_treatment_id uuid;
  v_start_date date;
  v_week int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_nrs int;
  v_gas int;
begin
  select id into v_profile_id from profile where email = 'test5@example.com';
  if v_profile_id is null then
    raise warning 'test5: no profile — create the account first. Skipped.';
    return;
  end if;
  update profile set role = 'patient'
    where id = v_profile_id and role <> 'patient';
  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id)
      returning id into v_patient_id;
  end if;

  delete from weekly_goal_rating where weekly_checkin_id in
    (select id from weekly_checkin where patient_id = v_patient_id);
  delete from weekly_checkin where patient_id = v_patient_id;
  delete from weekly_prompt where patient_id = v_patient_id;
  delete from physio_muscle_suggestion where patient_id = v_patient_id;
  delete from physio_goal_suggestion where patient_id = v_patient_id;
  delete from approved_goal where patient_id = v_patient_id;
  delete from goal_suggestion where patient_id = v_patient_id;
  delete from muscle_injection where treatment_session_id in
    (select id from treatment_session where patient_id = v_patient_id);
  delete from treatment_session where patient_id = v_patient_id;
  delete from treatment_cycle where patient_id = v_patient_id;

  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise warning 'test5: no clinician row exists. Skipped.';
    return;
  end if;

  v_start_date := current_date - 105;  -- 15 weeks ago

  insert into treatment_cycle (patient_id, cycle_number, start_date, status)
    values (v_patient_id, 1, v_start_date, 'active')
    returning id into v_cycle_id;

  insert into treatment_session (
    patient_id, treatment_cycle_id, date, drug_product, total_units,
    dilution, guidance, notes, recorded_by_clinician_id
  ) values (
    v_patient_id, v_cycle_id, v_start_date, 'Botox', 400,
    '100 IU/ml', 'ultrasound', null, v_clinician_id
  ) returning id into v_treatment_id;

  insert into muscle_injection
    (treatment_session_id, muscle, side, dose_units, note, position)
  values
    (v_treatment_id, 'Flexor carpi radialis', 'left', 100, null, 0),
    (v_treatment_id, 'Flexor carpi ulnaris', 'left', 100, null, 1),
    (v_treatment_id, 'Flexor digitorum superficialis', 'left', 100, null, 2),
    (v_treatment_id, 'Flexor digitorum profundus', 'left', 100, null, 3);

  insert into goal_suggestion (
    patient_id, treatment_cycle_id, domain, patient_wording,
    importance, hoped_timeframe, difficulty_context, status
  ) values (
    v_patient_id, v_cycle_id, 'handUse',
    'I want to keep my palm clean and open',
    'high', '12w', 'Hand clenches, palm gets sore.', 'active'
  ) returning id into v_suggestion;

  insert into approved_goal (
    suggestion_id, patient_id, treatment_cycle_id,
    patient_facing_text, smart_text, nrs_question, nrs_direction,
    nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
    approved_by_clinician_id, status
  ) values (
    v_suggestion, v_patient_id, v_cycle_id,
    'Keep my palm open and clean',
    'Patient will open the left hand to clean the palm daily, within 6 weeks.',
    'On a scale of 0-10, how easy is it to open your hand to clean the palm? (0 = impossible, 10 = completely easy)',
    'higherIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
  ) returning id into v_goal;

  for v_week in 1..16 loop
    insert into weekly_prompt (
      patient_id, treatment_cycle_id, week_number, due_date, status
    ) values (
      v_patient_id, v_cycle_id, v_week, v_start_date + (v_week * 7),
      -- 14 weeks reported; weeks 15-16 still pending (current point).
      case when v_week <= 14 then 'completed'::prompt_status
           else 'pending'::prompt_status end
    ) returning id into v_prompt_id;

    if v_week <= 14 then
      -- Effect ramps up to a peak around week 5-6, then wears off,
      -- ending near the untreated baseline — due for re-treatment.
      v_nrs := (array[3,5,7,8,9,9,8,7,6,5,4,3,3,2])[v_week];
      v_gas := nrs_to_gas(v_nrs, 'higherIsBetter', 2, 4, 5, 7);
      insert into weekly_checkin (
        weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
      ) values (
        v_prompt_id, v_patient_id, v_cycle_id, v_week,
        case when v_week = 12
          then 'The effect seems to be wearing off - hand is tighter again.'
          else null end
      ) returning id into v_checkin_id;
      insert into weekly_goal_rating (
        weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
      ) values (
        v_checkin_id, v_goal,
        (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
               'betterThanExpected','muchBetterThanExpected'])[v_gas + 3]::rating_label,
        v_gas, v_nrs);
    end if;
  end loop;

  raise notice 'test5 seeded: late cycle, due for re-treatment.';
end $$;


-- ---------------------------------------------------------------------------
-- test6@example.com — LONGITUDINAL: 3 COMPLETED CYCLES + 1 ACTIVE
-- The same goal carried across four cycles, each with its own treatment
-- (with varying doses) and a full set of check-ins. Shows multi-cycle
-- history — the data a future trend view would draw on.
-- ---------------------------------------------------------------------------
do $$
declare
  v_profile_id uuid;
  v_patient_id uuid;
  v_clinician_id uuid;
  v_cycle_id uuid;
  v_goal uuid;
  v_suggestion uuid;
  v_treatment_id uuid;
  v_cycle_num int;
  v_cycle_start date;
  v_week int;
  v_weeks_done int;
  v_prompt_id uuid;
  v_checkin_id uuid;
  v_nrs int;
  v_gas int;
  v_total_units numeric;
  v_dose numeric;
begin
  select id into v_profile_id from profile where email = 'test6@example.com';
  if v_profile_id is null then
    raise warning 'test6: no profile — create the account first. Skipped.';
    return;
  end if;
  update profile set role = 'patient'
    where id = v_profile_id and role <> 'patient';
  select id into v_patient_id from patient where profile_id = v_profile_id;
  if v_patient_id is null then
    insert into patient (profile_id) values (v_profile_id)
      returning id into v_patient_id;
  end if;

  delete from weekly_goal_rating where weekly_checkin_id in
    (select id from weekly_checkin where patient_id = v_patient_id);
  delete from weekly_checkin where patient_id = v_patient_id;
  delete from weekly_prompt where patient_id = v_patient_id;
  delete from physio_muscle_suggestion where patient_id = v_patient_id;
  delete from physio_goal_suggestion where patient_id = v_patient_id;
  delete from approved_goal where patient_id = v_patient_id;
  delete from goal_suggestion where patient_id = v_patient_id;
  delete from muscle_injection where treatment_session_id in
    (select id from treatment_session where patient_id = v_patient_id);
  delete from treatment_session where patient_id = v_patient_id;
  delete from treatment_cycle where patient_id = v_patient_id;

  select id into v_clinician_id from clinician limit 1;
  if v_clinician_id is null then
    raise warning 'test6: no clinician row exists. Skipped.';
    return;
  end if;

  -- Four cycles of 16 weeks. Cycle 1 starts 48 weeks ago; cycles 1-3
  -- are completed, cycle 4 is active and ~8 weeks in.
  for v_cycle_num in 1..4 loop
    v_cycle_start := current_date - ((4 - v_cycle_num) * 112) - 56;
    -- 112 days = 16 weeks between cycle starts; the -56 puts cycle 4
    -- at ~8 weeks in.

    insert into treatment_cycle (
      patient_id, cycle_number, start_date, status
    ) values (
      v_patient_id, v_cycle_num, v_cycle_start,
      case when v_cycle_num < 4 then 'completed'::cycle_status
           else 'active'::cycle_status end
    ) returning id into v_cycle_id;

    -- Total dose eases down over cycles as the patient responds:
    -- 480, 440, 400, 360.
    v_total_units := (array[480,440,400,360])[v_cycle_num];
    v_dose := v_total_units / 4;

    insert into treatment_session (
      patient_id, treatment_cycle_id, date, drug_product, total_units,
      dilution, guidance, notes, recorded_by_clinician_id
    ) values (
      v_patient_id, v_cycle_id, v_cycle_start, 'Botox', v_total_units,
      '100 IU/ml', 'ultrasound',
      'Cycle ' || v_cycle_num || ' treatment.', v_clinician_id
    ) returning id into v_treatment_id;

    insert into muscle_injection
      (treatment_session_id, muscle, side, dose_units, note, position)
    values
      (v_treatment_id, 'Gastrocnemius', 'right', v_dose, null, 0),
      (v_treatment_id, 'Soleus', 'right', v_dose, null, 1),
      (v_treatment_id, 'Tibialis posterior', 'right', v_dose, null, 2),
      (v_treatment_id, 'Flexor digitorum longus', 'right', v_dose, null, 3);

    -- One goal per cycle (a goal belongs to a cycle; the patient
    -- pursues the same aim each time).
    insert into goal_suggestion (
      patient_id, treatment_cycle_id, domain, patient_wording,
      importance, hoped_timeframe, difficulty_context, status
    ) values (
      v_patient_id, v_cycle_id, 'walking',
      'I want to walk further before my calf tightens',
      'high', '12w', 'Calf tightens after a short distance.', 'active'
    ) returning id into v_suggestion;

    insert into approved_goal (
      suggestion_id, patient_id, treatment_cycle_id,
      patient_facing_text, smart_text, nrs_question, nrs_direction,
      nrs_cut_low_low, nrs_cut_low, nrs_cut_zero, nrs_cut_high,
      approved_by_clinician_id, status
    ) values (
      v_suggestion, v_patient_id, v_cycle_id,
      'Walk further before my calf tightens',
      'Patient will walk a greater distance before calf tightness, within 12 weeks.',
      'On a scale of 0-10, how far could you walk before your calf tightened? (0 = a few steps, 10 = as far as you wanted)',
      'higherIsBetter', 2, 4, 5, 7, v_clinician_id, 'active'
    ) returning id into v_goal;

    -- Completed cycles: all 16 weeks reported. Active cycle: 8 weeks.
    v_weeks_done := case when v_cycle_num < 4 then 16 else 8 end;

    for v_week in 1..16 loop
      insert into weekly_prompt (
        patient_id, treatment_cycle_id, week_number, due_date, status
      ) values (
        v_patient_id, v_cycle_id, v_week, v_cycle_start + (v_week * 7),
        case when v_week <= v_weeks_done then 'completed'::prompt_status
             else 'pending'::prompt_status end
      ) returning id into v_prompt_id;

      if v_week <= v_weeks_done then
        -- Rise-peak-decline within each cycle; the peak improves a
        -- little cycle on cycle (baseline response trending up).
        v_nrs := least(10, greatest(0,
          (array[3,5,7,8,8,7,7,6,6,5,5,4,4,3,3,3])[v_week]
          + (v_cycle_num - 1)));
        v_gas := nrs_to_gas(v_nrs, 'higherIsBetter', 2, 4, 5, 7);
        insert into weekly_checkin (
          weekly_prompt_id, patient_id, treatment_cycle_id, week_number, comment
        ) values (
          v_prompt_id, v_patient_id, v_cycle_id, v_week, null
        ) returning id into v_checkin_id;
        insert into weekly_goal_rating (
          weekly_checkin_id, approved_goal_id, rating_label, rating_value, nrs_value
        ) values (
          v_checkin_id, v_goal,
          (array['muchWorseThanExpected','aLittleWorseThanExpected','asExpected',
                 'betterThanExpected','muchBetterThanExpected'])[v_gas + 3]::rating_label,
          v_gas, v_nrs);
      end if;
    end loop;
  end loop;

  raise notice 'test6 seeded: 3 completed cycles + 1 active (longitudinal).';
end $$;


-- ===========================================================================
-- ENRICHMENT — make all six test patients feel rich.
--
-- The blocks above give each patient their core scenario. This adds
-- the "related" data so no panel is empty when a tester opens a
-- patient: patient goal suggestions (the Suggestions panel), therapist
-- input (the Therapist panel), and a few check-in comments.
--
-- Idempotent: it first clears any enrichment-added suggestions for
-- each patient, then re-adds, so re-running the whole script is safe.
-- It targets each patient's ACTIVE cycle. Patients that already had
-- this data (test3) are simply topped up to the same shape.
-- ===========================================================================
do $$
declare
  v_rec record;
  v_patient_id uuid;
  v_cycle_id uuid;
  v_clinician_id uuid;
  v_therapist_id uuid;
  v_goal_id uuid;
begin
  -- Resolve a therapist (fallback to clinician) for physio suggestions.
  select id into v_clinician_id from clinician limit 1;
  select c.id into v_therapist_id
    from clinician c join profile p on p.id = c.profile_id
    where p.role = 'physiotherapist' limit 1;
  if v_therapist_id is null then
    v_therapist_id := v_clinician_id;
  end if;

  for v_rec in
    select * from (values
      ('test1@example.com',
       'I would like to grip a toothbrush more firmly',
       'handUse', 'medium', '8w',
       'Improve forearm support for self-care tasks',
       'Brachioradialis', 'left',
       'Forearm tightness limits grip; worth considering next round.'),
      ('test2@example.com',
       'I want to be able to turn a key in a lock',
       'handUse', 'medium', '12w',
       'Reduce elbow flexor tone to ease dressing',
       'Brachialis', 'right',
       'Persistent elbow flexion noted in sessions.'),
      ('test4@example.com',
       'I would like to stand at the sink without holding on',
       'walking', 'high', '8w',
       'Improve ankle stability for standing balance',
       'Peroneus longus', 'left',
       'Ankle gives way laterally during single-leg stance.'),
      ('test5@example.com',
       'I want to open my fingers to hold a glass',
       'handUse', 'high', '12w',
       'Address finger flexor tightness',
       'Flexor digitorum profundus', 'left',
       'Strong finger flexion; consider adding at next injection.'),
      ('test6@example.com',
       'I would like to walk a little further each week',
       'walking', 'medium', 'notSure',
       'Support calf flexibility between cycles',
       'Tibialis posterior', 'right',
       'Recurring inversion pattern across cycles.')
    ) as t(email, patient_goal, domain, importance, timeframe,
           physio_goal, muscle, side, physio_rationale)
  loop
    select pt.id into v_patient_id
      from patient pt join profile pr on pr.id = pt.profile_id
     where pr.email = v_rec.email;
    if v_patient_id is null then
      raise warning 'enrich: no patient for % — skipped.', v_rec.email;
      continue;
    end if;

    -- Active cycle for this patient.
    select id into v_cycle_id from treatment_cycle
     where patient_id = v_patient_id and status = 'active'
     order by cycle_number desc limit 1;
    if v_cycle_id is null then
      raise warning 'enrich: no active cycle for % — skipped.', v_rec.email;
      continue;
    end if;

    -- An existing approved goal on that cycle, to link the muscle to.
    select id into v_goal_id from approved_goal
     where treatment_cycle_id = v_cycle_id limit 1;

    -- Clear prior enrichment so re-running doesn't pile up duplicates.
    -- (Only removes needsReview patient suggestions and physio rows on
    --  the active cycle — leaves the core scenario data intact.)
    delete from physio_muscle_suggestion
      where patient_id = v_patient_id and treatment_cycle_id = v_cycle_id;
    delete from physio_goal_suggestion
      where patient_id = v_patient_id and treatment_cycle_id = v_cycle_id;

    -- Patient goal suggestion (Suggestions panel). Skip if this patient
    -- already has a needsReview suggestion on the cycle (e.g. test3).
    if not exists (
      select 1 from goal_suggestion
       where patient_id = v_patient_id
         and treatment_cycle_id = v_cycle_id
         and status = 'needsReview'
    ) then
      insert into goal_suggestion (
        patient_id, treatment_cycle_id, domain, patient_wording,
        importance, hoped_timeframe, difficulty_context, status
      ) values (
        v_patient_id, v_cycle_id, v_rec.domain::goal_domain,
        v_rec.patient_goal, v_rec.importance::importance,
        v_rec.timeframe::hoped_timeframe,
        'Added for demo richness.', 'needsReview'
      );
    end if;

    -- Therapist goal suggestion (Therapist panel).
    insert into physio_goal_suggestion (
      patient_id, treatment_cycle_id, physiotherapist_id,
      suggested_goal, rationale, status
    ) values (
      v_patient_id, v_cycle_id, v_therapist_id,
      v_rec.physio_goal,
      'Observed in therapy sessions between visits.', 'needsReview'
    );

    -- Therapist muscle flag, linked to an existing goal if there is one.
    insert into physio_muscle_suggestion (
      patient_id, treatment_cycle_id, physiotherapist_id,
      muscle, side, rationale, related_goal_id, status
    ) values (
      v_patient_id, v_cycle_id, v_therapist_id,
      v_rec.muscle, v_rec.side::injection_side,
      v_rec.physio_rationale, v_goal_id, 'needsReview'
    );

    -- A couple of check-in comments, on the earliest completed weeks
    -- that don't already have one, so the chart's comment feature has
    -- something to show.
    update weekly_checkin
       set comment = 'Felt a bit more movement this week.'
     where id = (
       select wc.id from weekly_checkin wc
        where wc.patient_id = v_patient_id
          and wc.treatment_cycle_id = v_cycle_id
          and wc.comment is null
        order by wc.week_number asc limit 1
     );
    update weekly_checkin
       set comment = 'Harder day — more tightness than usual.'
     where id = (
       select wc.id from weekly_checkin wc
        where wc.patient_id = v_patient_id
          and wc.treatment_cycle_id = v_cycle_id
          and wc.comment is null
        order by wc.week_number desc limit 1
     );

    raise notice 'enriched %.', v_rec.email;
  end loop;
end $$;
