-- ============================================================================
-- Treatment Companion — RPCs (callable database functions)
--
-- Used for operations that need to do multiple things atomically or
-- that RLS alone can't express cleanly. Each is SECURITY DEFINER, so it
-- runs with elevated privileges — the function body is responsible for
-- checking the caller is allowed to do what it's asking.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- generate_visit_code
--
-- Patient-callable. Creates a new visit code for the caller's patient
-- record, invalidating any prior unconsumed code for the same patient
-- so only one code is active at a time.
--
-- The code string is generated client-side (so the client can show it
-- immediately without a round-trip) and passed in. The function
-- enforces format and uniqueness.
-- ---------------------------------------------------------------------------

create or replace function generate_visit_code(p_code text)
  returns visit_code as $$
declare
  v_patient_id uuid;
  v_code visit_code;
begin
  v_patient_id := current_patient_id();
  if v_patient_id is null then
    raise exception 'caller is not a patient';
  end if;

  if p_code !~ '^[A-Z0-9]{6}$' then
    raise exception 'invalid code format';
  end if;

  -- Mark any prior unconsumed code as consumed-by-replacement.
  update visit_code
     set consumed_at = now()
   where patient_id = v_patient_id
     and consumed_at is null;

  insert into visit_code (code, patient_id, expires_at)
  values (p_code, v_patient_id, now() + interval '10 minutes')
  returning * into v_code;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  ) values (
    auth.uid(), 'patient', 'visit_code_generated', 'visit_code', p_code
  );

  return v_code;
end;
$$ language plpgsql security definer;

revoke all on function generate_visit_code(text) from public;
grant execute on function generate_visit_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- unlock_with_visit_code
--
-- Clinician-callable. Validates a code, marks it consumed, ends any
-- prior active session for this clinician, and creates a new one.
-- Returns the patient ID granted access to.
-- ---------------------------------------------------------------------------

create or replace function unlock_with_visit_code(p_code text)
  returns uuid as $$
declare
  v_clinician_id uuid;
  v_patient_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  -- Look up the code, locking the row so concurrent unlocks can't
  -- double-consume it.
  select patient_id into v_patient_id
    from visit_code
   where code = upper(p_code)
     and consumed_at is null
     and expires_at > now()
   for update;

  if v_patient_id is null then
    raise exception 'invalid or expired code';
  end if;

  -- End any current active session for this clinician.
  update clinician_session
     set ended_at = now(),
         end_reason = 'expired_by_new_session'
   where clinician_id = v_clinician_id
     and ended_at is null;

  -- Mark the visit code consumed.
  update visit_code
     set consumed_at = now(),
         consumed_by_clinician_id = v_clinician_id
   where code = upper(p_code);

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

-- ---------------------------------------------------------------------------
-- touch_clinician_session
--
-- Clinician-callable. Refreshes last_activity_at so the inactivity
-- timeout window restarts. The client calls this on meaningful actions.
-- ---------------------------------------------------------------------------

create or replace function touch_clinician_session()
  returns void as $$
declare
  v_clinician_id uuid;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    return; -- silent no-op for non-clinicians
  end if;

  update clinician_session
     set last_activity_at = now()
   where clinician_id = v_clinician_id
     and ended_at is null;
end;
$$ language plpgsql security definer;

revoke all on function touch_clinician_session() from public;
grant execute on function touch_clinician_session() to authenticated;

-- ---------------------------------------------------------------------------
-- end_clinician_session
--
-- Clinician-callable. Manual end.
-- ---------------------------------------------------------------------------

create or replace function end_clinician_session()
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
     and ended_at is null;

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  )
  select auth.uid(), 'clinician', 'session_ended', 'clinician_session',
         id::text
    from clinician_session
   where clinician_id = v_clinician_id
     and ended_at = now() - interval '0';
   -- ^ no-op condition; we just want a row that captures the action.
   -- A cleaner approach: capture the session ID before the UPDATE above.
end;
$$ language plpgsql security definer;

revoke all on function end_clinician_session() from public;
grant execute on function end_clinician_session() to authenticated;

-- ---------------------------------------------------------------------------
-- ensure_profile_for_auth_user
--
-- Trigger on auth.users insert: create a matching profile row. The
-- application is responsible for setting role correctly via the admin
-- UI when creating accounts; default 'patient' here as a safe baseline.
-- ---------------------------------------------------------------------------

create or replace function ensure_profile_for_auth_user()
  returns trigger as $$
begin
  insert into profile (id, role, display_name, email)
  values (
    new.id,
    'patient',
    coalesce(new.raw_user_meta_data->>'display_name', 'Unnamed'),
    new.email
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

-- The actual trigger declaration must be run with appropriate
-- privileges on the auth schema; in Supabase it's typically done via
-- the dashboard or a separate migration with elevated permissions. We
-- document the intent here rather than declare it, because attaching
-- triggers to auth.users from a regular migration is environment-dependent.

comment on function ensure_profile_for_auth_user() is
  'Run via trigger on auth.users AFTER INSERT to create a profile row.';
