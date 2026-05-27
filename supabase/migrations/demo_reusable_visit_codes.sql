-- ============================================================================
-- DEMO — reusable visit codes for the six test patients.
--
-- Run AFTER:
--   * migration 0043 (adds is_reusable + the updated unlock RPC)
--   * the six test accounts exist (test1–test6@example.com)
--
-- Gives each test patient a fixed, reusable, memorable visit code:
--   test1@example.com  →  TEST01
--   test2@example.com  →  TEST02
--   test3@example.com  →  TEST03
--   test4@example.com  →  TEST04
--   test5@example.com  →  TEST05
--   test6@example.com  →  TEST06
--
-- A tester unlocks a patient by typing the code on the clinician
-- unlock screen — no need to log into the patient account. Because the
-- codes are reusable (is_reusable = true, set by migration 0043), they
-- work repeatedly and are never consumed.
--
-- Codes are 6 uppercase characters — the format the visit_code table
-- requires. Expiry is set one year out; they still expire eventually.
--
-- IDEMPOTENT: re-running re-asserts the codes (resets expiry, clears
-- any consumed marker). Safe to run again any time.
--
-- IMPORTANT: these are TEST codes for the demo only. Migration 0043's
-- header explains the containment and the regulatory note.
-- ============================================================================

do $$
declare
  v_rec record;
  v_patient_id uuid;
begin
  for v_rec in
    select * from (values
      ('test1@example.com', 'TEST01'),
      ('test2@example.com', 'TEST02'),
      ('test3@example.com', 'TEST03'),
      ('test4@example.com', 'TEST04'),
      ('test5@example.com', 'TEST05'),
      ('test6@example.com', 'TEST06')
    ) as t(email, code)
  loop
    -- Resolve the patient row from the account email.
    select pt.id into v_patient_id
      from patient pt
      join profile pr on pr.id = pt.profile_id
     where pr.email = v_rec.email;

    if v_patient_id is null then
      raise warning 'No patient for % — create the account and run the demo seed first. Code % skipped.',
        v_rec.email, v_rec.code;
      continue;
    end if;

    -- Insert or re-assert the reusable code. On conflict (the code
    -- already exists) re-point it at the right patient, refresh the
    -- expiry, clear any consumed marker, and ensure it is reusable.
    insert into visit_code (
      code, patient_id, expires_at, is_reusable
    ) values (
      v_rec.code, v_patient_id, now() + interval '1 year', true
    )
    on conflict (code) do update
      set patient_id  = excluded.patient_id,
          expires_at  = excluded.expires_at,
          is_reusable = true,
          consumed_at = null,
          consumed_by_clinician_id = null;

    raise notice 'Reusable code % ready for %.', v_rec.code, v_rec.email;
  end loop;
end $$;
