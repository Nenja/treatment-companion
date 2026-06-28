-- ===========================================================================
-- 0119_questionnaire_due_by_week_and_responses_read.sql
-- ---------------------------------------------------------------------------
-- Forward delta on 0114–0116. Two read-only additions, no schema changes:
--
--   1. due_questionnaires_for_week(patient, week) — the SAME resolution as
--      due_questionnaires_for_checkin, but keyed by (patient, week) instead of
--      a weekly_checkin row. Lets the check-in wizard learn which questionnaires
--      are due BEFORE the check-in is submitted, so it can fold them into one
--      continuous flow with a single progress count (no "you're done… oh wait").
--      Responses are still written against the weekly_checkin_id after submit.
--
--   2. list_patient_questionnaire_responses(patient) — a clinician/patient/admin
--      read of submitted responses (header + per-item answers) so they can be
--      DISPLAYED in-app. Until now responses were captured but only reachable
--      via the research export. Honours data ownership: the patient may read
--      their own (current_patient_id()), a clinician with an active session may
--      read, admin may read. RAW values only — no scoring.
--
-- SAFE TO RUN AFTER 0116. Forward-only; both are create-or-replace.
-- ===========================================================================

-- 1. Due resolver keyed by (patient, week) ----------------------------------
create or replace function due_questionnaires_for_week(p_patient_id uuid, p_week int)
  returns table (questionnaire_id uuid, questionnaire_key text, title text, lang text, assignment_id uuid)
  language plpgsql security definer set search_path = public as $$
begin
  if not (p_patient_id = current_patient_id() or clinician_can_access_patient(p_patient_id)) then
    raise exception 'no access to this patient';
  end if;
  return query
  with active_assign as (
    select a.* from questionnaire_assignment a
     where a.active
       and _questionnaire_due_for_week(a.schedule_kind, a.schedule_n, a.schedule_weeks, p_week)
       and (a.patient_id = p_patient_id or (a.study_id is not null and exists (
              select 1 from study_membership m where m.study_id = a.study_id and m.patient_id = p_patient_id)))
  ), latest as (
    select distinct on (q.key) q.id, q.key, q.title, q.lang
      from questionnaire q
      join active_assign aa on aa.questionnaire_key = q.key
     where q.is_active
     order by q.key, q.version desc
  )
  select l.id, l.key, l.title, l.lang,
         (select aa.id from active_assign aa where aa.questionnaire_key = l.key limit 1)
    from latest l;
end; $$;
revoke all on function due_questionnaires_for_week(uuid, int) from public;
grant execute on function due_questionnaires_for_week(uuid, int) to authenticated, service_role;

-- 2. Read submitted responses for display -----------------------------------
create or replace function list_patient_questionnaire_responses(p_patient_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not (p_patient_id = current_patient_id()
          or clinician_can_access_patient(p_patient_id)
          or current_user_is_admin()) then
    raise exception 'no access to this patient';
  end if;
  select coalesce(jsonb_agg(rec order by sort_at desc), '[]'::jsonb) into v_result
  from (
    select r.submitted_at as sort_at,
      jsonb_build_object(
        'response_id', r.id,
        'questionnaire_key', q.key,
        'questionnaire_title', q.title,
        'lang', q.lang,
        'submitted_at', r.submitted_at,
        'filled_by', r.filled_by,
        'week_number', wc.week_number,
        'cycle_number', tc.cycle_number,
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'item_key', qi.item_key,
            'position', qi.position,
            'prompt', qi.prompt,
            'item_type', qi.item_type,
            'options', qi.options,
            'value_text', ir.value_text,
            'value_num', ir.value_num
          ) order by qi.position)
          from questionnaire_item_response ir
          join questionnaire_item qi on qi.id = ir.item_id
          where ir.response_id = r.id
        ), '[]'::jsonb)
      ) as rec
    from questionnaire_response r
    join questionnaire q on q.id = r.questionnaire_id
    left join weekly_checkin wc on wc.id = r.weekly_checkin_id
    left join treatment_cycle tc on tc.id = r.treatment_cycle_id
    where r.patient_id = p_patient_id
  ) s;
  return v_result;
end; $$;
revoke all on function list_patient_questionnaire_responses(uuid) from public;
grant execute on function list_patient_questionnaire_responses(uuid) to authenticated, service_role;
-- end 0119
