-- ===========================================================================
-- 0115_questionnaire_library_and_clinician_assignment.sql
-- ---------------------------------------------------------------------------
-- Forward delta on 0114. Adds the clinician-facing LIBRARY and lets a CLINICIAN
-- (with an active session) enable PUBLISHED questionnaires for THAT patient with
-- a chosen cadence. Publishing to the library and study-level assignment remain
-- ADMIN-only.
--
-- SAFE TO RUN AFTER 0114 IS ALREADY APPLIED. It:
--   * creates questionnaire_library (key-level publish flag),
--   * backfills it so every questionnaire created under 0114 is published,
--   * DROPS the old create_questionnaire(6-arg) and replaces it with a 7-arg
--     version that also upserts the library,
--   * replaces assign_questionnaire to allow clinician per-patient assignment,
--   * adds set_library_visibility / list_library_questionnaires /
--     list_patient_questionnaires / set_questionnaire_assignment_active.
-- ===========================================================================

-- 1. Library table -----------------------------------------------------------
create table if not exists questionnaire_library (
  key          text primary key,
  published    boolean not null default true,
  published_by uuid,
  published_at timestamptz not null default now()
);
comment on table questionnaire_library is
  'Key-level publish flag. A questionnaire is offered in the clinician library '
  '(assignable per patient) when its key is published here. Admin-curated.';

alter table questionnaire_library enable row level security;
drop policy if exists questionnaire_library_read on questionnaire_library;
create policy questionnaire_library_read on questionnaire_library for select using (true);
drop policy if exists questionnaire_library_admin_all on questionnaire_library;
create policy questionnaire_library_admin_all on questionnaire_library for all using (current_app_role() = 'admin');
grant select on questionnaire_library to authenticated;

-- Backfill: publish every existing questionnaire key.
insert into questionnaire_library (key, published)
  select distinct key, true from questionnaire
  on conflict (key) do nothing;

-- 2. create_questionnaire: drop old 6-arg, add 7-arg that publishes ----------
drop function if exists create_questionnaire(text, text, text, jsonb, boolean, text);

