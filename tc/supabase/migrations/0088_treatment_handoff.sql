-- 0088_treatment_handoff.sql
-- ---------------------------------------------------------------------------
-- Physician → therapist handoff note (the FIRST downward channel in the app).
--
-- Everything else in Treatment Companion flows UPWARD (patient/therapist →
-- clinic) or is the clinic's goal discussion with the patient. This is a
-- deliberate, narrow exception: a short note the treating physician attaches
-- to a treatment change, addressed to the weekly community therapist, plus a
-- "did the treatment change this visit?" flag. It closes two audit gaps the
-- therapist workflow surfaced: there was no feedback on a physician action,
-- and no since-last-session delta the therapist could read.
--
-- Hard rule: this is inter-professional handoff and is NEVER patient-visible.
-- The patient already has SELECT on treatment_session / muscle_injection (for
-- the treated-muscles pop-up), and Postgres RLS is row- not column-level, so
-- the note CANNOT live on treatment_session — the patient's existing row read
-- would expose it. It therefore lives in this dedicated table, which has NO
-- patient SELECT policy at all. A patient can never read a row here.
--
-- Anchoring: one treatment_session exists per treatment_cycle (the session's
-- treatment_cycle_id is UNIQUE), and the handover calls this note "naturally
-- cycle-tied (about a specific change)". So it is keyed on the cycle, 1:1.
-- Reads are role-agnostic (any clinician-row holder with an active session —
-- i.e. the physician AND the therapist). Writes are clinician-only (the
-- physician authors it; the therapist must not), enforced in the RPC.
-- ---------------------------------------------------------------------------

create table if not exists treatment_handoff (
  id uuid primary key default gen_random_uuid(),
  -- 1:1 with the cycle (mirrors treatment_session.treatment_cycle_id UNIQUE).
  treatment_cycle_id uuid not null unique
    references treatment_cycle(id) on delete cascade,
  -- Denormalised for simple, fast RLS (the app denormalises patient_id widely;
  -- e.g. weekly_checkin, approved_goal). Set from the cycle in the RPC.
  patient_id uuid not null references patient(id) on delete cascade,
  -- The physician's short focus note for the therapist. Optional.
  note text check (note is null or length(note) between 1 and 1000),
  -- Did the physician change the treatment at this visit, relative to last
  -- time? true = adjusted, false = no change this visit, NULL = not stated.
  -- A bare "no change" is itself useful to the therapist (it answers the
  -- "did anything change?" question), so false is a surfaced value, not noise.
  treatment_changed boolean,
  created_by uuid references clinician(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists treatment_handoff_patient_idx
  on treatment_handoff (patient_id);

comment on table treatment_handoff is
  'Physician-authored handoff note for the weekly therapist, tied 1:1 to a '
  'treatment cycle. Inter-professional only — NEVER patient-visible (no '
  'patient SELECT policy exists on this table by design).';
comment on column treatment_handoff.treatment_changed is
  'true = treatment adjusted at this visit; false = no change this visit; '
  'NULL = the physician did not state it.';

-- ---------------------------------------------------------------------------
-- RLS. Reads go through the browser client; the write goes through the
-- SECURITY DEFINER RPC below (which bypasses RLS), so only SELECT policies
-- are needed for non-admins.
--
-- The SELECT predicate is clinician_can_access_patient(patient_id), which is
-- role-agnostic: it is true for any clinician-row holder (physician OR
-- therapist) with an active, un-ended, < 1 hr clinician_session for the
-- patient, and FALSE for a patient (a patient has no clinician row). So the
-- physician and the therapist can read it; the patient cannot. There is
-- intentionally NO patient policy here.
-- ---------------------------------------------------------------------------
alter table treatment_handoff enable row level security;

drop policy if exists treatment_handoff_select on treatment_handoff;
create policy treatment_handoff_select on treatment_handoff
  for select to authenticated
  using (clinician_can_access_patient(patient_id));

drop policy if exists treatment_handoff_admin_all on treatment_handoff;
create policy treatment_handoff_admin_all on treatment_handoff
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- set_treatment_handoff — upsert (or clear) the physician's handoff note for
-- a cycle. PHYSICIAN ONLY: current_app_role() must be 'clinician'. A
-- physiotherapist (who also has a clinician row and can read the note) must
-- NOT be able to author it — this is the physician's voice to the therapist,
-- not a shared scratchpad.
--
-- Clearing: when both the note and the flag are empty, the row is deleted, so
-- "no handoff" is simply the absence of a row (keeps the therapist's view
-- free of empty banners). A bare flag (e.g. "no change", empty note) is kept.
-- ---------------------------------------------------------------------------
create or replace function set_treatment_handoff(
  p_cycle_id uuid,
  p_note text,
  p_treatment_changed boolean
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
  v_note text;
begin
  -- Author must be the treating physician, not the therapist.
  if current_app_role() <> 'clinician' then
    raise exception 'only the treating clinician can write a therapist handoff note';
  end if;

  select patient_id into v_patient
    from treatment_cycle
   where id = p_cycle_id;
  if v_patient is null then
    raise exception 'cycle not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;

  v_note := nullif(trim(coalesce(p_note, '')), '');

  -- Nothing to record → clear any existing handoff for this cycle.
  if v_note is null and p_treatment_changed is null then
    delete from treatment_handoff where treatment_cycle_id = p_cycle_id;
    return;
  end if;

  insert into treatment_handoff (
    treatment_cycle_id, patient_id, note, treatment_changed, created_by
  ) values (
    p_cycle_id, v_patient, v_note, p_treatment_changed, current_clinician_id()
  )
  on conflict (treatment_cycle_id) do update
    set note = excluded.note,
        treatment_changed = excluded.treatment_changed,
        updated_at = now();
end;
$$;

revoke all on function set_treatment_handoff(uuid, text, boolean) from public;
grant execute on function set_treatment_handoff(uuid, text, boolean) to authenticated;
