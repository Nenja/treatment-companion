-- ===========================================================================
-- 0114_questionnaire_engine.sql  (AS APPLIED -- foundation; see 0115 for the
-- clinician library + per-patient assignment delta.)
-- ---------------------------------------------------------------------------
-- Modular questionnaire engine (slice 1: data foundation). RAW CAPTURE ONLY.
-- Definition -> items -> assignment -> response. Mirrors existing patterns:
-- patient self-access via current_patient_id(); clinician via
-- clinician_can_access_patient(); admin via current_app_role(); writes via
-- SECURITY DEFINER RPCs that self-authorize and write audit_event.
-- ===========================================================================

do $$ begin create type questionnaire_item_type as enum
  ('likert','nrs_0_10','single_choice','multi_choice','number','text','boolean');
exception when duplicate_object then null; end $$;
do $$ begin create type questionnaire_schedule_kind as enum
  ('baseline','every_checkin','every_n_checkins','first_of_cycle','monthly','specific_weeks');
exception when duplicate_object then null; end $$;
do $$ begin create type questionnaire_fill_source as enum
  ('patient','caregiver','clinician','therapist');
exception when duplicate_object then null; end $$;

create table if not exists questionnaire (
  id uuid primary key default gen_random_uuid(),
  key text not null, version int not null default 1, title text not null,
  description text, is_active boolean not null default true,
  licensed boolean not null default false, source_note text,
  created_by uuid, created_at timestamptz not null default now(),
  unique (key, version)
);
create table if not exists questionnaire_item (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references questionnaire(id) on delete cascade,
  item_key text not null, position int not null, prompt text not null,
  item_type questionnaire_item_type not null, required boolean not null default true,
  options jsonb, min_value numeric, max_value numeric,
  unique (questionnaire_id, item_key), unique (questionnaire_id, position)
);
create table if not exists questionnaire_assignment (
  id uuid primary key default gen_random_uuid(),
  questionnaire_key text not null,
  study_id uuid references study(id) on delete cascade,
  patient_id uuid references patient(id) on delete cascade,
  schedule_kind questionnaire_schedule_kind not null,
  schedule_n int, schedule_weeks int[], active boolean not null default true,
  created_by uuid, created_at timestamptz not null default now(),
  constraint questionnaire_assignment_one_target check ((study_id is not null) <> (patient_id is not null)),
  constraint questionnaire_assignment_n_ck check (schedule_kind <> 'every_n_checkins' or (schedule_n is not null and schedule_n >= 1)),
  constraint questionnaire_assignment_weeks_ck check (schedule_kind <> 'specific_weeks' or (schedule_weeks is not null and array_length(schedule_weeks,1) >= 1))
);
create index if not exists questionnaire_assignment_study_idx on questionnaire_assignment(study_id);
create index if not exists questionnaire_assignment_patient_idx on questionnaire_assignment(patient_id);
create index if not exists questionnaire_assignment_key_idx on questionnaire_assignment(questionnaire_key);
create table if not exists questionnaire_response (
  id uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references questionnaire(id) on delete restrict,
  patient_id uuid not null references patient(id) on delete cascade,
  weekly_checkin_id uuid references weekly_checkin(id) on delete set null,
  treatment_cycle_id uuid references treatment_cycle(id) on delete set null,
  assignment_id uuid references questionnaire_assignment(id) on delete set null,
  filled_by questionnaire_fill_source not null default 'patient',
  submitted_at timestamptz not null default now()
);
create index if not exists questionnaire_response_patient_idx on questionnaire_response(patient_id);
create index if not exists questionnaire_response_checkin_idx on questionnaire_response(weekly_checkin_id);
create index if not exists questionnaire_response_q_idx on questionnaire_response(questionnaire_id);
create table if not exists questionnaire_item_response (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references questionnaire_response(id) on delete cascade,
  item_id uuid not null references questionnaire_item(id) on delete restrict,
  value_text text, value_num numeric, unique (response_id, item_id)
);

alter table questionnaire enable row level security;
alter table questionnaire_item enable row level security;
alter table questionnaire_assignment enable row level security;
alter table questionnaire_response enable row level security;
alter table questionnaire_item_response enable row level security;

