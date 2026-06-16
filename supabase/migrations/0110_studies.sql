-- 0110_studies.sql
--
-- Study membership, layered on top of (and orthogonal to) research consent.
--
-- Context: every research-CONSENTED patient already gets a `study_code`
-- (the REDCap record_id, migration 0106) and is included in the
-- consent-gated REDCap export. But "consented to research use" is not the
-- same as "enrolled in a particular study" — a clinic may run several
-- concurrent studies and needs to pick out which consented patients belong
-- to which. This migration adds that grouping WITHOUT changing what the
-- export emits: the export RPC (export_research_dataset, 0106) is untouched
-- and still gated purely on research_consent. Study membership is an admin
-- tool for filtering/identifying participants, not a new export gate.
--
-- Tables:
--   study             — a named study (admin-managed). `key` is a short slug.
--   study_membership  — many-to-many patient<->study (a patient may be in
--                       several studies). Unique per (study, patient).
--
-- RLS: admin-only on both (mirrors patient_admin_all, 0037). The app reads
-- the overview through the SECURITY DEFINER study_overview() RPC, but the
-- admin-all policy also permits direct reads if ever needed.
--
-- RPCs (all SECURITY DEFINER, admin-gated via current_user_is_admin()):
--   create_study / update_study            — manage studies
--   add_patient_to_study / remove_...      — manage membership
--   study_overview()                       — one read for the admin list
--
-- study_code assignment: previously a code was only minted when the export
-- ran, so a freshly-consented patient could show a blank REDCap id. To make
-- the admin list always show a real record_id for exportable members,
-- add_patient_to_study assigns a code (reusing study_code_seq from 0106) when
-- the patient is research-consented and not purged and has none yet. A study
-- member who is NOT consented keeps a null code (and the list flags them as
-- "not consented") — correct, since they will not be exported.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists study (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now()
);

comment on table study is
  'A named study/protocol. Admin-managed. Membership (study_membership) is '
  'orthogonal to research_consent and does NOT change the REDCap export gate.';

create table if not exists study_membership (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references study(id) on delete cascade,
  patient_id uuid not null references patient(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  enrolled_by uuid,
  unique (study_id, patient_id)
);

comment on table study_membership is
  'Patient <-> study membership (many-to-many). A patient may belong to '
  'several studies. Does not affect the consent-gated export.';

create index if not exists study_membership_patient_idx
  on study_membership (patient_id);
create index if not exists study_membership_study_idx
  on study_membership (study_id);

-- ---------------------------------------------------------------------------
-- RLS: admin-only (mirrors patient_admin_all from 0037)
-- ---------------------------------------------------------------------------

alter table study enable row level security;
alter table study_membership enable row level security;

drop policy if exists study_admin_all on study;
create policy study_admin_all on study
  for all using (current_user_is_admin());

drop policy if exists study_membership_admin_all on study_membership;
create policy study_membership_admin_all on study_membership
  for all using (current_user_is_admin());

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Create a study. Returns its id.
create or replace function create_study(
  p_key text,
  p_name text,
  p_description text default null
) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not current_user_is_admin() then
    raise exception 'admin only';
  end if;
  if coalesce(btrim(p_key), '') = '' or coalesce(btrim(p_name), '') = '' then
    raise exception 'study key and name are required';
  end if;
  insert into study (key, name, description, created_by)
  values (btrim(p_key), btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), auth.uid())
  returning id into v_id;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), current_app_role(), 'study_created', 'study', v_id::text);
  return v_id;
end; $$;
revoke all on function create_study(text, text, text) from public;
grant execute on function create_study(text, text, text) to authenticated, service_role;

-- Update a study's name / description / active flag. (Key is immutable once
-- set, since it may be referenced externally.)
create or replace function update_study(
  p_study_id uuid,
  p_name text default null,
  p_description text default null,
  p_active boolean default null
) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not current_user_is_admin() then
    raise exception 'admin only';
  end if;
  update study
     set name = coalesce(nullif(btrim(coalesce(p_name, '')), ''), name),
         description = case when p_description is null then description
                            else nullif(btrim(p_description), '') end,
         active = coalesce(p_active, active),
         updated_at = now()
   where id = p_study_id;
  if not found then
    raise exception 'study not found';
  end if;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), current_app_role(), 'study_updated', 'study', p_study_id::text);
