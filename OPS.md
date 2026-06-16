# Operations runbook — Treatment Companion

How to **run** the pilot: monitor it, get alerted when something breaks, recover
from a bad deploy or data loss, and know what to do when an alert fires.

This is a companion to `DEPLOY.md` (how to ship) and `HANDOVER.md` (how the app
is built). It is deliberately small — a pilot needs "did something break and can
I recover", not a full SRE program.

> **What is already done in code vs. what you must do in a dashboard.**
> The error-monitoring **code** (Sentry, privacy-first) is in the repo and needs
> no change. Everything marked **[DASHBOARD]** below is a one-time setup you do in
> the Sentry, Supabase, or Vercel web UI — Claude cannot configure those for you.
> Items marked **[ROUTINE]** are recurring checks.

---

## 0. Go-live checklist — before the first real patient

Everything below runs in **development with test data** today, and none of it is
switched on yet — by design. There is nothing irreplaceable to protect while the
data is fake. **The day you move from test data to real patient data is the trigger**
to turn it all on, as one checklist rather than scattered decisions:

- [ ] **Supabase Pro + backups** — upgrade so nightly backups exist (PITR recommended). Backups must be running *before* the first real patient (§2).
- [ ] **Test the restore once** — restore a backup into a throwaway project so you know it actually works (§2.3).
- [ ] **Sentry on** — set `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT=production` in Vercel, then create the alert rules (§1). The code is already in the repo and stays dormant until the DSN is set.
- [ ] **CSP enforced** — validate the Report-Only CSP in a browser across all three roles, then switch it to enforced in `next.config.ts`.
- [ ] **Next.js security update** — move off `next@15.1.9` (published advisory) to a patched 15.x.
- [ ] **Compliance pieces in place** — GDPR / DPIA / data-processing agreements / EU residency / retention / DSAR, plus the MDR intended-use work (handled separately) confirmed done.
- [ ] **Native-Danish review** — clinical strings reviewed by a native speaker.

---

## 1. Error monitoring (Sentry)

### What it captures
- **Errors only.** No session replay, no performance tracing, no profiling.
- **PII-scrubbed.** `lib/sentry.shared.ts` sets `sendDefaultPii: false` and runs a
  `beforeSend` scrubber that strips request bodies, cookies, headers, query
  strings, user identifiers, and breadcrumb URLs/bodies — so a failed check-in or
  goal request never ships clinical content to Sentry. This matters: Sentry is a
  third-party processor and this app handles identifiable EU health data.
- Every event is tagged with the **deploy environment** and **release** (see
  setup below) so you can tell production errors from preview-deploy noise and
  trace an error back to a specific deploy.

### One-time setup
1. **[DASHBOARD]** Create an **EU-hosted** Sentry project (data residency — keep
   error events in the EU and list Sentry in your data-processing inventory).
2. **[DASHBOARD]** In **Vercel → Project → Settings → Environment Variables**, set:
   - `NEXT_PUBLIC_SENTRY_DSN` = the project DSN (without it, Sentry is a no-op and
     captures nothing — safe, but you also get no alerts).
   - `NEXT_PUBLIC_SENTRY_ENVIRONMENT` = `production` (so production events are
     tagged correctly in the browser bundle; the server side is automatic).
   - *(optional)* `NEXT_PUBLIC_SENTRY_RELEASE` — only if you want a friendlier
     release name than the git SHA Vercel already provides.
3. Redeploy so the env vars take effect.

### Alert rules to create  **[DASHBOARD]**
In **Sentry → Alerts → Create Alert Rule**, scoped to the production environment.
For a small pilot, these four cover the real cases without noise:

| Alert | Trigger | Why |
|---|---|---|
| **New issue** | A new, never-seen error appears | Catches regressions the moment a deploy introduces them |
| **Spike** | An issue occurs **> 10 times in 1 hour** | Something is broken for many users / in a loop |
| **High volume** | **> 50 events in 1 hour** (across all issues) | Whole-app problem (bad deploy, Supabase outage) |
| **Regression** | A **resolved** issue happens again | You marked it fixed and it came back |

- **Recipients:** your email now; add the incoming developer's email/Slack when
  they join. Don't rely on a single person seeing it.
- Keep thresholds loose at first and tighten once you see normal volume — an alert
  that cries wolf gets muted, which is worse than no alert.

