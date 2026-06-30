-- 0125_harden_questionnaire_fn_guards.sql
--
-- Forward fix for NULL-propagation in five questionnaire SECURITY DEFINER
-- functions (same class as 0069/0121/0122). A guard of the form
--   if not (x = current_patient_id() or clinician_can_access_patient(x) ...) then raise
-- fails OPEN for a caller whose current_patient_id() is NULL (any non-patient:
-- a care professional without an active session for that patient, or an authed
-- user with no profile row): `NULL = uuid` is NULL, `NULL or false` is NULL,
-- and `if NULL then raise` does NOT fire. helpers current_user_is_admin() and
-- clinician_can_access_patient() are coalesced/exists-based (never NULL), but
-- current_patient_id(), current_app_role() and current_role_is_care_professional()
-- can each be NULL.
--
-- 0124 already revoked anon EXECUTE on these, so the anon vector is closed; this
-- closes the remaining authenticated-but-unauthorized vector (notably: a logged-in
-- clinician/physio reading questionnaire data for a patient they have no active
-- session with — which would bypass the session-gated access model).
--
-- Each function is recreated VERBATIM except the authorization guard, which now
-- coalesces every NULL-able disjunct to false (or uses IS DISTINCT FROM for the
-- role-equality check). Bodies otherwise unchanged. CREATE OR REPLACE keeps the
-- existing (post-0124) grants; re-asserted at the end for self-containment.

-- 1. list_library_questionnaires(text) ---------------------------------------
create or replace function list_library_questionnaires(p_lang text default null)
  returns table (questionnaire_id uuid, key text, title text, description text, lang text, item_count int)
  language plpgsql security definer set search_path = public as $$
begin
  if not (coalesce(current_role_is_care_professional(), false) or current_user_is_admin()) then raise exception 'not authorized'; end if;
  return query
  with latest as (
    select distinct on (q.key) q.id, q.key, q.title, q.description, q.lang
      from questionnaire q
      join questionnaire_library lib on lib.key = q.key and lib.published
     where q.is_active
       and (p_lang is null or q.lang = p_lang)
     order by q.key, q.version desc
  )
  select l.id, l.key, l.title, l.description, l.lang,
         (select count(*)::int from questionnaire_item i where i.questionnaire_id = l.id)
    from latest l order by l.title;
end; $$;
revoke all on function list_library_questionnaires(text) from public, anon;
grant execute on function list_library_questionnaires(text) to authenticated, service_role;

-- 2. due_questionnaires_for_checkin(uuid) ------------------------------------
create or replace function due_questionnaires_for_checkin(p_weekly_checkin_id uuid)
  returns table (questionnaire_id uuid, questionnaire_key text, title text, lang text, assignment_id uuid)
  language plpgsql security definer set search_path = public as $$
declare v_patient uuid; v_week int;
begin
  select patient_id, week_number into v_patient, v_week from weekly_checkin where id = p_weekly_checkin_id;
  if v_patient is null then raise exception 'check-in not found'; end if;
  if not (coalesce(v_patient = current_patient_id(), false) or clinician_can_access_patient(v_patient)) then raise exception 'no access to this patient'; end if;
  return query
  with active_assign as (
    select a.* from questionnaire_assignment a
     where a.active and _questionnaire_due_for_week(a.schedule_kind, a.schedule_n, a.schedule_weeks, v_week)
       and (a.patient_id = v_patient or (a.study_id is not null and exists (
              select 1 from study_membership m where m.study_id = a.study_id and m.patient_id = v_patient)))
  ), latest as (
    select distinct on (q.key) q.id, q.key, q.title, q.lang
      from questionnaire q join active_assign aa on aa.questionnaire_key = q.key
     where q.is_active order by q.key, q.version desc
  )
  select l.id, l.key, l.title, l.lang,
         (select aa.id from active_assign aa where aa.questionnaire_key = l.key limit 1)
    from latest l;
end; $$;
revoke all on function due_questionnaires_for_checkin(uuid) from public, anon;
grant execute on function due_questionnaires_for_checkin(uuid) to authenticated, service_role;

-- 3. due_questionnaires_for_week(uuid, int) ----------------------------------
create or replace function due_questionnaires_for_week(p_patient_id uuid, p_week int)
  returns table (questionnaire_id uuid, questionnaire_key text, title text, lang text, assignment_id uuid)
  language plpgsql security definer set search_path = public as $$
begin
  if not (coalesce(p_patient_id = current_patient_id(), false) or clinician_can_access_patient(p_patient_id)) then
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
revoke all on function due_questionnaires_for_week(uuid, int) from public, anon;
grant execute on function due_questionnaires_for_week(uuid, int) to authenticated, service_role;

-- 4. list_patient_questionnaire_responses(uuid) ------------------------------
create or replace function list_patient_questionnaire_responses(p_patient_id uuid)
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if not (coalesce(p_patient_id = current_patient_id(), false)
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
revoke all on function list_patient_questionnaire_responses(uuid) from public, anon;
grant execute on function list_patient_questionnaire_responses(uuid) to authenticated, service_role;

-- 5. export_questionnaire_responses() ----------------------------------------
-- IS DISTINCT FROM treats a NULL role as "not the clinician" -> raises.
create or replace function export_questionnaire_responses()
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if current_app_role() is distinct from 'clinician' then
    raise exception 'only a clinician can export the research dataset';
  end if;
  select coalesce(jsonb_agg(rec), '[]'::jsonb) into v_result from (
    select jsonb_build_object(
      'record_id', p.study_code,
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'q_key', q.key, 'q_version', q.version, 'q_lang', q.lang,
          'submitted_at', r.submitted_at, 'week_number', wc.week_number,
          'cycle_number', tc.cycle_number, 'filled_by', r.filled_by,
          'item_key', qi.item_key, 'value_text', ir.value_text, 'value_num', ir.value_num
        ) order by r.submitted_at, qi.position)
        from questionnaire_response r
        join questionnaire q on q.id = r.questionnaire_id
        join questionnaire_item_response ir on ir.response_id = r.id
        join questionnaire_item qi on qi.id = ir.item_id
        left join weekly_checkin wc on wc.id = r.weekly_checkin_id
        left join treatment_cycle tc on tc.id = r.treatment_cycle_id
        where r.patient_id = p.id
      ), '[]'::jsonb)
    ) as rec
    from patient p
    where p.research_consent and p.research_consent_purged_at is null and p.study_code is not null
  ) s;
  return v_result;
end; $$;
revoke all on function export_questionnaire_responses() from public, anon;
grant execute on function export_questionnaire_responses() to authenticated, service_role;
