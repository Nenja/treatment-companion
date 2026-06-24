-- 0083_physio_goal_signals.sql
-- ---------------------------------------------------------------------------
-- Three low-effort signals the therapist gives the care triangle, captured
-- inside the assessment they already file (no double documentation — their
-- own clinical notes stay in their own system):
--
--   * how many days they train  — already implicit: each physio_assessment
--                                 IS a dated therapy visit, so the visit
--                                 auto-registers when they submit. (Surfaced
--                                 to the physician in the next slice.)
--   * what functions they work on — `working_on` per goal.
--   * where they need treatment adjusted to make an exercise feasible —
--                                 `needs_adjustment` + a short `adjustment_note`
--                                 per goal, routed to the physician.
--
-- A goal row may now carry these flags WITHOUT a new rating, so nrs_value
-- becomes nullable (a therapist can mark "working on this" / "needs
-- adjustment" without re-scoring it that visit).
-- ---------------------------------------------------------------------------

alter table physio_goal_rating
  alter column nrs_value drop not null;

alter table physio_goal_rating
  add column if not exists working_on boolean not null default false;
alter table physio_goal_rating
  add column if not exists needs_adjustment boolean not null default false;
alter table physio_goal_rating
  add column if not exists adjustment_note text
    check (adjustment_note is null or length(adjustment_note) <= 2000);

comment on column physio_goal_rating.working_on is
  'The therapist is currently working on this goal/function in their sessions.';
comment on column physio_goal_rating.needs_adjustment is
  'The therapist is asking the physician to consider adjusting treatment to '
  'make working on this goal more feasible.';
comment on column physio_goal_rating.adjustment_note is
  'Short free-text reason for the adjustment request (the one thing worth the '
  'therapist''s words; everything else is a tap).';

-- Extended ratings input (adds the three signals; nrs_value now optional).
do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'physio_goal_rating_input_v2'
  ) then
    create type physio_goal_rating_input_v2 as (
      approved_goal_id uuid,
      nrs_value int,
      working_on boolean,
      needs_adjustment boolean,
      adjustment_note text
    );
  end if;
end$$;

-- Replace submit_physio_assessment with the v2-typed version (the array
-- element type changed, so the old overload is dropped first).
drop function if exists submit_physio_assessment(
  uuid, date, text, physio_goal_rating_input[]
);

create or replace function submit_physio_assessment(
  p_patient_id uuid,
  p_date date,
  p_note text,
  p_ratings physio_goal_rating_input_v2[]
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_physio_id uuid;
  v_cycle_id uuid;
  v_assessment_id uuid;
  v_rating physio_goal_rating_input_v2;
  v_goal_patient uuid;
begin
  if current_app_role() <> 'physiotherapist' then
    raise exception 'caller is not a physiotherapist';
  end if;

  v_physio_id := current_clinician_id();
  if v_physio_id is null then
    raise exception 'no professional record for caller';
  end if;

  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  select id into v_cycle_id
    from treatment_cycle
   where patient_id = p_patient_id and status = 'active'
   order by cycle_number desc
   limit 1;
  if v_cycle_id is null then
    raise exception 'patient has no active treatment cycle';
  end if;

  insert into physio_assessment (
    patient_id, treatment_cycle_id, physiotherapist_id, assessment_date, note
  ) values (
    p_patient_id, v_cycle_id, v_physio_id, p_date, nullif(trim(p_note), '')
  ) returning id into v_assessment_id;

  foreach v_rating in array p_ratings loop
    if v_rating.nrs_value is not null
       and (v_rating.nrs_value < 0 or v_rating.nrs_value > 10) then
      raise exception 'NRS value out of range: %', v_rating.nrs_value;
    end if;

    select patient_id into v_goal_patient
      from approved_goal where id = v_rating.approved_goal_id;
    if v_goal_patient is null then
      raise exception 'goal not found: %', v_rating.approved_goal_id;
    end if;
    if v_goal_patient <> p_patient_id then
      raise exception 'goal does not belong to this patient';
    end if;

    insert into physio_goal_rating (
      physio_assessment_id, approved_goal_id, nrs_value,
      working_on, needs_adjustment, adjustment_note
    ) values (
      v_assessment_id, v_rating.approved_goal_id, v_rating.nrs_value,
      coalesce(v_rating.working_on, false),
      coalesce(v_rating.needs_adjustment, false),
      nullif(trim(coalesce(v_rating.adjustment_note, '')), '')
    );
  end loop;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'physiotherapist', 'physio_assessment_submitted',
    'physio_assessment', v_assessment_id::text
  );

  return v_assessment_id;
end;
$$;

revoke all on function submit_physio_assessment(
  uuid, date, text, physio_goal_rating_input_v2[]
) from public;
grant execute on function submit_physio_assessment(
  uuid, date, text, physio_goal_rating_input_v2[]
) to authenticated;
