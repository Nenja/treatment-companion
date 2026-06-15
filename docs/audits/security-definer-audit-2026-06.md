# SECURITY DEFINER audit + RLS-hardening review — 2026-06

**Scope:** every `SECURITY DEFINER` function in the `public` schema, their
`search_path` setting, their caller-authorization checks, their EXECUTE grants,
and whether `FORCE ROW LEVEL SECURITY` should be enabled.

**Method:** all numbered migrations were replayed from `supabase/ci/bootstrap.sql`
onto a throwaway Postgres 16, and the live state was queried directly from the
catalog (`pg_proc`, `pg_class`, `pg_policy`, `has_function_privilege`). This is
the same harness CI uses, so it reflects exactly what `psql`-applying the
migrations produces. Fixes are shipped as migration **`0108_harden_secdef_functions.sql`**
and re-verified by a from-scratch replay.

> **Honest limits.** The CI harness stubs Supabase auth (`auth.uid()` returns
> null) and its `postgres` role is a superuser with `BYPASSRLS`, which real
> Supabase's `postgres` is not. So this harness validates DDL, signatures,
> grants and name-resolution — **not** live RLS row-filtering or JWT-dependent
> behaviour. Anything depending on those is flagged for staging verification.

---

## 1. Count reconciliation

The June assessment cited "134 SECURITY DEFINER functions." That number is
wrong — it counted Supabase's own system schemas (`auth.*`, `storage.*`, etc.),
which Supabase manages. The **app** has **83** `SECURITY DEFINER` functions in
`public` (of which 10 are dev-seed helpers). The assessment figure should read
83. Everything below concerns those 83.

---

## 2. `search_path` — FIXED in 0108

A `SECURITY DEFINER` function with a mutable `search_path` can be coerced into
resolving an unqualified name against an attacker-controlled schema. Supabase's
linter flags this as "Function Search Path Mutable."

- **66 of 83** already pinned `search_path = public`. Good.
- **17 did not** — the `current_*` auth helpers (`current_app_role`,
  `current_clinician_id`, `current_patient_id`, `current_profile_id`,
  `current_role_is_care_professional`, `current_user_is_admin`), the
  clinician-session functions (`end_clinician_session` ×2, `reopen_session`,
  `touch_clinician_session` ×2, `list_my_sessions`), the visit-code functions
  (`generate_visit_code`, `unlock_with_visit_code`), `clinician_can_access_patient`,
  `register_device_push_token`, and the new-user trigger `ensure_profile_for_auth_user`.

**0108 part A** runs `ALTER FUNCTION … SET search_path = public` on all 17 — the
same convention the other 66 use, and harmless because their bodies reference
public objects with bare names. Verified: 0 functions remain with a mutable
search_path, and all 17 still execute cleanly under the pinned path.

---

## 3. Caller-authorization gates — reviewed, no gaps found

Each function was classified by whether it carries an authorization gate. The
22 functions that take a `p_patient_id` (the cross-user surface — a clinician
could otherwise reach an arbitrary patient) are **all** gated:

- Most resolve the patient and call **`clinician_can_access_patient(p_patient_id)`**,
  which only returns true when the caller has an **active, non-timed-out
  clinician session** for that patient:
  ```sql
  select exists (select 1 from clinician_session s
     where s.clinician_id = current_clinician_id()
       and s.patient_id   = p_patient_id
       and s.ended_at is null
       and s.last_activity_at > now() - interval '1 hour');
  ```
  The 1-hour timeout is enforced at the DB, not just the app — a stale session
  can't be replayed via a direct API call.
- Admin-only operations (`confirm_research_purge`) gate on `current_user_is_admin()`
  and raise otherwise.
- Self-service functions (`set_own_*`) operate strictly on `current_patient_id()`.
- Heartbeat/no-op functions (`touch_clinician_session`) silently no-op for
  non-clinicians rather than raising.

The goal/treatment/suggestion functions that don't take a `p_patient_id` resolve
the owning patient from the entity and apply the same gate. **No ungated
cross-user write path was found.**

---

## 4. Findings

### F1 — Dev-seed functions were world-callable and destructive — FIXED in 0108  *(was: high)*

