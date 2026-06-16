# End-to-end smoke (Playwright)

A small browser-level smoke test: the login page renders, signed-out users are
bounced to login, a patient can sign in, and a patient can complete a weekly
check-in. It's a **smoke** test — proof the critical path is wired end to end,
not exhaustive coverage. The unit/component suite (`npm test`, Vitest) covers
the detailed logic.

> **Honest status.** This scaffold was written without being run — the machine
> that produced it has no browser and no live app + database. The two
> *unauthenticated* tests are robust. The two *patient* tests depend on real
> credentials and seeded data and may need a small selector tweak on the first
> real run. Treat the first green run as the real acceptance.

## One-time setup

```bash
npm install -D @playwright/test     # the test runner (not in package.json yet)
npx playwright install chromium     # the browser binary
```

Playwright is intentionally **not** in `package.json` / the lockfile, so this
scaffold doesn't disturb the app build or Vercel. Add it with the command
above (or add it to `devDependencies` yourself if you want CI to install it).

## Configure

The test reads everything from environment variables.

| Variable | Needed for | Example |
|---|---|---|
| `E2E_BASE_URL` | optional — test a deployed build instead of localhost | `https://treatment-companion.vercel.app` |
| `E2E_PATIENT_EMAIL` | the authenticated tests | `test1@example.com` |
| `E2E_PATIENT_PASSWORD` | the authenticated tests | (the password you set for that account) |

If `E2E_PATIENT_EMAIL` / `E2E_PATIENT_PASSWORD` are unset, the two patient
tests **skip** (they don't fail) — so the harness is green out of the box.

A convenient local way to set them (don't commit it):

```bash
# e2e.env  (load with: set -a; . ./e2e.env; set +a)
E2E_PATIENT_EMAIL=test1@example.com
E2E_PATIENT_PASSWORD=your-test-password
```

### Preconditions for the check-in test

- The login account must be a **patient** whose password is already set (a
  brand-new account on a temporary password is sent to `/reset-password`).
- That patient must have a **pending weekly check-in** and at least one active
  goal. The demo seed creates suitable patients — `test1@example.com`
  (mid-cycle, going well) is a good choice. See
  `supabase/migrations/demo_seed_test_patients.sql` (the auth users are created
  separately, e.g. via the admin page, then the seed links them by email).

## Run

Local (Playwright starts `npm run dev` for you; needs a working `.env.local`):

```bash
npx playwright test
npx playwright test --ui          # interactive
npx playwright show-report e2e/.artifacts/playwright-report
```

Against a deployed preview (no local server started):

```bash
E2E_BASE_URL=https://your-preview.vercel.app \
E2E_PATIENT_EMAIL=test1@example.com \
E2E_PATIENT_PASSWORD=... \
npx playwright test
```

Artifacts (HTML report, traces, screenshots, videos) land in
`e2e/.artifacts/` and are gitignored. If you'd rather use Playwright's default
locations, also add `playwright-report/` and `test-results/` to your repo-root
`.gitignore`.

## CI (optional, manual)

`.github/workflows/e2e.yml` runs the smoke **on demand only** (workflow
dispatch), pointed at a deployed URL — so it never blocks normal pushes. Set
these on the repo before using it:

- Variable `E2E_BASE_URL` → your preview/production URL
- Secrets `E2E_PATIENT_EMAIL`, `E2E_PATIENT_PASSWORD`

Leaving it manual is deliberate: a browser E2E against a live database is the
kind of thing that flakes, and you don't want a flake to red-gate every commit.
Promote it to run on a schedule or on deploy once it's proven stable.

## When a selector breaks

The selectors lean on roles and stable ids: `#email` / `#password` /
`button[type="submit"]` for login, the rating `radiogroup` + its `radio`
options for goals, and the buttons named **Continue** / **Send my check-in** /
the **Thank you** heading for the wizard. If the UI text changes, update the
names in `smoke.spec.ts`. Run `npx playwright test --ui` (or open the trace in
the HTML report) to see exactly where it stopped.

## Clinician tests (`clinician.spec.ts`)

Extends the smoke to the clinician paths. Two tiers:

**Tier 1 — runnable now (read-only).** Signed-out redirects on `/clinician`
and `/visit-code`, and a clinician sign-in. Add credentials for a **dedicated
test clinician** and they run; without them they self-skip.

| Variable | Needed for |
|---|---|
| `E2E_CLINICIAN_EMAIL` / `E2E_CLINICIAN_PASSWORD` | the clinician sign-in test |

These are safe against production (no data is mutated). The e2e workflow passes
them through if you set the matching repo **secrets**.

**Tier 2 — write journeys (`test.fixme`, run against STAGING only).** "Clinician
approves a pending suggestion" and "therapist note round-trip" mutate data and
go through the visit-code unlock, so they must run against a **staging** target
with disposable data and the dev scenario API enabled — never production. They
are left as `test.fixme` (reported as "to implement", never false greens)
because they were authored without a live run. To bring them up:

1. Target staging (`E2E_BASE_URL=https://<staging-preview>.vercel.app`; see
   `docs/STAGING-AND-CI-GATE.md`).
2. Set `E2E_DEV_API=1`, plus `E2E_CLINICIAN_EMAIL/_PASSWORD` and
   `E2E_PHYSIO_EMAIL/_PASSWORD` for staging accounts.
3. The tests use the app's own dev scenario API
   (`POST /api/dev/scenario { scenarioId, reseed:true }` → `{ visitCode }`)
   with the real scenarios `clinician-suggestions` and `physio-suggestions`.
4. Convert each `test.fixme` → `test` and ground the in-cockpit selectors with
   `npx playwright test --ui` against staging. (Do this with the developer.)
