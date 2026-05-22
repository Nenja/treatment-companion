-- ============================================================================
-- 0024 — unlock_with_visit_code: stamp the real role in the audit event.
--
-- The unlock RPC works unchanged for physiotherapists because it keys
-- off current_clinician_id() (any row in the `clinician` table). But
-- it hardcoded actor_role = 'clinician' in the audit event. Now that
-- physiotherapists also unlock, that would mislabel their unlock
-- events. We stamp the caller's actual profile role instead.
-- ============================================================================

create or replace function unlock_with_visit_code(p_code text)
  returns uuid as $$
declare
  v_clinician_id uuid;
  v_patient_id uuid;
  v_role role;
begin
  v_clinician_id := current_clinician_id();
  if v_clinician_id is null then
    raise exception 'caller is not a clinician';
  end if;

  v_role := current_app_role();

  select patient_id into v_patient_id
    from visit_code
   where code = upper(p_code)
     and consumed_at is null
     and expires_at > now()
   for update;

  if v_patient_id is null then
    raise exception 'invalid or expired code';
  end if;

  update clinician_session
     set ended_at = now(),
         end_reason = 'expired_by_new_session'
   where clinician_id = v_clinician_id
     and ended_at is null;

  update visit_code
     set consumed_at = now(),
         consumed_by_clinician_id = v_clinician_id
   where code = upper(p_code);

  insert into clinician_session (
    clinician_id, patient_id, visit_code
  ) values (
    v_clinician_id, v_patient_id, upper(p_code)
  );

  insert into audit_event (
    actor_profile_id, actor_role, action, entity, entity_id
  )
  select auth.uid(), v_role, 'patient_unlocked', 'patient',
         v_patient_id::text;

  return v_patient_id;
end;
$$ language plpgsql security definer;

revoke all on function unlock_with_visit_code(text) from public;
grant execute on function unlock_with_visit_code(text) to authenticated;