drop policy if exists questionnaire_read on questionnaire;
create policy questionnaire_read on questionnaire for select using (true);
drop policy if exists questionnaire_admin_all on questionnaire;
create policy questionnaire_admin_all on questionnaire for all using (current_app_role() = 'admin');
drop policy if exists questionnaire_item_read on questionnaire_item;
create policy questionnaire_item_read on questionnaire_item for select using (true);
drop policy if exists questionnaire_item_admin_all on questionnaire_item;
create policy questionnaire_item_admin_all on questionnaire_item for all using (current_app_role() = 'admin');
drop policy if exists questionnaire_assignment_pro_read on questionnaire_assignment;
create policy questionnaire_assignment_pro_read on questionnaire_assignment for select using (current_role_is_care_professional());
drop policy if exists questionnaire_assignment_admin_all on questionnaire_assignment;
create policy questionnaire_assignment_admin_all on questionnaire_assignment for all using (current_app_role() = 'admin');
drop policy if exists questionnaire_response_patient_read on questionnaire_response;
create policy questionnaire_response_patient_read on questionnaire_response for select using (patient_id = current_patient_id());
drop policy if exists questionnaire_response_clinician_read on questionnaire_response;
create policy questionnaire_response_clinician_read on questionnaire_response for select using (clinician_can_access_patient(patient_id));
drop policy if exists questionnaire_response_admin_all on questionnaire_response;
create policy questionnaire_response_admin_all on questionnaire_response for all using (current_app_role() = 'admin');
drop policy if exists questionnaire_item_response_patient_read on questionnaire_item_response;
create policy questionnaire_item_response_patient_read on questionnaire_item_response for select using (exists (select 1 from questionnaire_response r where r.id = response_id and r.patient_id = current_patient_id()));
drop policy if exists questionnaire_item_response_clinician_read on questionnaire_item_response;
create policy questionnaire_item_response_clinician_read on questionnaire_item_response for select using (exists (select 1 from questionnaire_response r where r.id = response_id and clinician_can_access_patient(r.patient_id)));
drop policy if exists questionnaire_item_response_admin_all on questionnaire_item_response;
create policy questionnaire_item_response_admin_all on questionnaire_item_response for all using (current_app_role() = 'admin');

grant select on questionnaire, questionnaire_item, questionnaire_assignment,
                questionnaire_response, questionnaire_item_response to authenticated;

