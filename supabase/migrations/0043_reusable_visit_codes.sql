-- ============================================================================
-- 0043 — Reusable visit codes (for unsupervised testing only).
--
-- WHAT THIS IS, AND WHY — please read before regulatory review.
--
-- Normally a visit code is SINGLE-USE: the patient generates it, the
-- clinician consumes it once, and it cannot be used again. That is the
-- consent gate — a clinician can only open a record the patient has,
-- right then, chosen to expose.
--
-- For the unsupervised test-run, the six demo patients are not real
-- people; a tester plays both roles, so regenerating a fresh code each
-- time is pure friction with no consent value. This migration adds a
-- way to mark SPECIFIC codes as reusable, so the six test codes
-- (TEST01–TEST06) can be typed repeatedly without regeneration.
--
-- CONTAINMENT — the important part for regulatory review:
--   * A new boolean column `is_reusable` on visit_code, default FALSE.
--   * A real patient code is created without this flag, so it is
--     false, and its behaviour is COMPLETELY UNCHANGED — still
--     single-use, still consumed on first unlock, exactly as before.
--   * Only a code explicitly inserted with is_reusable = true behaves
--     differently. The seed script for the test patients is the only
--     thing that sets it. No application code path sets it.
--   * The reusable behaviour is: the unlock RPC does not require the
--     code to be unconsumed, and does not mark it consumed. Expiry is
--     still checked — a reusable code still has an expires_at and
--     still stops working past it.
--
-- This is a testing affordance, deliberately scoped so it cannot
-- affect the real-patient consent flow. It should be removed (drop the
-- column, restore the original RPC) before any real patient uses the
-- system, OR kept only if a regulatory advisor confirms the
-- containment is acceptable.
-- ============================================================================

-- 1. The flag. Default false — every existing and future real code is
--    single-use unless explicitly marked otherwise.
alter table visit_code
  add column if not exists is_reusable boolean not null default false;

-- 2. Replace the unlock RPC. The ONLY differences from the original
--    are marked with "REUSABLE:" comments. The real-patient path
--    (is_reusable = false) is unchanged.
create or replace function unlock_with_visit_code(p_code text)
  returns uuid as $$
declare
  v_clinician_id uuid;
  v_patient_id uuid;
  v_is_reusable boolean;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Look up the code, locking the row so concurrent unlocks can't
  -- double-consume it.
  -- REUSABLE: also read is_reusable. The "consumed_at is null" filter
  -- is dropped from the WHERE clause and re-checked below, so that a
  -- reusable code still resolves even though it has been "consumed"
  -- before. Expiry is still enforced here for ALL codes.
  select patient_id, is_reusable
    into v_patient_id, v_is_reusable
    from visit_code
   where code = upper(p_code)
     and expires_at > now()
   for update;

  if v_patient_id is null then
    raise exception 'invalid or expired code';
  end if;

  -- REUSABLE: a non-reusable (real) code must still be unconsumed.
  -- This reproduces the original "consumed_at is null" guard for every
  -- real code; only a flagged test code skips it.
  if not v_is_reusable then
    perform 1 from visit_code
     where code = upper(p_code) and consumed_at is null;
    if not found then
      raise exception 'invalid or expired code';
    end if;
  end if;

  -- End any current active session for this clinician.
  update clinician_session
     set ended_at = now(),
         end_reason = 'expired_by_new_session'
   where clinician_id = v_clinician_id
     and ended_at is null;

  -- Mark the visit code consumed.
  -- REUSABLE: a reusable test code is NOT marked consumed, so it can
  -- be used again. A real code is consumed exactly as before.
  if not v_is_reusable then
    update visit_code
       set consumed_at = now(),
           consumed_by_clinician_id = v_clinician_id
     where code = upper(p_code);
  end if;

  -- Open the new session.
  insert into clinician_session (
    clinician_id, patient_id, visit_code
  ) values (
    v_clinician_id, v_patient_id, upper(p_code)
  );

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  )
  select auth.uid(), 'clinician', 'patient_unlocked', 'patient',
         v_patient_id::text;

  return v_patient_id;
end;
$$ language plpgsql security definer;

revoke all on function unlock_with_visit_code(text) from public;
grant execute on function unlock_with_visit_code(text) to authenticated;
