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

### F2 — EXECUTE defaulted to PUBLIC on the app functions — FIXED in 0109  *(was: medium)*

Not an active vulnerability (the internal gates reject unauthorized callers), but
loose hygiene: `anon` could still *invoke* clinician/admin RPCs and merely be
rejected. 0109 tightens this to least privilege.

**The trap that made this delicate:** some of these functions are invoked inside
RLS **policy expressions**, and policy expressions execute as the *querying* role —
so if `anon` queries such a table, `anon` needs EXECUTE on the function or the query
errors instead of cleanly returning zero rows. A `pg_depend` walk showed **exactly
6** SECURITY DEFINER functions are referenced by any policy, and all 6 are
referenced by at least one `TO PUBLIC` policy: `clinician_can_access_patient`,
`current_app_role`, `current_clinician_id`, `current_patient_id`,
`current_role_is_care_professional`, `current_user_is_admin`. These keep `anon`.

**What 0109 does:** for the **67** remaining functions (the 83 SECURITY DEFINER
functions minus those 6, minus the 10 `dev_seed_*` already locked in 0108) it runs
`REVOKE EXECUTE … FROM PUBLIC, anon` then `GRANT EXECUTE … TO authenticated,
service_role`. Each was confirmed to be called only from a logged-in
patient/clinician surface (checked against the app's `.rpc()` call sites; the only
pre-login auth goes through Supabase Auth, not a custom function), so removing
`anon` changes no legitimate behaviour. Verified in the harness: post-0109 the 67
targets show `anon`=0 / `authenticated`=67 / `service_role`=67, the 6 helpers still
carry `anon`, the 10 dev functions are unchanged, and a from-scratch replay of all
migrations is clean.

**Residual (live-only) check:** the harness can't exercise the logged-out UI, so
post-deploy confirm that loading the app while signed out — and the visit-code /
clinician-session flows while signed in — produces no `permission denied for
function` errors.

### F3 — FORCE ROW LEVEL SECURITY — reviewed again; deliberately NOT enabled  *(analysis, no migration)*

`FORCE ROW LEVEL SECURITY` makes RLS apply to the table **owner** too. Current
posture (measured): **28** tables in `public`, **all** with RLS enabled, **none**
forced; **76** policies are `TO PUBLIC`, **16** are role-scoped only, and **3**
tables have *only* role-scoped policies. The conclusion isn't merely "hard to
verify" — FORCE RLS is the wrong tool for this app's architecture:

1. **The threat it addresses is absent here.** FORCE RLS protects against the table
   *owner* reading/writing around RLS. This app never connects as the owner: all
   access is via the `authenticated` / `service_role` clients (RLS applies) or via
   SECURITY DEFINER functions. There is no owner-context query path to guard.

2. **It would break the SECURITY DEFINER pattern, by design.** Those functions run
   as `postgres` (the owner) and intentionally operate *above* row-scoping — e.g. a
   clinician function reads a patient's rows after the coarse
   `clinician_can_access_patient` gate. Under FORCE RLS: on the 3 tables with only
   role-scoped policies the owner context has **no applicable policy → silent
   default-deny**; and even where a `TO PUBLIC` policy like
   `patient_id = current_patient_id()` exists, it would filter a *clinician's*
   definer function down to the clinician's own patient rows (i.e. nothing),
   silently breaking clinician and admin read/write paths.

3. **Unverifiable in the replay harness.** Sandbox `postgres` has `BYPASSRLS`, so it
   ignores FORCE RLS — the harness would show a false green. Any attempt would need
   a Supabase branch with real JWTs.

**Recommendation: do not enable FORCE RLS.** The sound posture for this design is
the one already in place — RLS enabled on every table (protecting direct
`authenticated` access) plus trusted, individually-gated SECURITY DEFINER functions
for cross-cutting access (§3), now with the `anon` attack surface removed
(F2 / 0109). If a future redesign ever moved cross-cutting logic out of definer
functions, FORCE RLS could be revisited via: add owner/`public`-applicable policies
covering the definer context, confirm the project's `postgres` role lacks
`BYPASSRLS`, then roll out table-by-table on a Supabase branch exercising every
patient/clinician/admin flow — never a blind migration.

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
