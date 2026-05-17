# Supabase backend — schema and policies

This folder contains the database design for the Treatment Companion
backend. It's intended for **Supabase** (Postgres + auth + RLS +
generated TypeScript types), but the SQL is portable to any Postgres
instance with minor tweaks (the `auth.uid()` references need substituting
if you're not using Supabase Auth).

## Files

| File | What it does |
| ---- | ------------ |
| `migrations/0001_initial_schema.sql` | All tables, enums, foreign keys, indexes. Audit-event immutability trigger. |
| `migrations/0002_rls_policies.sql` | Row-level security policies enforcing patient/clinician/admin data isolation. |
| `migrations/0003_rpc_functions.sql` | Server-side functions: visit-code generation and unlock, session management. |

## How to apply

### Option A: Supabase CLI (recommended)

```bash
# Once, after creating the Supabase project:
supabase link --project-ref <your-project-ref>

# Apply all migrations:
supabase db push
```

The CLI tracks which migrations have been applied. Adding new migration
files (`0004_*.sql`, etc.) is the way to evolve the schema.

### Option B: Manual paste

Go to the SQL editor in the Supabase dashboard. Paste and run each file
in order:

1. `0001_initial_schema.sql`
2. `0002_rls_policies.sql`
3. `0003_rpc_functions.sql`

Then attach the `ensure_profile_for_auth_user` trigger to `auth.users`
via the dashboard (Database → Triggers → New trigger, AFTER INSERT on
`auth.users`, calling the function).

## Mapping from prototype types to tables

Roughly one table per interface in `lib/types.ts`:

| TypeScript type | Postgres table |
| --- | --- |
| `Patient` | `patient` (+ `profile`) |
| `Clinician` | `clinician` (+ `profile`) |
| `TreatmentCycle` | `treatment_cycle` |
| `GoalSuggestion` | `goal_suggestion` |
| `ApprovedGoal` | `approved_goal` (GAS anchors as separate columns) |
| `WeeklyPrompt` | `weekly_prompt` |
| `WeeklyCheckin` | `weekly_checkin` |
| `WeeklyGoalRating` | `weekly_goal_rating` |
| `TreatmentSession` | `treatment_session` |
| `MuscleInjection` | `muscle_injection` |
| `VisitCode` | `visit_code` |
| `ClinicianSession` | `clinician_session` |
| `AuditEvent` | `audit_event` |

## What's intentionally different from the prototype

- **UUIDs everywhere**, generated server-side. The client doesn't make
  up IDs anymore.
- **`profile` table** splits auth identity from role-specific data.
  Lets a single auth.users row power either a patient or clinician
  application identity.
- **Audit log is append-only**, enforced both by RLS and a trigger.
- **Clinician access is per-session, not permanent.** A clinician can
  only read a patient's data while `clinician_session` is active and
  not timed out. This makes the access model honest — you don't have
  "this clinician has permanent access to this patient", you have
  "this clinician currently has the patient unlocked".
- **GAS anchors are five columns**, not a JSON blob. Queryable,
  validatable, length-limited.
- **`hopedTimeframe`** retained on `goal_suggestion` (with a `notSure`
  default) so historical data and the data model don't diverge.

## What still needs design when you're ready to commit

- **Prompt generation job.** Right now in the prototype, the dev
  panel's "Simulate next week" button creates weekly prompts. In
  production, a scheduled job (Supabase Edge Function on a cron) needs
  to create them for every active cycle once a week. The job runs as
  the service role to bypass RLS.
- **Onboarding flow.** Who creates patient and clinician accounts, and
  how? Probably an admin UI that uses the Supabase admin API to invite
  users by email, set their role, and create their initial patient or
  clinician row.
- **Data subject rights.** Patient export (GDPR Article 15), deletion
  (Article 17), portability (Article 20) are all SQL-level workflows
  but each needs a careful design — what counts as "Anna's data"
  spans many tables, and deletion has to leave audit-log integrity.
- **Real-time subscriptions.** Supabase has `realtime` channels for
  pushing database changes to connected clients. Hooking the
  clinician's view up to changes for the unlocked patient is a few
  lines; doing it without leaking via shared channels takes thought.

## Test fixtures

Not included here. The prototype's `lib/fakeData.ts` is the seed source
of truth; a `seed.sql` companion file should be generated from it (or
written by hand) to populate development databases.
