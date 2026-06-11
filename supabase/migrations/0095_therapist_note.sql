-- 0095_therapist_note.sql
-- ---------------------------------------------------------------------------
-- Therapist -> clinic free-text note (the therapist's one upward writing
-- channel). The weekly community therapist can send the clinic a note of any
-- length about a patient -- a one-line muscle-tone observation or a fuller
-- status summary -- whenever they choose. No cadence, no required fields, no
-- prompting; the therapist sets the depth.
--
-- This MERGES what used to be split across structured forms: muscle concerns
-- now go here as prose (the physio_muscle_suggestion form is retired in the
-- UI; its table is left dormant, not dropped). Goal *suggestions* stay
-- separate (they become real goals) -- see physio_goal_suggestion.
--
-- Hard rule (same as treatment_handoff, 0088): inter-professional, NEVER
-- patient-visible. RLS read is clinician_can_access_patient(patient_id), which
-- is role-agnostic for clinician-row holders (the therapist who wrote it AND
-- the physician) and FALSE for a patient (no clinician row). There is no
-- patient SELECT policy. Because RLS is row- not column-level, the note lives
-- in its own table -- never as a column on a patient-readable row.
--
-- Receipt: seen_at / seen_by are set when a PHYSICIAN first opens the
-- patient's notes (mark_therapist_notes_seen). seen_by is kept for audit; the
-- UI shows only "Seen . <time>", never a name. A note shows "Delivered" the
-- instant it is stored (seen_at null), upgrading to "Seen" on the physician's
-- open.
-- ---------------------------------------------------------------------------

create table if not exists therapist_note (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patient(id) on delete cascade,
  -- The authoring therapist (a physiotherapist clinician-row holder).
  physiotherapist_id uuid not null references clinician(id),
  -- Free text, any length the therapist chooses (bounded for safety).
  body text not null check (length(body) between 1 and 5000),
  -- Receipt. Set once, by a physician, on first open of this patient's notes.
  seen_at timestamptz,
  seen_by uuid references clinician(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists therapist_note_patient_idx
  on therapist_note (patient_id);
-- The physician's "new therapist notes" lookup.
create index if not exists therapist_note_unseen_idx
  on therapist_note (patient_id) where seen_at is null;

comment on table therapist_note is
  'Therapist-authored free-text note to the clinic. Inter-professional only -- '
  'NEVER patient-visible (no patient SELECT policy by design, same as '
  'treatment_handoff). Merges former muscle-flag prose; goal suggestions stay '
  'separate.';
comment on column therapist_note.seen_by is
  'Physician who first opened the note (audit only; UI shows "Seen . time", '
  'never the name).';

-- ---------------------------------------------------------------------------
-- RLS. Reads via the browser client; writes via the SECURITY DEFINER RPCs
-- below (which bypass RLS), so only SELECT + admin policies are defined. The
-- read predicate is role-agnostic across clinician-row holders and false for
-- patients -- therapist and physician read, patient never can.
-- ---------------------------------------------------------------------------
alter table therapist_note enable row level security;

drop policy if exists therapist_note_select on therapist_note;
create policy therapist_note_select on therapist_note
  for select to authenticated
  using (clinician_can_access_patient(patient_id));

drop policy if exists therapist_note_admin_all on therapist_note;
create policy therapist_note_admin_all on therapist_note
  for all using (current_app_role() = 'admin');

-- ---------------------------------------------------------------------------
-- submit_therapist_note -- the therapist sends a note. PHYSIOTHERAPIST ONLY.
-- ---------------------------------------------------------------------------
create or replace function submit_therapist_note(
  p_patient_id uuid,
  p_body text
) returns uuid
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_body text;
  v_id uuid;
begin
  if current_app_role() <> 'physiotherapist' then
    raise exception 'only a physiotherapist can write a therapist note';
  end if;
  if current_clinician_id() is null then
    raise exception 'no professional record for caller';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'not authorized for this patient';
  end if;

  v_body := nullif(trim(coalesce(p_body, '')), '');
  if v_body is null then
    raise exception 'note is required';
  end if;
  if length(v_body) > 5000 then
    raise exception 'note is too long';
  end if;

  insert into therapist_note (patient_id, physiotherapist_id, body)
  values (p_patient_id, current_clinician_id(), v_body)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function submit_therapist_note(uuid, text) from public;
grant execute on function submit_therapist_note(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- mark_therapist_notes_seen -- a PHYSICIAN opening the patient's notes marks
-- all currently-unseen ones seen (mark-seen-on-open). Restricted to the
-- treating clinician (the physician), NOT the therapist -- a therapist viewing
-- their own sent notes must not mark them seen. Returns the number marked.
-- ---------------------------------------------------------------------------
create or replace function mark_therapist_notes_seen(
  p_patient_id uuid
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_count integer;
begin
  if current_app_role() <> 'clinician' then
    raise exception 'only the treating clinician can mark therapist notes seen';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'not authorized for this patient';
  end if;

  update therapist_note
     set seen_at = now(),
         seen_by = current_clinician_id()
   where patient_id = p_patient_id
     and seen_at is null;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function mark_therapist_notes_seen(uuid) from public;
grant execute on function mark_therapist_notes_seen(uuid) to authenticated;