EXECUTE defaults to PUBLIC in Postgres, and no migration revoked it — so all 83
functions were callable by `anon` (not-logged-in) and `authenticated`. For the
73 app functions this is mitigated by their internal gates (an `anon` caller
fails every check). **But the 10 `dev_seed_*` functions have no internal gate
and are destructive** — `dev_reseed_all()` calls seeders that `delete` a
patient's check-ins, ratings, prompts, goals, etc. before re-inserting. In the
production DB (migration `0066` is not `ci:skip`, so these functions exist there)
an anonymous internet caller could invoke `dev_reseed_all` and wipe seeded data.

**Fix (0108 part B):** `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated` and
`GRANT EXECUTE … TO service_role` for all 10 dev functions. The app's own
`/api/dev/scenario` route calls `dev_reseed_all` through the **service-role**
client, so it keeps working; they also remain runnable from the Supabase SQL
editor. Verified: `anon`/`authenticated` EXECUTE = false, `service_role` = true,
and a normal RPC's grants are unchanged.

> Related app-side note (not a DB fix): confirm `/api/dev/scenario` itself is
> not reachable in the production deployment, or is behind an admin check. The
> DB grant now blocks the destructive path regardless, but the route shouldn't
> be exposed.

### F2 — EXECUTE still defaults to PUBLIC on the 73 app functions — recommendation  *(medium)*

Not an active vulnerability (the internal gates reject unauthorized callers),
but loose hygiene: `anon` can still *invoke* clinician/admin RPCs and merely be
rejected. Tightening to least-privilege (revoke `anon` EXECUTE except a small
deliberate allowlist; grant `authenticated` only where needed) reduces attack
surface and error-message/DoS exposure.

**Why not done in this batch:** several of these functions are invoked indirectly
by RLS **policy expressions** (e.g. policies call `current_patient_id()`), so the
querying role needs EXECUTE on them — revoking blindly would break RLS evaluation
and take the app down. Doing this safely needs a per-function role-usage map
(direct RPC + policy invocations) and staging verification. Recommended as its
own change.

### F3 — FORCE ROW LEVEL SECURITY — deliberately NOT enabled  *(analysis)*

`FORCE ROW LEVEL SECURITY` makes RLS apply to the table **owner** too. The 83
`SECURITY DEFINER` functions are owned by `postgres` and currently rely on the
owner-bypass. Forcing RLS is unsafe here:

1. **76 policies are `TO PUBLIC` but 16 are `TO authenticated`.** Under FORCE
   RLS, the `postgres`-context operations inside the functions would be filtered
   by RLS, and on the tables whose only policy is `TO authenticated` there is
   **no policy that applies to the definer context → silent default-deny**,
   breaking those write paths.
2. **Not verifiable in this harness** — here `postgres` is a superuser with
   `BYPASSRLS`, so it ignores FORCE RLS entirely; the harness would show a green
   that production wouldn't reproduce.
3. **Low marginal value here** — every write already goes through the audited,
   gated RPCs in §3, and direct table access is already RLS-restricted for
   `anon`/`authenticated`. FORCE RLS mainly guards against a *bug* in a definer
   function, at the cost of a plausible production-wide write outage.

**If it's ever wanted**, the safe path is: (a) add owner/`public`-applicable
policies (or convert the 16 `TO authenticated` policies) so the definer context
is covered; (b) confirm Supabase's `postgres` role lacks `BYPASSRLS` in the
target project; (c) roll out table-by-table against a Supabase **branch/staging**
with real auth, exercising each RPC; (d) only then enable in production. This is
a separate, staging-tested change — not a migration to apply blind.

---

## 5. Verification performed

- All 105/106 numbered migrations replay cleanly from `bootstrap.sql` on PG16,
  before and after adding 0108 (matches CI).
- After 0108: **0** public `SECURITY DEFINER` functions with a mutable
  `search_path`; all 17 altered functions execute without error.
- After 0108: dev functions are `service_role`-only; `submit_weekly_checkin_v4`,
  `set_own_sex`, `clinician_can_access_patient` (representative app RPCs) retain
  `authenticated` EXECUTE.
- **Not** verified (needs Supabase staging with real auth): live RLS
  row-filtering and any JWT-dependent gate outcomes.
