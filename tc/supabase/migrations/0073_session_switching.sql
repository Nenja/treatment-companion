-- 0073_session_switching.sql
-- ---------------------------------------------------------------------------
-- Switching between already-unlocked patients + same-day reopen — WITHOUT
-- changing the consent model.
--
-- The gate is unchanged: a visit code is still patient-generated, single-use,
-- short-lived, and (0043) the reusable-test-code containment is preserved
-- verbatim. A clinician still cannot open a record the patient hasn't, today,
-- chosen to expose with a code. This migration only changes session
-- MULTIPLICITY and adds a today-scoped reopen:
--   * a clinician may hold several unlocked charts open at once (one active
--     session per patient) and switch between them without re-entering codes;
--   * a clinician may reopen a patient they ALREADY unlocked today without a
--     fresh code (consent was given today).
-- Pre-visit access is deliberately NOT added — that needs a separate decision.
-- The 1-hour inactivity auto-lock (RLS) is unchanged, so a walked-away chart
-- still locks; reopen re-touches it within the same day only.
-- ---------------------------------------------------------------------------

-- 1. One active session per (clinician, patient) instead of per clinician,
--    so several patients can be open at once.
drop index if exists clinician_session_one_active_idx;
create unique index clinician_session_one_active_idx
  on clinician_session(clinician_id, patient_id)
  where ended_at is null;

-- 2. unlock_with_visit_code — identical to 0043 EXCEPT it no longer ends the
--    clinician's other active sessions, and it refreshes an existing active
--    session for the same patient instead of inserting a duplicate.
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

  select patient_id, is_reusable
    into v_patient_id, v_is_reusable
    from visit_code
   where code = upper(p_code)
     and expires_at > now()
   for update;

  if v_patient_id is null then
    raise exception 'invalid or expired code';
  end if;

  if not v_is_reusable then
    perform 1 from visit_code
     where code = upper(p_code) and consumed_at is null;
    if not found then
      raise exception 'invalid or expired code';
    end if;
  end if;

  -- (Deliberately NOT ending the clinician's other active sessions — this is
  --  what lets several patients stay open at once.)

  if not v_is_reusable then
    update visit_code
       set consumed_at = now(),
           consumed_by_clinician_id = v_clinician_id
     where code = upper(p_code);
  end if;

  -- Refresh an existing active session for this patient, else open one. The
  -- per-(clinician,patient) unique index forbids a duplicate active row.
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

  return v_patient_id;
end;
$$ language plpgsql security definer;

revoke all on function unlock_with_visit_code(text) from public;
grant execute on function unlock_with_visit_code(text) to authenticated;

-- 3. Patient-scoped touch, so refreshing one open chart doesn't refresh the
--    others — the most-recently-touched session is the "current" one. The
--    original no-arg touch_clinician_session() is kept for single-session
--    callers.
create or replace function touch_clinician_session(p_patient_id uuid)
  returns void as $$
declare
  v_clinician_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    return;
  end if;
  update clinician_session
     set last_activity_at = now()
   where clinician_id = v_clinician_id
     and patient_id = p_patient_id
     and ended_at is null;
end;
$$ language plpgsql security definer;

revoke all on function touch_clinician_session(uuid) from public;
grant execute on function touch_clinician_session(uuid) to authenticated;

-- 4. End ONE patient's session (leave the clinician's other open charts
--    alone). The no-arg end_clinician_session() (end all) is kept.
create or replace function end_clinician_session(p_patient_id uuid)
  returns void as $$
declare
  v_clinician_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;
  update clinician_session
     set ended_at = now(),
         end_reason = 'manual'
   where clinician_id = v_clinician_id
     and patient_id = p_patient_id
     and ended_at is null;
end;
$$ language plpgsql security definer;

revoke all on function end_clinician_session(uuid) from public;
grant execute on function end_clinician_session(uuid) to authenticated;

-- 5. Reopen a patient this clinician ALREADY unlocked today, without a fresh
--    code. Authorized only by today's own session (consent was given today);
--    reuses that session's visit code for the FK. No new consent is created.
create or replace function reopen_session(p_patient_id uuid)
  returns uuid as $$
declare
  v_clinician_id uuid;
  v_code text;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Already active for this patient → just refresh.
  update clinician_session
     set last_activity_at = now()
   where clinician_id = v_clinician_id
     and patient_id = p_patient_id
     and ended_at is null;
  if found then
    return p_patient_id;
  end if;

  -- Otherwise require a session this clinician opened for this patient TODAY.
  select visit_code into v_code
    from clinician_session
   where clinician_id = v_clinician_id
     and patient_id = p_patient_id
     and started_at >= date_trunc('day', now())
   order by started_at desc
   limit 1;

  if v_code is null then
    raise exception 'no session from today to reopen; a new code is needed';
  end if;

  insert into clinician_session (clinician_id, patient_id, visit_code)
  values (v_clinician_id, p_patient_id, v_code);

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  )
  select auth.uid(), 'clinician', 'patient_reopened', 'patient',
         p_patient_id::text;

  return p_patient_id;
end;
$$ language plpgsql security definer;

revoke all on function reopen_session(uuid) from public;
grant execute on function reopen_session(uuid) to authenticated;

-- 6. The clinician's own sessions from today, one row per patient (latest),
--    with the patient's display name and whether it's currently active.
--    Drives the switcher: active rows = switch back, inactive = reopen.
create or replace function list_my_sessions()
  returns table (
    patient_id uuid,
    display_name text,
    last_activity_at timestamptz,
    is_active boolean
  ) as $$
  select distinct on (s.patient_id)
         s.patient_id,
         pr.display_name,
         s.last_activity_at,
         (s.ended_at is null
            and s.last_activity_at > now() - interval '1 hour') as is_active
    from clinician_session s
    join patient pt on pt.id = s.patient_id
    join profile pr on pr.id = pt.profile_id
   where s.clinician_id = current_clinician_id()
     and s.started_at >= date_trunc('day', now())
   order by s.patient_id, s.last_activity_at desc;
$$ language sql stable security definer;

revoke all on function list_my_sessions() from public;
grant execute on function list_my_sessions() to authenticated;