create or replace function create_questionnaire(
  p_key text, p_title text, p_description text default null,
  p_items jsonb default '[]'::jsonb, p_licensed boolean default false, p_source_note text default null
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
  insert into audit_event (actor_profile_id,actor_role,action,entity,entity_id)
  values (auth.uid(),current_app_role(),'questionnaire_created','questionnaire',v_id::text);
  return v_id;
end; $$;
revoke all on function create_questionnaire(text,text,text,jsonb,boolean,text) from public;
grant execute on function create_questionnaire(text,text,text,jsonb,boolean,text) to authenticated, service_role;

create or replace function assign_questionnaire(
  p_questionnaire_key text, p_schedule_kind questionnaire_schedule_kind,
  p_study_id uuid default null, p_patient_id uuid default null,
  p_schedule_n int default null, p_schedule_weeks int[] default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not current_user_is_admin() then raise exception 'admin only'; end if;
  if (p_study_id is not null) = (p_patient_id is not null) then raise exception 'assign to exactly one of study or patient'; end if;
  if not exists (select 1 from questionnaire where key=p_questionnaire_key) then raise exception 'unknown questionnaire key'; end if;
  insert into questionnaire_assignment (questionnaire_key,study_id,patient_id,schedule_kind,schedule_n,schedule_weeks,created_by)
  values (p_questionnaire_key,p_study_id,p_patient_id,p_schedule_kind,p_schedule_n,p_schedule_weeks,auth.uid())
  returning id into v_id;
  insert into audit_event (actor_profile_id,actor_role,action,entity,entity_id)
  values (auth.uid(),current_app_role(),'questionnaire_assigned','questionnaire_assignment',v_id::text);
  return v_id;
end; $$;
revoke all on function assign_questionnaire(text,questionnaire_schedule_kind,uuid,uuid,int,int[]) from public;
grant execute on function assign_questionnaire(text,questionnaire_schedule_kind,uuid,uuid,int,int[]) to authenticated, service_role;

create or replace function _questionnaire_due_for_week(p_kind questionnaire_schedule_kind,p_n int,p_weeks int[],p_week int)
returns boolean language sql immutable set search_path=public as $$
  select case p_kind
    when 'every_checkin' then true when 'baseline' then p_week<=1 when 'first_of_cycle' then p_week=1
    when 'every_n_checkins' then p_week>=1 and ((p_week-1)%greatest(p_n,1))=0
    when 'monthly' then p_week>=1 and ((p_week-1)%4)=0
    when 'specific_weeks' then p_week = any(coalesce(p_weeks,'{}'::int[])) else false end;
$$;

create or replace function due_questionnaires_for_checkin(p_weekly_checkin_id uuid)
returns table (questionnaire_id uuid, questionnaire_key text, title text, assignment_id uuid)
language plpgsql security definer set search_path=public as $$
declare v_patient uuid; v_week int;
begin
  select patient_id,week_number into v_patient,v_week from weekly_checkin where id=p_weekly_checkin_id;
  if v_patient is null then raise exception 'check-in not found'; end if;
  if not (v_patient=current_patient_id() or clinician_can_access_patient(v_patient)) then raise exception 'no access to this patient'; end if;
  return query
  with active_assign as (
    select a.* from questionnaire_assignment a
     where a.active and _questionnaire_due_for_week(a.schedule_kind,a.schedule_n,a.schedule_weeks,v_week)
       and (a.patient_id=v_patient or (a.study_id is not null and exists (select 1 from study_membership m where m.study_id=a.study_id and m.patient_id=v_patient)))
  ), latest as (
    select distinct on (q.key) q.id,q.key,q.title from questionnaire q
      join active_assign aa on aa.questionnaire_key=q.key where q.is_active order by q.key,q.version desc
  )
  select l.id,l.key,l.title,(select aa.id from active_assign aa where aa.questionnaire_key=l.key limit 1) from latest l;
end; $$;
revoke all on function due_questionnaires_for_checkin(uuid) from public;
grant execute on function due_questionnaires_for_checkin(uuid) to authenticated, service_role;

create or replace function submit_questionnaire_response(
  p_questionnaire_id uuid, p_answers jsonb, p_weekly_checkin_id uuid default null,
  p_assignment_id uuid default null, p_patient_id uuid default null,
  p_filled_by questionnaire_fill_source default 'patient'
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_patient uuid; v_cycle uuid; v_resp uuid; v_item record; v_ans jsonb; v_val text; v_num numeric;
begin
  if not exists (select 1 from questionnaire where id=p_questionnaire_id) then raise exception 'unknown questionnaire'; end if;
  if jsonb_typeof(coalesce(p_answers,'null'::jsonb)) <> 'array' then raise exception 'answers must be a json array'; end if;
  if current_patient_id() is not null then
    v_patient := current_patient_id();
    if p_patient_id is not null and p_patient_id <> v_patient then raise exception 'patients may only submit their own responses'; end if;
  else
    if not current_role_is_care_professional() then raise exception 'not authorized'; end if;
    if p_patient_id is null then raise exception 'patient id required'; end if;
    if not clinician_can_access_patient(p_patient_id) then raise exception 'no active session for this patient'; end if;
    v_patient := p_patient_id;
  end if;
  if p_weekly_checkin_id is not null then
    select treatment_cycle_id into v_cycle from weekly_checkin where id=p_weekly_checkin_id and patient_id=v_patient;
    if not found then raise exception 'check-in does not belong to this patient'; end if;
  end if;
  insert into questionnaire_response (questionnaire_id,patient_id,weekly_checkin_id,treatment_cycle_id,assignment_id,filled_by)
  values (p_questionnaire_id,v_patient,p_weekly_checkin_id,v_cycle,p_assignment_id,coalesce(p_filled_by,'patient')) returning id into v_resp;
  for v_item in select * from questionnaire_item where questionnaire_id=p_questionnaire_id order by position loop
    select e into v_ans from jsonb_array_elements(p_answers) e where e->>'item_key'=v_item.item_key limit 1;
    if v_ans is null then if v_item.required then raise exception 'missing required answer: %',v_item.item_key; end if; continue; end if;
    v_val := v_ans->>'value'; v_num := null;
    if v_item.item_type in ('nrs_0_10','number') then
      v_num := nullif(v_val,'')::numeric;
      if v_item.item_type='nrs_0_10' and v_num is not null and (v_num<0 or v_num>10) then raise exception '% must be between 0 and 10',v_item.item_key; end if;
      if v_item.min_value is not null and v_num is not null and v_num<v_item.min_value then raise exception '% below minimum',v_item.item_key; end if;
      if v_item.max_value is not null and v_num is not null and v_num>v_item.max_value then raise exception '% above maximum',v_item.item_key; end if;
    elsif v_item.item_type='boolean' then
      v_num := case when v_val in ('true','1','yes') then 1 when v_val in ('false','0','no') then 0 else null end;
    end if;
    insert into questionnaire_item_response (response_id,item_id,value_text,value_num) values (v_resp,v_item.id,v_val,v_num);
  end loop;
  insert into audit_event (actor_profile_id,actor_role,action,entity,entity_id)
  values (auth.uid(),current_app_role(),'questionnaire_response_submitted','questionnaire_response',v_resp::text);
  return v_resp;
end; $$;
revoke all on function submit_questionnaire_response(uuid,jsonb,uuid,uuid,uuid,questionnaire_fill_source) from public;
grant execute on function submit_questionnaire_response(uuid,jsonb,uuid,uuid,uuid,questionnaire_fill_source) to authenticated, service_role;
-- end 0114
