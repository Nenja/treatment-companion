-- ============================================================================
-- 0108  Harden SECURITY DEFINER functions
--
-- Two defence-in-depth fixes surfaced by the SECURITY DEFINER audit
-- (docs/audits/security-definer-audit-2026-06.md). No behaviour change for
-- legitimate callers.
--
-- A. Pin search_path on the 17 SECURITY DEFINER functions that were still
--    using a mutable search_path. A SECURITY DEFINER function with a mutable
--    search_path can, in principle, be tricked into resolving an unqualified
--    object name against an attacker-controlled schema. Pinning to `public`
--    (the same convention the other 66 SECURITY DEFINER functions already use)
--    closes that vector. The bodies reference public objects with bare names,
--    so `public` keeps them working unchanged. (Supabase's linter flags these
--    as "Function Search Path Mutable".)
--
-- B. Stop `anon` / `authenticated` from invoking the dev-seed functions. In
--    Postgres, EXECUTE defaults to PUBLIC, so every function in `public` was
--    callable by anyone — including the dev-seed helpers, which have NO
--    internal authorization check and are DESTRUCTIVE (dev_reseed_all() wipes
--    and re-creates the seeded test patients' data). The app's own /dev path
--    calls dev_reseed_all() through the SERVICE-ROLE client, so revoking the
--    PUBLIC/anon/authenticated grant and re-granting only to service_role
--    closes the hole without breaking that route. (They also remain callable
--    from the Supabase SQL editor, which runs as the table owner.)
--
-- NOTE: this migration does NOT add FORCE ROW LEVEL SECURITY. See the audit
-- doc §"FORCE RLS" — forcing RLS would subject the postgres-owned SECURITY
-- DEFINER functions to RLS, and on the 16 `TO authenticated`-only policies
-- there is no policy that applies to the definer context, which would cause
-- silent denials across the write path. It is also not verifiable in the CI
-- harness (there `postgres` is a superuser with BYPASSRLS). Deliberately left
-- for a separate, staging-tested change.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Pin search_path (17 functions)
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.clinician_can_access_patient(p_patient_id uuid) SET search_path = public;
ALTER FUNCTION public.current_app_role() SET search_path = public;
ALTER FUNCTION public.current_clinician_id() SET search_path = public;
ALTER FUNCTION public.current_patient_id() SET search_path = public;
ALTER FUNCTION public.current_profile_id() SET search_path = public;
ALTER FUNCTION public.current_role_is_care_professional() SET search_path = public;
ALTER FUNCTION public.current_user_is_admin() SET search_path = public;
ALTER FUNCTION public.end_clinician_session() SET search_path = public;
ALTER FUNCTION public.end_clinician_session(p_patient_id uuid) SET search_path = public;
ALTER FUNCTION public.ensure_profile_for_auth_user() SET search_path = public;
ALTER FUNCTION public.generate_visit_code(p_code text) SET search_path = public;
ALTER FUNCTION public.list_my_sessions() SET search_path = public;
ALTER FUNCTION public.register_device_push_token(p_token text, p_platform text, p_locale text) SET search_path = public;
ALTER FUNCTION public.reopen_session(p_patient_id uuid) SET search_path = public;
ALTER FUNCTION public.touch_clinician_session() SET search_path = public;
ALTER FUNCTION public.touch_clinician_session(p_patient_id uuid) SET search_path = public;
ALTER FUNCTION public.unlock_with_visit_code(p_code text) SET search_path = public;

-- ---------------------------------------------------------------------------
-- B. Lock down the dev-seed functions to service_role only
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.dev_reseed_all() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b1() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b2() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b3() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b4() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b5() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b6() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b7() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_b8() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dev_seed_history_extras() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.dev_reseed_all() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b1() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b2() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b3() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b4() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b5() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b6() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b7() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_b8() TO service_role;
GRANT EXECUTE ON FUNCTION public.dev_seed_history_extras() TO service_role;