### When an alert fires (triage)
1. Open the issue in Sentry. Note the **environment** and **release** tags — is it
   production, and which deploy introduced it?
2. Read the stack trace and breadcrumbs (URLs are path-only by design; there will
   be **no** patient data — that's intentional, so reproduce from the path + the
   user's role, not from leaked values).
3. Decide severity:
   - **Whole app down / login or unlock broken** → mitigate now (see §4 rollback).
   - **One screen or one action failing** → fix forward in the next deploy.
   - **Single rare error** → note it, watch the count.
4. After fixing, **mark the issue resolved** in Sentry so the regression alert can
   tell you if it returns.

> Patient-safety note: the app does not diagnose, dose, or recommend treatment, so
> the realistic worst case of an outage is "patients/clinicians can't enter or view
> data for a while", not direct clinical harm. Treat sustained unavailability as
> urgent nonetheless, and tell affected clinicians if a clinic visit is impacted.

---

## 2. Backups & restore (Supabase)

> **Status: deferred until go-live (see §0).** While the app is in development with
> test data, there is nothing irreplaceable to back up, so backups are intentionally
> off for now. They must be on **before the first real patient** — treat that as the
> trigger. The steps below are what to do at that point; do the **test restore**
> (§2.3) at least once then, so you *know* it works.

### 2.1 Verify backups are on  **[DASHBOARD]**
- **Supabase → Database → Backups.** Confirm backups exist and note the cadence
  and retention. This depends on your plan:
  - **Daily backups** are available on paid plans; **Point-in-Time Recovery (PITR)**
    is a higher-tier add-on that lets you restore to any moment (not just the last
    nightly snapshot).
  - For a clinical pilot, a plan with **daily backups at minimum** is the floor;
    **PITR is strongly recommended** so a mistake at 14:00 doesn't cost you the
    whole day back to the midnight snapshot.
- Currently on the **Free** plan, which includes **no backups** — fine for
  development, not for real patients. Before go-live, either upgrade to **Pro**
  (nightly backups + restore) or run a manual `pg_dump` backup as a stopgap. Never
  run a clinical pilot holding real patient data with no backups at all.

### 2.2 How to restore  **[DASHBOARD]** — ⚠️ destructive
- **Snapshot restore:** Supabase → Database → Backups → choose a backup → Restore.
- **PITR restore:** choose a timestamp.
- **Restoring overwrites the current database.** Before restoring production:
  1. If the issue is data loss/corruption, first **stop writes** if you can (e.g.
     temporarily take the app down via Vercel) so you don't lose more.
  2. Prefer restoring into a **scratch project** first to inspect, *then* decide,
     rather than overwriting production blind.
  3. After any restore, **re-check the migration state** — your migrations live in
     git (`supabase/migrations/`) and are the source of truth; a restored snapshot
     should already contain them, but confirm the latest migration (currently
     `0101`) is present (`select max(version) ...` or check that recent tables
     like `visit_code_unlock_attempt` exist).

### 2.3 Test the restore  **[ROUTINE — do once now, then ~quarterly]**
1. Create a **new, throwaway Supabase project** (or use PITR "restore to new
   project" if your plan offers it).
2. Restore the latest production backup into it.
3. Sanity-check: tables present, row counts look sane, a couple of patients/goals
   readable, `select max(version)` matches your latest migration.
4. Delete the throwaway project.
5. Write the date you did this in your notes. A backup you have never restored is a
   hope, not a backup.

### 2.4 Beyond the Postgres database
A database snapshot is **not** the whole system. Also safeguard:
- **Migrations** — in git ✓ (already covered). This is how you rebuild schema.
- **Environment variables / secrets** — see §3. Losing these means you can restore
  the data but can't run the app.
- **Supabase Storage** (the goal-videos bucket) — object storage is **separate**
  from the Postgres backup. Confirm whether your plan backs up Storage; if not, and
  videos matter, plan a periodic export of the bucket. (For the pilot, video is
  consent-gated and may be sparse — but know the gap exists.)
- **Application export as a second net** — the app's pseudonymised CSV export is a
  data safeguard, not a backup (it's a subset, pseudonymised, and can't rebuild the
  DB), but it's a useful independent copy of the core dataset.

---

## 3. Secrets & environment

The app cannot be redeployed without these. **Record them in a secure store**
(a password manager / secrets vault) — not in git, not in a plain file.

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel | public (anon key; RLS is the real guard) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel (server only) | **secret** — bypasses RLS; never expose to the browser, never commit |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | see §1 |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Vercel | `production` |
| Supabase DB password / project ref | Supabase | needed for restores / `pg_dump` |

- **Never commit secrets.** If one is ever pasted into a commit, rotate it (assume
  it's compromised) and scrub history.
- Keep an up-to-date list of *which* env vars the production deploy needs, so a
  rebuild from scratch is possible.

---

## 4. Deploy & rollback

**Ship:** zip → GitHub (GitHub Desktop) → Vercel auto-build. See `DEPLOY.md`.

**CI gate + staging (P1 hardening):** by default Vercel builds whatever lands on
`main`, so a red CI build can still go live, and there is no staging. See
**`docs/STAGING-AND-CI-GATE.md`** to (a) switch on **deploy-on-green**
(`.github/workflows/deploy.yml` — ships production only after CI passes; inert
until its three Vercel secrets are set) and (b) add a **staging** Supabase
project + Vercel Preview env so changes are tested off real patient data first.

**Roll back a bad app deploy  [DASHBOARD]:**
- **Vercel → Deployments → pick the last known-good deployment → Promote to
  Production.** This is instant and is your fastest mitigation for a broken release.

**Database migrations are forward-only.** A migration cannot be "un-deployed" by
promoting an old Vercel build:
- If a migration only **adds** things (a new table/column/function — like `0101`),
  rolling the *app* back is usually enough; the extra DB objects sit unused.
- If a migration **changes or drops** something the old app needs, rolling the app
  back is **not** sufficient — you need a **compensating migration** (a new
  migration that reverses it) or, in the worst case, a **restore** (§2).
- This is why app + migration deploys must be **ordered deliberately** (see the
  per-build note in `BUILD.txt`/`HANDOVER.md`; e.g. `0101` was app-first-then-SQL).

**After any rollback:** check Sentry that the error rate drops back to baseline,
and confirm the DB and app are on compatible versions.

---

## 5. Incident response (lightweight)

A pilot-sized checklist. The goal is fast recovery and a short written trail.

1. **Detect** — an alert fires, or someone reports a problem.
2. **Assess** — production? how many users? login/unlock (everyone) or one screen?
   Check Sentry for the environment, release, and event volume.
3. **Mitigate** — stop the bleeding before fixing the root cause:
   - bad deploy → **promote the previous Vercel deployment** (§4);
   - Supabase outage → check the Supabase status page; there may be nothing to do
     but wait and inform users;
   - data corruption → consider stopping writes and restoring (§2).
4. **Communicate** — if a clinic visit or patient is affected, tell them; set
   expectations on timing.
5. **Fix forward** — land the real fix as a normal deploy; mark the Sentry issue
   resolved.
6. **Note it** — a few lines: what happened, impact, what fixed it, what to change
   so it can't recur. (Add recurring fixes to this runbook.)

---

## 6. Routine checks  **[ROUTINE]**

- **Weekly:** skim Sentry's new/unresolved issues; glance at Vercel build health.
- **Monthly:** review the grouped **Dependabot** PRs (`.github/dependabot.yml`) and
  merge security updates after CI passes; confirm a recent Supabase backup exists.
- **Quarterly:** do a **test restore** (§2.3); re-read this runbook and prune
  anything stale.
- **On each release:** follow the deploy order in `BUILD.txt`; after deploy, watch
  Sentry for a few minutes for a spike.

---

## 7. Known gaps / decisions (be honest about these)

- **Staging environment** is deferred — deploys go straight to production. Until a
  staging project exists, treat every deploy as production-affecting and lean on
  fast Vercel rollback. (CI does build + from-scratch migration + schema-contract
  checks on every push, which catches a large class of breakage pre-merge.)
- **Browser E2E tests** are deferred (they pair with staging). Verification today is
  CI (build/types/migrations/i18n) + manual QA of the rendered screens.
- **CSP is Report-Only** (`next.config.ts`) until validated in a browser across all
  three roles, then switched to enforced.
- **Backups** are deferred until the real-patient milestone (§0); the app is on the
  Supabase Free plan today (test data only).
- **Supabase Storage backup** coverage depends on plan — confirm it (§2.4).
- These are tracked alongside the other open items in `HANDOVER.md`.
