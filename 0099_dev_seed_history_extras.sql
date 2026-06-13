-- ============================================================================
-- 0099 — DEV-ONLY: enrich the demo patients with data the clinician HISTORY
-- page surfaces, so it can be eyeballed end to end.
--
-- The base seed (dev_seed_b1..b8) creates cycles, goals, check-ins and the
-- patient's own goal ratings, but NOT: diagnosis (etiology), medication,
-- clinician video ratings, physiotherapist assessments/ratings, check-in side
-- effects, or the per-cycle physician→therapist note — all of which the history
-- view reads. This adds dev_seed_history_extras() to fill them in, and wires it
-- into dev_reseed_all() so a reseed produces a fully-populated history.
--
-- Idempotent: the base seed deletes each demo patient's treatment_cycle on
-- reseed, which cascades to physio_assessment / treatment_handoff; this function
-- also clears its own rows defensively before re-inserting. DEV ONLY — touches
-- only the test*@example.com accounts. Re-running is safe.
-- ============================================================================

create or replace function dev_seed_history_extras() returns void
  language plpgsql security definer set search_path = public as $extras$
declare
  v_phys uuid;
  v_clin uuid;
  v_diag etiology;
  v_idx int;
  v_assessment uuid;
  r record;  -- patient
  c record;  -- cycle
  g record;  -- goal
  v_meds text[] := array[
    'Baclofen 25 mg ×3 daily',
    'Tizanidine 4 mg ×3 daily',
    'Baclofen 10 mg ×3 + clonazepam 0.5 mg at night',
    'None at present',
    'Dantrolene 50 mg ×2 daily',
    'Baclofen 20 mg ×3 daily'
  ];
  v_diags etiology[] := array[
    'stroke','tbi','multipleSclerosis','cerebralPalsy','spinalCordInjury','anoxic'
  ]::etiology[];
begin
  -- One physiotherapist (authors physio rows) and one clinician (authors notes).
  select cl.id into v_phys
    from clinician cl join profile p on p.id = cl.profile_id
   where p.role = 'physiotherapist'
   limit 1;
  select id into v_clin from clinician limit 1;

  for r in
    select pat.id as patient_id, pr.email
      from profile pr
      join patient pat on pat.profile_id = pr.id
     where pr.email in (
       'test1@example.com','test2@example.com','test3@example.com',
       'test4@example.com','test5@example.com','test6@example.com')
  loop
    v_idx := coalesce(nullif(regexp_replace(r.email, '\D', '', 'g'), '')::int, 1);
    v_diag := v_diags[((v_idx - 1) % 6) + 1];

    -- 1) Diagnosis + medication (history header: diagnosis pill + med line).
    update patient set
      etiology = v_diag,
      etiology_detail = case v_diag
        when 'stroke' then 'Left MCA infarct, 2021'
        when 'anoxic' then 'Post–cardiac-arrest hypoxic injury, 2020'
        when 'multipleSclerosis' then 'Secondary progressive'
        else null end,
      current_medication = v_meds[((v_idx - 1) % 6) + 1],
      previous_medication = case when v_idx % 2 = 0
        then 'Diazepam (stopped — daytime sedation)' else null end
    where id = r.patient_id;

    -- Defensive cleanup so the function is safe to run on its own.
    delete from physio_assessment where patient_id = r.patient_id;
    delete from treatment_handoff where patient_id = r.patient_id;

    -- 2) Per cycle: physician→therapist note + physio assessment & ratings.
    for c in
      select id, cycle_number, start_date
        from treatment_cycle where patient_id = r.patient_id
    loop
      if v_clin is not null then
        insert into treatment_handoff
          (treatment_cycle_id, patient_id, note, treatment_changed, created_by)
        values (c.id, r.patient_id,
          'Cycle ' || c.cycle_number ||
          ': eased heavy calf loading early on; reassess gait around week 6.',
          null, v_clin)
        on conflict (treatment_cycle_id) do update set note = excluded.note;
      end if;

      if v_phys is not null then
        insert into physio_assessment
          (patient_id, treatment_cycle_id, physiotherapist_id, assessment_date, note)
        values (r.patient_id, c.id, v_phys,
          (coalesce(c.start_date, current_date) + 14),
          'Home programme reviewed; tolerating exercises, range improving.')
        returning id into v_assessment;

        for g in
          select id from approved_goal where treatment_cycle_id = c.id
        loop
          insert into physio_goal_rating
            (physio_assessment_id, approved_goal_id, nrs_value, gas_value,
             working_on, needs_adjustment, adjustment_note)
          values (v_assessment, g.id,
            4 + (floor(random() * 4))::int,      -- 4..7
            (floor(random() * 3))::int - 1,      -- -1..1
            true, false, null);
        end loop;
      end if;
    end loop;

    -- 3) Clinician video ratings: mirror the patient's self-rating on each
    --    rated goal so the history "clinician" dot/column is populated.
    update weekly_goal_rating w
       set clinic_video_rating = w.rating_value,
           clinic_video_nrs = w.nrs_value
      from weekly_checkin ck
     where w.weekly_checkin_id = ck.id
       and ck.patient_id = r.patient_id
       and w.rating_value is not null;

    -- 4) A side effect on one mid-cycle check-in (history flags it in amber).
    update weekly_checkin
       set side_effects = '{weakness}'::side_effect[]
     where patient_id = r.patient_id
       and week_number = 2;
  end loop;

  raise notice 'history extras seeded for demo patients (diagnosis, meds, '
               'clinician + physio ratings, side effects, handoff notes).';
end;
$extras$;

revoke all on function dev_seed_history_extras() from public;
grant execute on function dev_seed_history_extras() to service_role;

-- Wire it into the full reseed so a reseed yields a populated history.
create or replace function dev_reseed_all() returns void
  language plpgsql security definer set search_path = public as $reseed$
begin
  perform dev_seed_b1();
  perform dev_seed_b2();
  perform dev_seed_b3();
  perform dev_seed_b4();
  perform dev_seed_b5();
  perform dev_seed_b6();
  perform dev_seed_b7();
  perform dev_seed_b8();
  perform dev_seed_history_extras();
end;
$reseed$;

revoke all on function dev_reseed_all() from public;
grant execute on function dev_reseed_all() to service_role;
