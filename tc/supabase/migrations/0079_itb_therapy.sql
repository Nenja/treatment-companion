-- 0079_itb_therapy.sql
-- ---------------------------------------------------------------------------
-- Intrathecal baclofen (ITB) as a parallel therapy.
--
-- A patient on ITB has a continuously running pump that is *titrated* over
-- time (dose changes), not a peak-effect "cycle" the way botulinum toxin is.
-- The existing treatment_cycle model — week-N, peak at weeks 6–8, video —
-- is intrinsically BoNT-shaped, and crucially every "resolve the patient's
-- active cycle" RPC assumes a single active cycle. So ITB is modelled here as
-- its OWN entity, running alongside the BoNT cycle history and touching none
-- of that logic.
--
-- This migration covers the ITB *therapy* and its dose titration log. ITB
-- *goals* (which would reuse approved_goal / weekly_goal_rating, and therefore
-- need every active-cycle resolver made modality-aware) are a separate,
-- deliberate next step.
-- ---------------------------------------------------------------------------

create table if not exists itb_therapy (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  started_on date,
  ended_on date,
  note text,
  created_by uuid references clinician(id) on delete set null,
  created_at timestamptz not null default now()
);

-- At most one active (not-yet-ended) ITB therapy per patient.
create unique index if not exists itb_therapy_one_active
  on itb_therapy (patient_id) where ended_on is null;

create table if not exists itb_dose_change (
  id uuid primary key default gen_random_uuid(),
  itb_therapy_id uuid not null references itb_therapy(id) on delete cascade,
  changed_on date not null,
  dose_mcg_per_day numeric(8,1),
  note text,
  created_by uuid references clinician(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists itb_dose_change_by_therapy
  on itb_dose_change (itb_therapy_id, changed_on);

comment on table itb_therapy is
  'A patient''s intrathecal baclofen pump therapy — a continuous, titrated '
  'therapy that runs in parallel with the botulinum-toxin treatment cycles. '
  'Separate from treatment_cycle so the BoNT peak/week logic is untouched.';
comment on column itb_dose_change.dose_mcg_per_day is
  'Pump dose at this change, in micrograms per day (the usual ITB unit).';

-- ---------------------------------------------------------------------------
-- RLS: reads via the browser client. Writes go through the SECURITY DEFINER
-- RPCs below (which bypass RLS), so only SELECT policies are needed.
-- ---------------------------------------------------------------------------
alter table itb_therapy enable row level security;
alter table itb_dose_change enable row level security;

drop policy if exists itb_therapy_select on itb_therapy;
create policy itb_therapy_select on itb_therapy for select to authenticated
  using (
    clinician_can_access_patient(patient_id)
    or patient_id = current_patient_id()
  );

drop policy if exists itb_dose_change_select on itb_dose_change;
create policy itb_dose_change_select on itb_dose_change for select to authenticated
  using (
    exists (
      select 1 from itb_therapy t
       where t.id = itb_therapy_id
         and (
           clinician_can_access_patient(t.patient_id)
           or t.patient_id = current_patient_id()
         )
    )
  );

-- Start (or reuse) the patient's active ITB therapy. Idempotent: if one is
-- already running, returns it rather than creating a second.
create or replace function start_itb_therapy(
  p_patient_id uuid,
  p_started_on date,
  p_note text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role role;
  v_id uuid;
begin
  v_role := current_app_role();
  if v_role not in ('clinician', 'physiotherapist') then
    raise exception 'only a clinician or therapist can manage ITB therapy';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  select id into v_id
    from itb_therapy
   where patient_id = p_patient_id and ended_on is null
   limit 1;
  if v_id is not null then
    return v_id;
  end if;

  insert into itb_therapy (patient_id, started_on, note, created_by)
  values (
    p_patient_id,
    p_started_on,
    nullif(trim(coalesce(p_note, '')), ''),
    current_clinician_id()
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Record a dose titration on an ITB therapy the caller can access.
create or replace function log_itb_dose_change(
  p_therapy_id uuid,
  p_changed_on date,
  p_dose numeric,
  p_note text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role role;
  v_patient uuid;
begin
  v_role := current_app_role();
  if v_role not in ('clinician', 'physiotherapist') then
    raise exception 'only a clinician or therapist can manage ITB therapy';
  end if;
  select patient_id into v_patient from itb_therapy where id = p_therapy_id;
  if v_patient is null then
    raise exception 'ITB therapy not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'no active session for this patient';
  end if;
  if p_dose is not null and p_dose < 0 then
    raise exception 'dose must not be negative';
  end if;

  insert into itb_dose_change (
    itb_therapy_id, changed_on, dose_mcg_per_day, note, created_by
  ) values (
    p_therapy_id,
    coalesce(p_changed_on, current_date),
    p_dose,
    nullif(trim(coalesce(p_note, '')), ''),
    current_clinician_id()
  );
end;
$$;

revoke all on function start_itb_therapy(uuid, date, text) from public;
grant execute on function start_itb_therapy(uuid, date, text) to authenticated;
revoke all on function log_itb_dose_change(uuid, date, numeric, text) from public;
grant execute on function log_itb_dose_change(uuid, date, numeric, text) to authenticated;
