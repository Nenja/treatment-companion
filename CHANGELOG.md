# Changelog

All notable changes to **Treatment Companion** are recorded here. The format is
based on [Keep a Changelog](https://keepachangelog.com/); this project uses
[Semantic Versioning](https://semver.org/).

The version is shown in-app on the login and profile screens (from
`lib/version.ts`). The detailed engineering delivery log lives in `HANDOVER.md`
§7; this file is the human-readable summary by version.

---

## [1.0.0] — 2026-06-17 — Pilot test baseline

First feature-complete build placed under test. **Test data only — no real
patients.** Database migrations `0001`–`0111`. This is the version locked for
the testing phase; tag it `v1.0.0` in GitHub.

### Added — core capabilities
- **Patient app:** onboarding wizard, patient-suggested goals, weekly check-ins,
  catch-up prompts, progress surfaces. Information flows upward to the clinic.
- **Clinician app:** goal approval & rating configuration (GAS-aware, NRS
  anchors), treatment cycles, standard + face muscle-dosing module (free
  placement on cleared line-art, dose quick-picks, PNG export), treatment
  history, EHR-text export, and a physician→therapist handoff note (the one
  sanctioned downward channel).
- **Therapist (physiotherapist) surface:** visit-signal capture, goal ratings,
  progress view; cycle-agnostic suggestions before the first injection.
- **Goal versioning:** frozen versioned goals with continuous lineage identity,
  recalibrate flow, per-goal history timeline, and goal-lineage linking.
- **Admin:** account management (create / edit / activate / reset), active-access
  monitoring, studies & study membership, pseudonymised research export, and a
  consent pending-deletion queue — organised into an overview with a floating
  side menu and collapsible sections.
- **Research pipeline:** consent-gated pseudonymised dataset export and REDCap
  sync (manual “Sync now” + weekly cron), proven end-to-end against test data.
- **Internationalisation:** English and Danish live; Swedish and Norwegian
  first-pass (pending native clinical review).
- **Security & ops:** row-level security throughout, deploy-on-green CI with a
  staging environment, Sentry error monitoring (EU region), scheduled Playwright
  smoke tests, Dependabot. Enforced CSP + HSTS + `X-Frame-Options`; `noindex`
  (robots.txt + `X-Robots-Tag`) so the clinical app isn't search-indexed;
  `/api/health` liveness endpoint for uptime monitoring; in-memory rate limiting
  on sensitive API routes (`redcap-sync`, `create-account`, `reset-password`);
  `eslint-plugin-jsx-a11y` surfacing accessibility issues in CI.

### Changed / Fixed — final polish before lock
- **Login language switcher** now switches back to English correctly (sets the
  `NEXT_LOCALE` cookie that locale detection reads).
- **REDCap sync result** reports REDCap’s confirmed record count and surfaces
  real import errors, instead of reporting built-row counts and swallowing
  errors.
- **Admin page** restructured with a floating overview menu and collapsible
  sections (Accounts and Create account collapsed by default).
- **Localisation fixes:** the “Back” label, three create-account field helpers,
  and the login privacy link are now translated.
- **Deploy hardening:** fixed the deploy-on-green double-deploy and the blank
  public-env 500s by injecting build-time public env from CI secrets.
- **Research export RPC** fixed to read guidance from the treatment session
  (migration `0111`), resolving the live sync error.

### Known limitations at this baseline
- **Typed database layer scaffolded but not wired** — generated Supabase types
  (`lib/database.types.ts`) not yet generated/applied, so queries aren't schema-
  checked at compile time. CLI/dev step — see `docs/DB-TYPES.md`.
- **Auth emails on Supabase default SMTP** — rate-limited/unbranded; configure a
  real provider before real users (`OPS.md` go-live checklist).
- Rate limiting is **in-memory** (per serverless instance) — adequate for the
  pilot; back with a shared store (KV/Upstash) for strict global limits.
- REDCap *analysis-readiness* (clean joins / coded-field labels on export) not
  yet dry-run verified; cron sync scheduled but not yet observed firing.
- sv/nb (and da first-pass) strings await native clinical review.
- External gates outstanding before real patients: tested backup restore,
  regulatory (MDR) determination, DPIA, sub-processor DPAs.

---

*Earlier work (the pre-1.0 build-by-build engineering log) is in `HANDOVER.md` §7.*
