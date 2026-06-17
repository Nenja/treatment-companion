# Staging + CI gate — setup guide

> Goal: (1) make CI a real **gate** so production never updates from a red
> build, and (2) add a **staging** place to test changes against throwaway data
> before they touch the real patient environment. Both are P1 hardening items
> from `docs/ASSESSMENT-2026-06-15.md`. Neither requires installing anything on
> your computer — it's all dashboards plus files that already ship in the repo.

This is written so you (non-developer) can do the interim safely now, and the
incoming developer can take it the rest of the way.

---

## Where things stand (the problem)

Today: you upload a zip → it commits to `main` on GitHub → **Vercel builds
whatever landed, immediately**. CI (`.github/workflows/ci.yml`) runs on that
push and shows a green ✓ or red ✗ — but it does **not stop** the Vercel build.
So a red build can still go live. Green CI is a *signal*, not a *gate*.

There is also no **staging**: testing happens on the same Vercel project (and,
more importantly, the same Supabase database) that real patients would use.

---

## Part A — Make CI a real gate (deploy-on-green)

The repo now includes `.github/workflows/deploy.yml`. It deploys production
**only after the CI workflow finishes successfully on `main`** — even when you
commit directly to main (your zip-upload flow). It is **inert** until you do the
three steps below; dropping the file in the repo on its own changes nothing.

Why this and not "require pull requests"? Requiring PRs/branch-protection is the
right end state, but it breaks the direct web-upload flow you use today, so it's
best introduced **with the developer**. Deploy-on-green protects production
regardless of how code reaches `main`, so it's the better interim.

### Activate it

1. **Turn off Vercel's automatic production deploys.**
   Vercel → your project → **Settings → Git** → find the production
   deployment setting and **disable automatic deployments for the Production
   branch** (`main`). (If you skip this you'll get *two* deploys per push —
   Vercel's ungated one and this gated one.)

2. **Create a Vercel token and add three GitHub secrets.**
   - Vercel → **Account Settings → Tokens** → create a token (name it
     `github-deploy`, scope to your team). Copy it.
   - Get your **Org ID** and **Project ID**: Vercel → your project →
     **Settings → General** (Project ID is there; Org/Team ID is under your
     team's General settings). *(If easier, the developer can run `vercel link`
     once and read them from `.vercel/project.json`.)*
   - GitHub → repo → **Settings → Secrets and variables → Actions → New
     repository secret**, add all three:
     - `VERCEL_TOKEN`
     - `VERCEL_ORG_ID`
     - `VERCEL_PROJECT_ID`

3. **Confirm.** Push any small change. In GitHub → **Actions** you should see
   `CI` run, and only if it's green, `Deploy (production, on green CI)` runs
   after it. If CI is red, the deploy never starts. ✅ gate working.

### Optional, with the developer: protect `main`

Once you've moved to a PR-based flow (developer on board):
GitHub → **Settings → Branches → Add branch ruleset** for `main` →
require the **CI** status check to pass before merging, and require a pull
request. Until then, leave direct-to-main + deploy-on-green as-is.

---

## Part B — A staging environment

The simplest staging that gives you a real safety margin, without a second
Vercel project:

### B1. A separate Supabase project for staging (the important half)

The thing you must never test against is the **production database**. Create a
second Supabase project, e.g. `treatment-companion-staging`, used only for
testing.

- Run **all** migrations in it once (same files, same order) so its schema
  matches production. From then on, the rule becomes: **run a new migration in
  staging first, verify, then run it in production** — this fits your existing
  manual-SQL habit and catches migration problems off real data.
- Staging may use seed/fake data freely (the dev-seed RPCs). Production never.

### B2. Point a staging deploy at the staging database (Vercel Preview env)

Vercel already builds a **Preview** deployment for any branch that isn't
production. Use that as staging — no second project needed:

1. Vercel → project → **Settings → Environment Variables**. For each of
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, set the
   **Preview** scope to the **staging** Supabase values, and keep **Production**
   pointed at the real project. (Set `SENTRY` environment to `staging` for
   Preview too, so staging errors are tagged separately.)
2. Make a long-lived `staging` branch on GitHub. Uploading a zip to `staging`
   (instead of `main`) produces a Preview URL running against staging data.
3. Flow becomes: **upload to `staging` → test on the Preview URL → when happy,
   upload the same files to `main` → deploy-on-green ships production.**

If you'd rather have a stable staging URL and full isolation, the developer can
instead create a **second Vercel project** tracking the `staging` branch with
its own env vars — same idea, a bit more setup.

### B3. Keep the two databases in step

- Migrations: staging first, then production (B1).
- Secrets/config: whenever you add a production secret, add the staging
  equivalent to the Preview scope.
- Backups/PITR: enabling Pro + PITR (see `OPS.md` §2) is a **production**
  requirement; staging doesn't need it.

---

## Recommended order

1. **Part A** (deploy-on-green) — biggest safety win, ~15 min of dashboard work.
2. **B1** (staging Supabase + migrate-staging-first) — protects the one
   irreplaceable thing, real patient data.
3. **B2** (Preview env → staging DB) — gives you somewhere to click around
   before production.
4. With the developer: branch protection + PRs, and (separately) the
   automatic-migrations reconciliation noted in `DEPLOY.md`.

None of this is a patient-safety *gate* on its own, but together they remove the
"a bad build or untested migration reaches real patients" risk before clinical
testing.

---

## Troubleshooting — double deploys & 500s (seen 2026-06-16)

**Symptom.** In Vercel → Deployments, *two* production deploys appear per commit:
a `main` one taking ~1 min and a `HEAD` one taking ~12 s. The 12 s one serves
500s ("Your project's URL and Key are required"); the 1 min one works. The live
app flaps between them and the deployment URL keeps changing.

**Cause — two deploy mechanisms running at once.**
- `main` / ~1 min = **Vercel's own git build** (it has all env vars at build,
  so it works). This means activation step 1 below was never done (or got
  undone): Vercel is still auto-deploying production on push.
