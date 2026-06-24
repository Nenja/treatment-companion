-- ============================================================================
-- 0101 — Brute-force throttle for visit-code unlock.
--
-- An authenticated care professional could otherwise call
-- unlock_with_visit_code() repeatedly to guess codes. Real codes are 6 chars,
-- single-use and short-lived, so the production window is small (the reusable
-- TEST01–06 codes are demo-only) — this is defence-in-depth.
--
-- Approach: record each unlock attempt per caller; block a caller after too
-- many FAILED attempts in a rolling window. Successful unlocks never count, so
-- a clinician legitimately opening several patients is never throttled.
--
-- IMPORTANT contract change: the RPC now RETURNS NULL on an invalid/expired
-- code instead of RAISING. This is required because a RAISE rolls back the
-- transaction — including the failure record we need to persist to count
-- toward the limit. The app's unlock hook treats a null result as an invalid
-- code (the same UX as before). The RPC still RAISES for the rate-limit case
-- (nothing needs to persist there) so the app can show a distinct message.
-- ============================================================================

create table if not exists visit_code_unlock_attempt (
  id            uuid primary key default gen_random_uuid(),
  clinician_id  uuid not null references clinician(id) on delete cascade,
  attempted_at  timestamptz not null default now(),
  succeeded     boolean not null
);

create index if not exists visit_code_unlock_attempt_idx
  on visit_code_unlock_attempt(clinician_id, attempted_at);

-- Only the SECURITY DEFINER RPC writes/reads this table. Admins may read it
-- for audit; no other client access.
alter table visit_code_unlock_attempt enable row level security;
drop policy if exists visit_code_unlock_attempt_admin_read on visit_code_unlock_attempt;
create policy visit_code_unlock_attempt_admin_read on visit_code_unlock_attempt
  for select using (current_app_role() = 'admin');

create or replace function unlock_with_visit_code(p_code text)
  returns uuid as $$
declare
  v_clinician_id    uuid;
  v_patient_id      uuid;
  v_is_reusable     boolean;
  v_recent_failures int;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Throttle: prune this caller's stale attempts, then count recent failures.
  delete from visit_code_unlock_attempt
   where clinician_id = v_clinician_id
     and attempted_at < now() - interval '15 minutes';

  select count(*)
    into v_recent_failures
    from visit_code_unlock_attempt
   where clinician_id = v_clinician_id
     and not succeeded
     and attempted_at > now() - interval '15 minutes';

  if v_recent_failures >= 10 then
    -- Nothing to persist here (prior failures are already recorded), so a
    -- RAISE is fine and lets the app show a "wait a few minutes" message.
    raise exception 'too many failed code attempts; please wait a few minutes';
  end if;

  select patient_id, is_reusable
    into v_patient_id, v_is_reusable
    from visit_code
   where code = upper(p_code)
     and expires_at > now()
   for update;

  if v_patient_id is null then
    insert into visit_code_unlock_attempt (clinician_id, succeeded)
    values (v_clinician_id, false);
    return null;
  end if;

  if not v_is_reusable then
    perform 1 from visit_code
     where code = upper(p_code) and consumed_at is null;
    if not found then
      insert into visit_code_unlock_attempt (clinician_id, succeeded)
      values (v_clinician_id, false);
      return null;
    end if;

    update visit_code
       set consumed_at = now(),
           consumed_by_clinician_id = v_clinician_id
     where code = upper(p_code);
  end if;

  -- Refresh an existing active session for this patient, else open one.
  update clinician_session
     set last_activity_at = now()
   where clinician_id = v_clinician_id
     and patient_id = v_patient_id
     and ended_at is null;
  if not found then
    insert into clinician_session (clinician_id, patient_id, visit_code)
    values (v_clinician_id, v_patient_id, upper(p_code));
  end if;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  )
  select auth.uid(), 'clinician', 'patient_unlocked', 'patient',
         v_patient_id::text;

  -- Record the success (does not count toward the failure limit).
  insert into visit_code_unlock_attempt (clinician_id, succeeded)
  values (v_clinician_id, true);

  return v_patient_id;
end;
$$ language plpgsql security definer;