create or replace function create_questionnaire(
  p_key text, p_title text, p_description text default null,
  p_items jsonb default '[]'::jsonb, p_licensed boolean default false,
  p_source_note text default null, p_publish boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_version int; v_item jsonb; v_pos int := 0;
begin
  if not current_user_is_admin() then raise exception 'admin only'; end if;
  if coalesce(btrim(p_key),'')='' or coalesce(btrim(p_title),'')='' then raise exception 'questionnaire key and title are required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items)=0 then raise exception 'at least one item is required'; end if;
  select coalesce(max(version),0)+1 into v_version from questionnaire where key=btrim(p_key);
  insert into questionnaire (key,version,title,description,licensed,source_note,created_by)
  values (btrim(p_key),v_version,btrim(p_title),nullif(btrim(coalesce(p_description,'')),''),coalesce(p_licensed,false),nullif(btrim(coalesce(p_source_note,'')),''),auth.uid())
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
revoke all on function create_questionnaire(text,text,text,jsonb,boolean,text,boolean) from public;
grant execute on function create_questionnaire(text,text,text,jsonb,boolean,text,boolean) to authenticated, service_role;

-- 3. set_library_visibility (ADMIN) -----------------------------------------
create or replace function set_library_visibility(p_key text, p_published boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not current_user_is_admin() then raise exception 'admin only'; end if;
  if not exists (select 1 from questionnaire where key=p_key) then raise exception 'unknown questionnaire key'; end if;
  insert into questionnaire_library (key,published,published_by,published_at)
  values (p_key,p_published,auth.uid(),now())
  on conflict (key) do update set published=excluded.published, published_by=excluded.published_by, published_at=now();
  insert into audit_event (actor_profile_id,actor_role,action,entity,entity_id)
  values (auth.uid(),current_app_role(),'questionnaire_library_'||case when p_published then 'published' else 'unpublished' end,'questionnaire',p_key);
end; $$;
revoke all on function set_library_visibility(text,boolean) from public;
grant execute on function set_library_visibility(text,boolean) to authenticated, service_role;

-- 4. list_library_questionnaires (CARE PRO / ADMIN) -------------------------
create or replace function list_library_questionnaires()
returns table (questionnaire_id uuid, key text, title text, description text, item_count int)
language plpgsql security definer set search_path = public as $$
begin
  if not (current_role_is_care_professional() or current_user_is_admin()) then raise exception 'not authorized'; end if;
  return query
  with latest as (
    select distinct on (q.key) q.id,q.key,q.title,q.description from questionnaire q
      join questionnaire_library lib on lib.key=q.key and lib.published
     where q.is_active order by q.key,q.version desc
  )
  select l.id,l.key,l.title,l.description,(select count(*)::int from questionnaire_item i where i.questionnaire_id=l.id)
    from latest l order by l.title;
end; $$;
revoke all on function list_library_questionnaires() from public;
grant execute on function list_library_questionnaires() to authenticated, service_role;

-- 5. assign_questionnaire: allow clinician per-patient assignment ------------
create or replace function assign_questionnaire(
  p_questionnaire_key text, p_schedule_kind questionnaire_schedule_kind,
  p_study_id uuid default null, p_patient_id uuid default null,
  p_schedule_n int default null, p_schedule_weeks int[] default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_published boolean;
begin
  if (p_study_id is not null) = (p_patient_id is not null) then raise exception 'assign to exactly one of study or patient'; end if;
  if not exists (select 1 from questionnaire where key=p_questionnaire_key) then raise exception 'unknown questionnaire key'; end if;
  select coalesce(published,false) into v_published from questionnaire_library where key=p_questionnaire_key;
  v_published := coalesce(v_published,false);
  if p_study_id is not null then
    if not current_user_is_admin() then raise exception 'admin only for study-level assignment'; end if;
  else
    if not (current_user_is_admin() or (current_role_is_care_professional() and clinician_can_access_patient(p_patient_id))) then
      raise exception 'no active session for this patient'; end if;
  end if;
  if not v_published and not current_user_is_admin() then raise exception 'questionnaire is not available in the library'; end if;
  insert into questionnaire_assignment (questionnaire_key,study_id,patient_id,schedule_kind,schedule_n,schedule_weeks,created_by)
  values (p_questionnaire_key,p_study_id,p_patient_id,p_schedule_kind,p_schedule_n,p_schedule_weeks,auth.uid())
  returning id into v_id;
  insert into audit_event (actor_profile_id,actor_role,action,entity,entity_id)
  values (auth.uid(),current_app_role(),'questionnaire_assigned','questionnaire_assignment',v_id::text);
  return v_id;
end; $$;
revoke all on function assign_questionnaire(text,questionnaire_schedule_kind,uuid,uuid,int,int[]) from public;
grant execute on function assign_questionnaire(text,questionnaire_schedule_kind,uuid,uuid,int,int[]) to authenticated, service_role;

-- 6. list_patient_questionnaires (ADMIN / CARE PRO with access) -------------
create or replace function list_patient_questionnaires(p_patient_id uuid)
returns table (assignment_id uuid, questionnaire_key text, title text,
               schedule_kind questionnaire_schedule_kind, schedule_n int,
               schedule_weeks int[], active boolean, source text)
language plpgsql security definer set search_path = public as $$
begin
  if not (current_user_is_admin() or (current_role_is_care_professional() and clinician_can_access_patient(p_patient_id))) then
    raise exception 'no access to this patient'; end if;
  return query
  select a.id,a.questionnaire_key,
    (select q.title from questionnaire q where q.key=a.questionnaire_key and q.is_active order by q.version desc limit 1),
    a.schedule_kind,a.schedule_n,a.schedule_weeks,a.active,
    case when a.patient_id is not null then 'patient' else 'study' end
  from questionnaire_assignment a
  where a.patient_id=p_patient_id
     or (a.study_id is not null and exists (select 1 from study_membership m where m.study_id=a.study_id and m.patient_id=p_patient_id))
  order by a.created_at desc;
end; $$;
revoke all on function list_patient_questionnaires(uuid) from public;
grant execute on function list_patient_questionnaires(uuid) to authenticated, service_role;

-- 7. set_questionnaire_assignment_active (stop/restart) ----------------------
create or replace function set_questionnaire_assignment_active(p_assignment_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_patient uuid; v_study uuid;
begin
  select patient_id,study_id into v_patient,v_study from questionnaire_assignment where id=p_assignment_id;
  if not found then raise exception 'assignment not found'; end if;
  if v_study is not null then
    if not current_user_is_admin() then raise exception 'admin only for study-level assignment'; end if;
  else
    if not (current_user_is_admin() or (current_role_is_care_professional() and clinician_can_access_patient(v_patient))) then
      raise exception 'no active session for this patient'; end if;
  end if;
  update questionnaire_assignment set active=p_active where id=p_assignment_id;
  insert into audit_event (actor_profile_id,actor_role,action,entity,entity_id)
  values (auth.uid(),current_app_role(),'questionnaire_assignment_'||case when p_active then 'enabled' else 'disabled' end,'questionnaire_assignment',p_assignment_id::text);
end; $$;
revoke all on function set_questionnaire_assignment_active(uuid,boolean) from public;
grant execute on function set_questionnaire_assignment_active(uuid,boolean) to authenticated, service_role;
-- end 0115
