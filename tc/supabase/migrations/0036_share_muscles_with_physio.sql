-- ============================================================================
-- 0036 — Physician controls whether the physiotherapist sees treated
--        muscles.
--
-- Feature 1 (migration-free, shipped earlier) showed the physiotherapist
-- the most recent treatment's injected muscles. The physician now
-- decides, per patient, whether that detail is shared at all.
--
-- One boolean on the patient row. Default TRUE: the muscle view shipped
-- assuming visibility, and physiotherapists may already rely on it —
-- defaulting to false would silently hide data from them. The physician
-- opts a patient OUT when they don't want injection detail shared.
--
-- Enforcement is in the physio data query (a guarded select), not in
-- RLS: RLS on treatment_session is role-agnostic ("any unlocking
-- professional") and we don't want to entangle it with this per-patient
-- preference. The physician's own access is unaffected either way.
-- ============================================================================

alter table patient
  add column if not exists share_muscles_with_physio boolean
    not null default true;

-- ---------------------------------------------------------------------------
-- set_muscle_sharing — the physician toggles the flag.
--
-- The `patient` table has no clinician UPDATE policy (only read), so a
-- direct update from the client is blocked by RLS. This SECURITY
-- DEFINER RPC does the update, gated to a physician with an active
-- unlock for the patient — matching how every other clinician write is
-- handled.
-- ---------------------------------------------------------------------------

create or replace function set_muscle_sharing(
  p_patient_id uuid,
  p_share boolean
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if current_app_role() <> 'clinician' then
    raise exception 'only a physician can change this setting';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update patient
     set share_muscles_with_physio = p_share
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'clinician',
    case when p_share then 'muscle_sharing_enabled'
         else 'muscle_sharing_disabled' end,
    'patient', p_patient_id::text
  );
end;
$$;

revoke all on function set_muscle_sharing(uuid, boolean) from public;
grant execute on function set_muscle_sharing(uuid, boolean) to authenticated;
