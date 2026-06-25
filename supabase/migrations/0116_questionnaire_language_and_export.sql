-- ===========================================================================
-- 0116_questionnaire_language_and_export.sql
-- ---------------------------------------------------------------------------
-- Forward delta on 0114 + 0115.
--   1. Adds a `lang` to each questionnaire: the language its prompts/options
--      are authored in (admin picks it). Questionnaire CONTENT is stored as
--      written, not run through app localization. Surfaced + filterable in the
--      clinician library.
--   2. Adds export_questionnaire_responses(): a clinician-gated RPC returning
--      questionnaire answers (RAW, long format) for research-consented patients,
--      keyed by study_code. Feeds a single generic REDCap repeating instrument
--      (questionnaire_item) — the right shape for arbitrary admin-authored
--      questionnaires, whose fields can't be pre-declared per-instrument.
--      Leaves the existing export_research_dataset() untouched.
--
-- SAFE TO RUN AFTER 0115. Forward-only (drops + recreates changed functions).
-- ===========================================================================

-- 1. lang column ------------------------------------------------------------
alter table questionnaire add column if not exists lang text not null default 'en';
comment on column questionnaire.lang is
  'BCP-47-ish language code the prompts/options are authored in (e.g. en, da). '
  'Questionnaire content is stored as written, not localized by the app.';

-- 2. create_questionnaire: replace 7-arg with 8-arg (+ p_lang) --------------
drop function if exists create_questionnaire(text, text, text, jsonb, boolean, text, boolean);

create or replace function create_questionnaire(
  p_key text, p_title text, p_description text default null,
  p_items jsonb default '[]'::jsonb, p_licensed boolean default false,
  p_source_note text default null, p_publish boolean default true,
  p_lang text default 'en'
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_version int; v_item jsonb; v_pos int := 0;
begin
  if not current_user_is_admin() then raise exception 'admin only'; end if;
  if coalesce(btrim(p_key),'')='' or coalesce(btrim(p_title),'')='' then raise exception 'questionnaire key and title are required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'at least one item is required'; end if;
  select coalesce(max(version),0)+1 into v_version from questionnaire where key=btrim(p_key);
  insert into questionnaire (key,version,title,description,licensed,source_note,lang,created_by)
  values (btrim(p_key),v_version,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),
          coalesce(p_licensed,false),nullif(btrim(coalesce(p_source_note,'')),''),
          coalesce(nullif(btrim(coalesce(p_lang,'')),''),'en'),auth.uid())
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pos := v_pos+1;
    insert into questionnaire_item (questionnaire_id,item_key,position,prompt,item_type,required,options,min_value,max_value)
    values (v_id,coalesce(nullif(btrim(v_item->>'item_key'),''),'item_'||v_pos),v_pos,coalesce(nullif(btrim(v_item->>'prompt'),''),'Untitled'),
      (v_item->>'item_type')::questionnaire_item_type,coalesce((v_item->>'required')::boolean,true),
      case when jsonb_typeof(v_item->'options')='array' then v_item->'options' else null end,
      nullif(v_item->>'min_value','')::numeric,nullif(v_item->>'max_value','')::numeric);
  end loop;
  insert into questionnaire_library (key,published,published_by,published_at)
  values (btrim(p_key),coalesce(p_publish,true),auth.uid(),now())
  on conflict (key) do update set published=excluded.published, published_by=excluded.published_by, published_at=now();
  insert into audit_event (actor_profile_id,actor_role,action,entity,entity_id)
  values (auth.uid(),current_app_role(),'questionnaire_created','questionnaire',v_id::text);
  return v_id;
end; $$;
revoke all on function create_questionnaire(text,text,text,jsonb,boolean,text,boolean,text) from public;
grant execute on function create_questionnaire(text,text,text,jsonb,boolean,text,boolean,text) to authenticated, service_role;

-- 3. list_library_questionnaires: + lang return, + optional p_lang filter ----
drop function if exists list_library_questionnaires();
create or replace function list_library_questionnaires(p_lang text default null)
  returns table (questionnaire_id uuid, key text, title text, description text, lang text, item_count int)
  language plpgsql security definer set search_path = public as $$
begin
  if not (current_role_is_care_professional() or current_user_is_admin()) then raise exception 'not authorized'; end if;
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
revoke all on function list_library_questionnaires(text) from public;
grant execute on function list_library_questionnaires(text) to authenticated, service_role;

-- 4. list_patient_questionnaires: + lang return -----------------------------
drop function if exists list_patient_questionnaires(uuid);
create or replace function list_patient_questionnaires(p_patient_id uuid)
  returns table (assignment_id uuid, questionnaire_key text, title text, lang text,
                 schedule_kind questionnaire_schedule_kind, schedule_n int,
                 schedule_weeks int[], active boolean, source text)
  language plpgsql security definer set search_path = public as $$
begin
  if not (current_user_is_admin() or (current_role_is_care_professional() and clinician_can_access_patient(p_patient_id))) then
    raise exception 'no access to this patient'; end if;
  return query
  select a.id, a.questionnaire_key,
    (select q.title from questionnaire q where q.key=a.questionnaire_key and q.is_active order by q.version desc limit 1),
    (select q.lang from questionnaire q where q.key=a.questionnaire_key and q.is_active order by q.version desc limit 1),
    a.schedule_kind, a.schedule_n, a.schedule_weeks, a.active,
    case when a.patient_id is not null then 'patient' else 'study' end
  from questionnaire_assignment a
  where a.patient_id=p_patient_id
     or (a.study_id is not null and exists (select 1 from study_membership m where m.study_id=a.study_id and m.patient_id=p_patient_id))
  order by a.created_at desc;
end; $$;
revoke all on function list_patient_questionnaires(uuid) from public;
grant execute on function list_patient_questionnaires(uuid) to authenticated, service_role;

-- 5. due_questionnaires_for_checkin: + lang return --------------------------
drop function if exists due_questionnaires_for_checkin(uuid);
create or replace function due_questionnaires_for_checkin(p_weekly_checkin_id uuid)
  returns table (questionnaire_id uuid, questionnaire_key text, title text, lang text, assignment_id uuid)
  language plpgsql security definer set search_path = public as $$
declare v_patient uuid; v_week int;
begin
  select patient_id, week_number into v_patient, v_week from weekly_checkin where id = p_weekly_checkin_id;
  if v_patient is null then raise exception 'check-in not found'; end if;
  if not (v_patient = current_patient_id() or clinician_can_access_patient(v_patient)) then raise exception 'no access to this patient'; end if;
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
revoke all on function due_questionnaires_for_checkin(uuid) from public;
grant execute on function due_questionnaires_for_checkin(uuid) to authenticated, service_role;

-- 6. export_questionnaire_responses(): research export (RAW, long format) ----
-- Mirrors export_research_dataset()'s clinician gate exactly. Returns one entry
-- per research-consented patient (by study_code) with a flat array of item
-- answers across all their questionnaire responses. Existing export untouched.
create or replace function export_questionnaire_responses()
  returns jsonb language plpgsql security definer set search_path = public as $$
declare v_result jsonb;
begin
  if current_app_role() <> 'clinician' then
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
revoke all on function export_questionnaire_responses() from public;
grant execute on function export_questionnaire_responses() to authenticated, service_role;
-- end 0116
