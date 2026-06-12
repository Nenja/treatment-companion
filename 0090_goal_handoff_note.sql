-- 0090_goal_handoff_note.sql
-- ---------------------------------------------------------------------------
-- Per-GOAL physician → therapist handoff note.
--
-- 0088 added a per-CYCLE handoff note (one note for the whole visit). This
-- adds an optional short note per (cycle, goal), so the physician can leave a
-- goal-specific focus for the therapist — e.g. "increased dose for this goal,
-- push range of motion" — alongside the cycle-level note. Same deliberate,
-- narrow downward channel: inter-professional, NEVER patient-visible.
--
-- Model mirrors treatment_handoff (0088):
--   * keyed on (treatment_cycle_id, approved_goal_id) — cycle-anchored AND
--     goal-specific; UNIQUE so it upserts;
--   * patient_id denormalised for simple, role-agnostic RLS;
--   * NO patient SELECT policy exists by design — a patient can never read it;
--   * reads are role-agnostic (physician AND therapist with an active session);
--   * writes are PHYSICIAN ONLY via the SECURITY DEFINER RPC (a therapist may
--     read but must not author — this is the physician's voice).
-- ---------------------------------------------------------------------------

create table if not exists goal_handoff_note (
  id uuid primary key default gen_random_uuid(),
  treatment_cycle_id uuid not null
    references treatment_cycle(id) on delete cascade,
  approved_goal_id uuid not null
    references approved_goal(id) on delete cascade,
  -- Denormalised for fast, role-agnostic RLS (set from the cycle in the RPC).
  patient_id uuid not null references patient(id) on delete cascade,
  note text not null check (length(note) between 1 and 1000),
  created_by uuid references clinician(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (treatment_cycle_id, approved_goal_id)
);

create index if not exists goal_handoff_note_patient_idx
  on goal_handoff_note (patient_id);
create index if not exists goal_handoff_note_cycle_idx
  on goal_handoff_note (treatment_cycle_id);

comment on table goal_handoff_note is
  'Physician-authored, goal-specific handoff note for the weekly therapist, '
  'keyed per (cycle, goal). Inter-professional only — NEVER patient-visible '
  '(no patient SELECT policy exists on this table by design).';

-- ---------------------------------------------------------------------------
-- RLS — same shape as treatment_handoff: role-agnostic SELECT for any
-- clinician-row holder with an active session for the patient (physician OR
-- therapist); no patient policy; admin all. The write goes through the
-- SECURITY DEFINER RPC below.
-- ---------------------------------------------------------------------------
alter table goal_handoff_note enable row level security;

drop policy if exists goal_handoff_note_select on goal_handoff_note;
create policy goal_handoff_note_select on goal_handoff_note
  for select to authenticated
  using (clinician_can_access_patient(patient_id));

drop policy if exists goal_handoff_note_admin_all on goal_handoff_note;
create policy goal_handoff_note_admin_all on goal_handoff_note
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- set_goal_handoff_note — upsert (or clear) a goal-specific note for a cycle.
-- PHYSICIAN ONLY. Clearing: an empty note deletes the row, so "no note" is the
-- absence of a row (keeps the therapist's view free of empty banners). The
-- goal must belong to the same patient as the cycle.
-- ---------------------------------------------------------------------------
create or replace function set_goal_handoff_note(
  p_cycle_id uuid,
  p_goal_id uuid,
  p_note text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
  v_goal_patient uuid;
  v_note text;
begin
  if current_app_role() <> 'clinician' then
    raise exception 'only the treating clinician can write a therapist handoff note';
  end if;

  select patient_id into v_patient from treatment_cycle where id = p_cycle_id;
  if v_patient is null then
    raise exception 'cycle not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;

  select patient_id into v_goal_patient from approved_goal where id = p_goal_id;
  if v_goal_patient is null or v_goal_patient <> v_patient then
    raise exception 'goal does not belong to this patient';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  if v_note is null then
    delete from goal_handoff_note
     where treatment_cycle_id = p_cycle_id
       and approved_goal_id = p_goal_id;
    return;
  end if;

  insert into goal_handoff_note (
    treatment_cycle_id, approved_goal_id, patient_id, note, created_by
  ) values (
    p_cycle_id, p_goal_id, v_patient, v_note, current_clinician_id()
  )
  on conflict (treatment_cycle_id, approved_goal_id) do update
    set note = excluded.note,
        updated_at = now();
end;
$$;

revoke all on function set_goal_handoff_note(uuid, uuid, text) from public;
grant execute on function set_goal_handoff_note(uuid, uuid, text) to authenticated;