end; $$;
revoke all on function update_study(uuid, text, text, boolean) from public;
grant execute on function update_study(uuid, text, text, boolean) to authenticated, service_role;

-- Enrol a patient in a study (idempotent). Assigns a study_code (REDCap
-- record_id) if the patient is research-consented, not purged, and has none.
create or replace function add_patient_to_study(
  p_study_id uuid,
  p_patient_id uuid
) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not current_user_is_admin() then
    raise exception 'admin only';
  end if;
  if not exists (select 1 from study where id = p_study_id) then
    raise exception 'study not found';
  end if;
  if not exists (select 1 from patient where id = p_patient_id) then
    raise exception 'patient not found';
  end if;

  insert into study_membership (study_id, patient_id, enrolled_by)
  values (p_study_id, p_patient_id, auth.uid())
  on conflict (study_id, patient_id) do nothing;

  -- Mint a record_id for an exportable member that lacks one (mirrors the
  -- assignment in export_research_dataset, 0106).
  update patient
     set study_code = 'TC-' || lpad(nextval('study_code_seq')::text, 4, '0')
   where id = p_patient_id
     and research_consent
     and research_consent_purged_at is null
     and study_code is null;

  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), current_app_role(), 'study_member_added', 'patient', p_patient_id::text);
end; $$;
revoke all on function add_patient_to_study(uuid, uuid) from public;
grant execute on function add_patient_to_study(uuid, uuid) to authenticated, service_role;

-- Remove a patient from a study.
create or replace function remove_patient_from_study(
  p_study_id uuid,
  p_patient_id uuid
) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  if not current_user_is_admin() then
    raise exception 'admin only';
  end if;
  delete from study_membership
   where study_id = p_study_id and patient_id = p_patient_id;
  insert into audit_event (actor_profile_id, actor_role, action, entity, entity_id)
  values (auth.uid(), current_app_role(), 'study_member_removed', 'patient', p_patient_id::text);
end; $$;
revoke all on function remove_patient_from_study(uuid, uuid) from public;
grant execute on function remove_patient_from_study(uuid, uuid) to authenticated, service_role;

-- One read for the admin "Study patients" screen. Returns the studies (with
-- member counts) and every patient who is either research-consented OR a
-- member of any study, each with their record_id, consent status, cycle
-- count, and the studies they belong to. Admin holds the code<->identity
-- map, so display_name is included for the admin view only.
create or replace function study_overview()
  returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare v_result jsonb;
begin
  if not current_user_is_admin() then
    raise exception 'admin only';
  end if;

  select jsonb_build_object(
    'studies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'key', s.key,
        'name', s.name,
        'description', s.description,
        'active', s.active,
        'member_count', (
          select count(*) from study_membership m where m.study_id = s.id)
      ) order by s.name)
      from study s
    ), '[]'::jsonb),
    'patients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'patient_id', p.id,
        'display_name', pr.display_name,
        'study_code', p.study_code,
        'research_consent', p.research_consent,
        'withdrawn_at', p.research_consent_withdrawn_at,
        'purged_at', p.research_consent_purged_at,
        'cycle_count', (
          select count(*) from treatment_cycle c where c.patient_id = p.id),
        'study_ids', coalesce((
          select jsonb_agg(m.study_id)
          from study_membership m where m.patient_id = p.id), '[]'::jsonb)
      ) order by pr.display_name nulls last)
      from patient p
      left join profile pr on pr.id = p.profile_id
      where p.research_consent
         or exists (select 1 from study_membership m where m.patient_id = p.id)
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end; $$;
revoke all on function study_overview() from public;
grant execute on function study_overview() to authenticated, service_role;
