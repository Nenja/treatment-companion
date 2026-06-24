-- 0065_cycle_clinician_note.sql
-- ---------------------------------------------------------------------------
-- A free-text clinician note per treatment cycle — the "since last visit"
-- note shown on the patient page. Scoped to the cycle (which begins at a
-- clinic visit), so it naturally resets each new visit.
-- ---------------------------------------------------------------------------

alter table treatment_cycle
  add column if not exists clinician_note text;

comment on column treatment_cycle.clinician_note is
  'Free-text clinician note for this cycle ("since last visit"). Visible to '
  'clinicians with access to the patient.';

create or replace function set_cycle_clinician_note(
  p_cycle_id uuid,
  p_note text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_patient uuid;
begin
  select patient_id into v_patient from treatment_cycle where id = p_cycle_id;
  if v_patient is null then
    raise exception 'cycle not found';
  end if;
  if not clinician_can_access_patient(v_patient) then
    raise exception 'not authorized for this patient';
  end if;
  update treatment_cycle
     set clinician_note = nullif(trim(p_note), '')
   where id = p_cycle_id;
end;
$$;

revoke all on function set_cycle_clinician_note(uuid, text) from public;
grant execute on function set_cycle_clinician_note(uuid, text) to authenticated;