- `HEAD` / ~12 s = **this workflow's prebuilt deploy** (build happens in CI,
  Vercel just receives the artifact). It 500s because the build-time
  `NEXT_PUBLIC_*` vars weren't inlined.

**Why the prebuilt build inlines blanks.** `NEXT_PUBLIC_*` vars are baked in at
**build** time. The CI build gets its env from `vercel pull`, **which does not
download env vars marked "Sensitive"** in Vercel. If
`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are flagged
Sensitive, the CI build inlines empty strings → runtime 500. (Vercel's own
build sees them regardless, which is why only the prebuilt deploy breaks.)

**Fix, in this order (don't reorder — step 4 before a working Action = total
outage):**
1. **Make the build-time public vars non-Sensitive.** Vercel → Settings →
   Environment Variables → for `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, ensure they exist for **Production** and are
   **not** "Sensitive". Server-only secrets (`SUPABASE_SERVICE_ROLE_KEY`,
   `REDCAP_API_TOKEN`, `CRON_SECRET`) are read at runtime, not inlined — they
   can stay Sensitive.
2. The deploy workflow now **fails closed**: it aborts (keeping the last good
   build live) if those vars are missing after `vercel pull`, or if the built
   output contains no Supabase URL. So a blank bundle can't reach production.
3. Push a commit → let the Action run → **confirm the site works** on
   `treatment-companion.vercel.app`. Only the prebuilt (`HEAD`) deploy should
   need to succeed; verify it does.
4. **Now stop the double-deploy.** Vercel → Settings → Build and Deployment →
   **Ignored Build Step** → set to:
   `if [ "$VERCEL_ENV" = "production" ]; then exit 0; else exit 1; fi`
   That cancels Vercel's own *production* git builds (so only the gated Action
   deploys production) while still building Preview/staging. After this, each
   commit should show **one** production deploy (`HEAD`, from the Action), not
   two.

**Always use the stable domain** `treatment-companion.vercel.app`, never the
per-deploy `…-<hash>.vercel.app` URLs (those change every deploy by design).
