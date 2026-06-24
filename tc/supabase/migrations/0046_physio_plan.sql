-- ============================================================================
-- 0046 — Therapist exercise plan & assistive devices (per patient).
--
-- Adds two free-text, per-patient fields the THERAPIST maintains:
--   physio_exercise_plan      — the exercise programme they have with
--                               the patient
--   physio_assistive_devices  — orthoses, splints, walkers, etc. in use
--
-- These persist across cycles (they live on `patient`, not on a cycle)
-- and are editable at any time. They are visible to BOTH the therapist
-- (who writes them) and the physician (as context at the injection
-- visit) — both already reach the patient via the same session
-- mechanism, so existing RLS that exposes patient fields covers reads.
--
-- REGULATORY NOTE — please surface to the regulatory advisor:
--   This is a NEW category of data. Until now the therapist side was
--   suggestions + progress reporting. Recording the therapist's own
--   exercise prescription and device plan moves the app toward
--   documenting physiotherapy treatment, which may bear on the
--   intended-purpose / qualification determination. It is contained
--   (free text, per patient, no logic depends on it), but it is a
--   scope change that should be reviewed, not assumed benign.
-- ============================================================================

alter table patient
  add column if not exists physio_exercise_plan text
    check (physio_exercise_plan is null
      or length(physio_exercise_plan) <= 4000),
  add column if not exists physio_assistive_devices text
    check (physio_assistive_devices is null
      or length(physio_assistive_devices) <= 4000);

-- RPC: the therapist sets/updates the plan. Only a physiotherapist with
-- an active session for the patient may write. Mirrors set_muscle_sharing
-- (0036) in shape: role check, session check, update, audit.
create or replace function set_physio_plan(
  p_patient_id uuid,
  p_exercise_plan text,
  p_assistive_devices text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  if current_app_role() <> 'physiotherapist' then
    raise exception 'only a therapist can edit the exercise plan';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update patient
     set physio_exercise_plan =
           nullif(trim(coalesce(p_exercise_plan, '')), ''),
         physio_assistive_devices =
           nullif(trim(coalesce(p_assistive_devices, '')), '')
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'physiotherapist', 'physio_plan_updated', 'patient',
    p_patient_id::text
  );
end;
$$;

revoke all on function set_physio_plan(uuid, text, text) from public;
grant execute on function set_physio_plan(uuid, text, text) to authenticated;
