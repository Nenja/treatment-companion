# Treatment Companion — Roadmap & Hardening Backlog (living doc)

_Last updated: 2026-06-16._

This is the **living** forward plan. The dated `ASSESSMENT-2026-06-15.md` is the
point-in-time snapshot it grew out of; when the two disagree, this file is newer.
Priorities use the same bands as the assessment: **P0** = before any real patient,
**P1** = hardening shortly after, **P2** = product threads (no safety gate).

Each item notes **who** owns it — _you_ (dashboard / clinical / decision), _dev_
(the incoming developer), or _external_ (qualified professional) — and what
**"done"** looks like.

---

## Standing rules

- **Migrations go to staging first.** Run a new migration in the **staging**
  Supabase project, test it on the staging Preview URL, _then_ run it in
  production and upload to `main`. This is the whole reason staging exists.
- **Production deploys only on green CI.** Pushing to `main` no longer
  auto-builds production; the GitHub Action deploys after CI passes
  (deploy-on-green). Risky work goes to the `staging` branch (Preview) first.
- **One source of truth.** `HANDOVER.md` for history/architecture; this file for
  what's next; `OPS.md` for run-time operations.

---

## Done this session (2026-06-16)

- ✅ **Deploy-on-green** — Vercel production auto-build suppressed via the Ignored
  Build Step (`if production then skip`); production ships through the GitHub
  Action only after CI is green. _(Final confirmation: the deploy-after-CI test
  run, + the three GitHub secrets if not yet added.)_ **Follow-up fix
  (2026-06-16):** the post-deploy **E2E** trigger was keyed off Vercel's
  "successful Production deploy" event, which deploy-on-green stops emitting (the
  Ignored Build Step cancels Vercel's own prod build) — so the E2E job started
  skipping. `e2e.yml` now triggers off the **Deploy** workflow succeeding
  (`workflow_run`) instead; schedule + manual runs were never affected.
- ✅ **Staging environment** — separate staging Supabase project (schema loaded
  from the 5 ordered SQL blocks) + Vercel Preview env vars pointed at it +
  a `staging` branch. Confirmed isolated from production.
- ✅ **ESLint** — flat config (ESLint 9 + typescript-eslint + react-hooks +
  Next plugin) wired into `verify` and CI; 0 errors baseline.
- ✅ **React hooks crash risk fixed** — the conditional-hooks bug on the clinician
  treatment screen refactored away; `rules-of-hooks` now a hard error repo-wide.
  _(Open: your QA pass on that screen — see P0.)_
- ✅ **Runtime RLS-denial tests** in CI (cross-patient isolation, clinician-session
  gating + staleness, anon denial, the 0096 care-team-note boundary, admin-only
  study tables).
- ✅ **Care-team-notes decision recorded** — patient-readable is intended (the
  patient's own care record); product was already consistent, docs corrected.

---

## P0 — before any real patient touches the system

- ⛔ **Regulatory + DPO sign-off** _(external)_. MDR determination + DPO review of
  the DPIA, privacy notice, sub-processor DPAs (Supabase / Vercel / Google-FCM /
  Sentry), EU residency, retention, and DSAR. **Done =** documented determination
  and sign-offs on file. _Qualified advice, not engineering._
- 🔧 **Tested backup/restore** _(you)_. Confirm Supabase **Pro + automated
  backups / PITR** are on, then **restore once into a scratch project** per
  `OPS.md §2`. **Done =** a restore you've actually performed and verified. _This
  is the highest data-loss risk and the single most important open item._
- 🔧 **Finish Sentry** _(you)_. Set `NEXT_PUBLIC_SENTRY_DSN` (+ `=production`
  environment) in Vercel on an EU-region project; confirm with a throwaway error.
  **Done =** a test error visible in Sentry. _(Code already shipped.)_
- 🔧 **Native-Danish clinical-string review** _(you / clinical)_. The Danish
  strings are a first pass flagged for native review. **Done =** a clinician
  fluent in Danish has read the patient- and clinician-facing clinical strings.
- 🔧 **QA the refactored treatment screen** _(you)_. Load it for real: record /
  edit / new-cycle / save / copy-from-previous / rail scroll-highlight / total
  auto-fill. **Done =** each path exercised once without regression.

---

## P1 — hardening, shortly after

- **Enforce CSP** _(dev)_. It currently ships **Report-Only** and leans on
  `unsafe-inline` / `unsafe-eval`. Watch the reports, then flip to enforce, then
  plan a **nonce-based** policy to drop the unsafe directives. **Done =**
  enforced CSP with no console breakage on the main flows.
- **Branch protection + PRs** _(dev)_. A protected `main` requiring the CI check,
  with review. Deferred because it complicates the zip-upload flow — a
  developer-era change. **Done =** `main` is protected and changes land via PR.
- **Expand test depth** _(dev)_. Component tests for the patient flows; finish the
  **Tier-2 E2E** write-journeys (clinician approves a suggestion; therapist-note
  round-trip) against **staging** (set `ENABLE_DEV_TOOLS` on Preview + staging
  creds, convert the `test.fixme` scaffolds, ground selectors with
  `playwright test --ui`). **Done =** Tier-2 journeys run green against staging.
- **WCAG 2.2 AA + real-device pass** _(dev / you)_. No phone or screen-reader pass
  has been done. **Done =** an accessibility audit + a real Android device smoke
  test, issues triaged.
- **Type-aware ESLint** _(dev)_. The current lint is non-type-checked (faster).
  A developer can layer on the typed rule set for deeper correctness. **Done =**
  typed rules enabled in CI with a clean (or triaged) baseline.
- **2FA / biometric** _(dev)_. Specced and deferred; TOTP via Supabase MFA is the
  planned route, biometric via the Capacitor wrapper. **Done =** opt-in 2FA
  available for clinician accounts.
- **Dependency currency** _(dev)_. Versions are modern and pinned; Dependabot is
  the tracking mechanism — keep its grouped weekly PRs flowing through CI, and
  periodically review the majors (Next, React, Supabase, Sentry). **Done =**
  updates land on a regular cadence, not in a big-bang.
- **Distribution model** _(you / dev)_. Decide public Play listing + ASO vs.
  closed testing; verify Android `targetSdk` against current Play policy.
  **Done =** a chosen channel and a compliant build target.

---

## P2 — product threads (sequence by value; no patient-safety gate)

- **Therapist surface Slice 2+** — cockpit consuming `therapist_note`, per-goal
  cards, the engagement layer.
- **Face module production integration** — prototype + schema decisions done;
  resume the integration into the production app.
- **Smaller threads** — EHR-text reshape; REDCap dictionary reconciliation;
  per-goal handoff note; persistent/recurring therapist access (touches the
  consent model); cross-version goal chart.

---

## Explicit non-goals (absent on purpose — not gaps)

- **No global state library** (Redux/Zustand) — React Query + local state is
  sufficient for this app's shape.
- **No offline-first / PWA layer** — the clinical flows assume connectivity.
- **No product analytics** — a deliberate choice for a patient-facing clinical
  tool; Sentry covers errors, not behavioural tracking.
- **iOS build deferred** — the Capacitor wrapper targets Android first; iOS is a
  later decision, not an omission.
- **No clinic→patient messaging channel** — intentional; the care-team notes are
  a care-record surface, not a chat.
