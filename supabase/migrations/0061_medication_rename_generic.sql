-- ============================================================================
-- 0061 — Rename "anti-spastic medication" to plain "medication".
--
-- The app now serves dystonia as well as spasticity, so "anti-spastic"
-- is no longer accurate. This renames the two free-text patient columns
-- and the dedicated write RPC to a condition-neutral "medication"
-- naming. No data changes — the column contents are preserved; only the
-- names change.
--
--   patient.current_antispastic_medication  -> patient.current_medication
--   patient.previous_antispastic_medication -> patient.previous_medication
--   set_patient_medication(p_current_antispastic_medication,
--                          p_previous_antispastic_medication)
--     -> set_patient_medication(p_current_medication,
--                               p_previous_medication)
--
-- DEPLOY ORDERING (important): run this migration TOGETHER with the
-- matching app deploy. The app code is updated to call
-- set_patient_medication with the new param names and to read the
-- renamed columns. Old app + new DB (or vice-versa) will error on
-- medication read/write until both are in place. On a dev DB with no
-- real patients this is a non-issue — just do both in one sitting.
-- ============================================================================

-- Step 1: rename the columns (idempotent — only rename if the old name
-- still exists, so re-running is safe).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'patient'
      and column_name = 'current_antispastic_medication'
  ) then
    alter table patient
      rename column current_antispastic_medication to current_medication;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_name = 'patient'
      and column_name = 'previous_antispastic_medication'
  ) then
    alter table patient
      rename column previous_antispastic_medication to previous_medication;
  end if;
end $$;

-- The CHECK constraints created in 0048 follow the column automatically
-- on rename (Postgres rewrites the constraint expression), so the
-- 1..4000 length checks remain in force under the new column names.

-- Step 2: recreate the medication RPC with neutral param names.
-- Signature (uuid, text, text) is unchanged, so the existing GRANT to
-- authenticated still applies; we drop and recreate the body to swap the
-- parameter names and the column references.
drop function if exists set_patient_medication(uuid, text, text);

create or replace function set_patient_medication(
  p_patient_id uuid,
  p_current_medication text,
  p_previous_medication text
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_role role;
begin
  v_role := current_app_role();
  if v_role <> 'clinician' then
    raise exception 'only a clinician can edit medication';
  end if;
  if not clinician_can_access_patient(p_patient_id) then
    raise exception 'no active session for this patient';
  end if;

  update patient
     set current_medication =
           nullif(trim(coalesce(p_current_medication, '')), ''),
         previous_medication =
           nullif(trim(coalesce(p_previous_medication, '')), '')
   where id = p_patient_id;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), v_role, 'patient_medication_updated', 'patient',
    p_patient_id::text
  );
end;
$$;

revoke all on function set_patient_medication(uuid, text, text) from public;
grant execute on function set_patient_medication(uuid, text, text)
  to authenticated;
