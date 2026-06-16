# Transfer prompt — paste this into a new chat

> **What this is.** Paste the text below (everything under the line) into a
> fresh chat, and attach the latest handoff zip. It's the short kickoff that
> orients a new Claude instance in one shot. The deep reference is
> `HANDOVER.md` inside the zip — this prompt just points at it and encodes the
> rules, the working style, and where we are.
>
> **Keep this current.** At the end of *every* delivery, update the two
> volatile sections (**“Where we are”** and **“What’s likely next”**) to match
> `HANDOVER.md` §7/§8, and bump the build tag + migration number. The rest is
> stable and rarely changes.

---

You're picking up work on **Treatment Companion** with me. **First, read
`HANDOVER.md` in the attached zip — it's the single source of truth.** Then
confirm where we are and wait for my direction. Don't restate the whole
handover back to me; just tell me the current build/migration and that you're
ready.

**Who I am / the project.** I'm a physician in Denmark (non-developer). The app
is a patient-first clinical web app for adults on botulinum-toxin spasticity
treatment, with an intrathecal-baclofen parallel therapy and a face-muscle
dosing module. Patients suggest goals; clinicians approve them; patients do
weekly check-ins; the app produces descriptive summaries, EHR text and
pseudonymised CSV exports. It deliberately **does not diagnose, dose, recommend
or predict**. Direction of information is primarily **upward** (patient/therapist
→ clinic); the only sanctioned downward channel is the physician→therapist
handoff note (inter-professional). Don't build a
clinic→patient messaging channel.

**My setup (this shapes how you deliver).**
- Stack: Next.js 16.2.7 / next-intl 4.13.0 / React 19 / TypeScript / Tailwind v4 / Supabase (Postgres 16).
- Live: `https://treatment-companion.vercel.app` · GitHub:
  `github.com/Nenja/treatment-companion`.
- I'm on **Windows + Firefox** and **cannot run code locally.** I deploy by
  **uploading a zip to GitHub** (Vercel auto-builds), and I run **SQL migrations
  by hand in the Supabase SQL editor**. So everything you give me has to work
  through that pipeline.

**Non-negotiable delivery workflow** (details in `HANDOVER.md` §2):
1. **One clean repo zip per delivery**, with a **new filename** and a root
   **`BUILD.txt`** (what changed, which migration to run, what I must QA). The
   zip excludes `node_modules` and `.next`.
2. **Font-stub build before shipping:** the two `next/font/google` fonts in
   `app/[locale]/layout.tsx` can't fetch in the sandbox, so stub them, run
   `rm -rf .next && NEXT_TELEMETRY_DISABLED=1 npx next build`, confirm it
   compiles, then **restore `layout.tsx` byte-for-byte** and confirm **zero
   `BUILD-STUB` remnants**. Also run `npx tsc --noEmit` clean.
3. **New migrations:** numbered next in `supabase/migrations/`, **and** dropped
   as a **standalone `.sql` in outputs** so I can paste it into Supabase. Only
   for *new* migrations — never re-deliver old ones. For any non-trivial
   migration (RPC, constraint, RLS), **verify it on a throwaway Postgres**
   first (`HANDOVER.md` §5.12 D) and say so.
4. **i18n parity:** every user-facing string gets **en + da** keys, kept at
   full parity. Danish is your first pass, flagged as pending native review.
   Watch the known blind spot: strings hidden in ternaries / error messages.
5. **Be honest about what's unverified.** You can't see rendered screens, real
   devices, or live RLS here. Mark those **“please QA”** in `BUILD.txt` rather
   than claiming they're done. Don't over-caution about a dev build with no
   real patient data, though — I'll push back if you do.
6. **Update `HANDOVER.md`, `BUILD.txt`, and this `TRANSFER_PROMPT.md`** at the
   end of every delivery. `HANDOVER.md` is the living source of truth.

**How I work.** Short, precise directives — “go”, “confirmed”, “keep going”.
I want action without long preamble. Deliver in batches. I catch clinical /
anatomical errors, so get those right (sides, muscle names, etc.). When a
design debate runs long and I say **“move on”**, that means *keep building*,
not skip the work. Reusable audit/review prompts are welcome.

---

**Where we are** *(update each delivery)*
- **Stack is current.** Next.js **16.2.7**, next-intl **4.13.0**, React 19, Supabase (Postgres 16). Migrations **0001-0110**. Current assessment: **`docs/ASSESSMENT-2026-06-15.md`** (read it for the roadmap; supersedes `ASSESSMENT-2026-06.md`).
- **Latest delivery - `studies-and-fixes-1` (in the repo; RUN `0110`):** migration `0110_studies.sql` (study + study_membership + admin-gated RPCs, study membership orthogonal to consent - export unchanged) with an admin Studies / Study-patients view; plus four patient-surface fixes - profile language now persists + locale-aware Back, login honours browser language (`localeDetection: true`), DOB picker un-squished, account-menu nav works from the check-in wizard. 0110 Method-D verified (15 cases); font-stub build + tsc clean; i18n parity en/da/sv/nb. Detail in `HANDOVER.md` §7. **Apply: run `0110` in the Supabase SQL editor; deploy the zip to Vercel. QA list in `BUILD.txt`.** Biometric/2FA specced + deferred.
- **Then `rls-denial-tests-1` (in the repo; NO SQL to run):** a runtime RLS-denial suite now runs in CI (real policies, impersonatable `auth.uid()`) - cross-patient isolation, clinician-session gating incl. the 1-hour staleness cutoff, anonymous denial, the 0096 care-team-note boundary, admin-only `study` tables; positive + negative controls. Test infra + CI only, no app/migration change. **It surfaced a spec divergence: care-team notes (handoff + therapist notes) are patient-readable for the patient's OWN rows since migration `0096` (GDPR right-of-access)** - contradicts the "never patient-visible" line that used to be here and in §5.13 (now corrected). **Decision pending for Nikolaj:** confirm patient-readable is intended, or make author-private notes a product change. Detail in `HANDOVER.md` §5.14 + §7.
- **Then `staging-ci-gate-1` (in the repo; NO SQL to run):** deploy-on-green workflow (`.github/workflows/deploy.yml`, **inert** until Vercel secrets are set) that ships production only after CI passes - a real gate even with direct-to-main commits - plus `docs/STAGING-AND-CI-GATE.md` for activating it and standing up a staging Supabase + Vercel Preview env. Docs + one inert workflow only; no app/migration change. **Nikolaj's actions are dashboard-side:** disable Vercel auto-deploy for `main`, add 3 secrets (VERCEL_TOKEN/ORG_ID/PROJECT_ID), create a staging Supabase project (then migrate-staging-first). Closes the "deploy not gated on CI + no staging" P1 risk once activated.
- **Then `e2e-coverage-1` (in the repo; NO SQL to run):** `e2e/clinician.spec.ts`. Tier 1 (runnable, read-only): clinician signed-out redirects + sign-in, self-skip without `E2E_CLINICIAN_EMAIL`/`_PASSWORD`; `e2e.yml` passes them through. Tier 2 (`test.fixme`, staging-only): approve-a-suggestion + therapist-note round-trip - grounded scaffolds using the dev scenario API (`clinician-suggestions`/`physio-suggestions`), left as fixme rather than faked green since they couldn't be run here. Both specs typecheck clean; no app/migration change. **Finish Tier 2 against staging with the developer** (steps in `e2e/README.md`). Detail in `HANDOVER.md` §7.
- **Then `eslint-ci-1` (in the repo; NO SQL to run):** ESLint 9 flat config (`eslint.config.mjs`) + `lint` script + CI Lint step - the last P1 code-quality gap. Green baseline (0 errors, ~79 warnings; correctness rules error, stylistic rules warn). devDeps + lockfile updated; build/tsc/lint all green. **Surfaced a real rules-of-hooks violation** in `app/[locale]/clinician/treatment/page.tsx` (two effects after the loading/error early-returns - latent "more hooks than previous render" crash on that core screen); scoped to a tracked warning for that file (hard error elsewhere). **Recommended next task: the child-component-extraction refactor to fix it properly.** Detail in `HANDOVER.md` §7.
- **This session's deliveries - in the repo AND now applied live (2026-06-15):** next16-upgrade-1 (Next 16.2.7, closes the CVSS-10 RCE); secdef-harden-1 (`0108`: `search_path` pinned on every SECURITY DEFINER fn, dev-seed fns locked to `service_role`); e2e-autorun-1 (Playwright smoke runs daily + after each prod deploy + manual); deps-secfix-1 (next-intl -> 4.13.0 security fix + Dependabot); sentry-enable-1 (error monitoring live; browser init = `instrumentation-client.ts`); audit-followups-1 (`0109`: revokes `anon` EXECUTE except the 6 RLS-helper fns; FORCE RLS reviewed and deliberately NOT enabled). Full detail in `HANDOVER.md` §7.
- **Applied live by Nikolaj:** `0108` + `0109` run in Supabase; Sentry DSN set in Vercel; deps committed + Dependabot toggles on; the renamed-away `middleware.ts` / `sentry.client.config.ts` deleted. (Worth a one-time eyeball if not done: load logged-out + run a visit-code/clinician-session flow to confirm `0109` raises no `permission denied for function`.)
- **THE ONE REMAINING ITEM IN NIKOLAJ'S CONTROL: backups.** Confirm Supabase Pro + PITR is on and **test one restore** (procedure in `OPS.md`). Highest data-loss risk; not yet done.
- **Process note (important):** trust the repo/filesystem over any carried-over summary. In a prior session a stale summary mislabelled finished work as still-pending; the files are the source of truth.

**What's likely next** *(from `docs/ASSESSMENT-2026-06-15.md`)*
- **P0 - before any real patient:** **backups + a tested restore** (the one ops item left); then the external gates - regulatory + DPO sign-off (MDR determination + DPIA / privacy notice / sub-processor DPAs, qualified external advice) and native-Danish review of the clinical strings.
- **P1 - hardening:** enforce CSP (currently Report-Only; then nonce-based); gate Vercel on CI (protected branch) + a staging environment; expand tests (component + more E2E + a few RLS-denial tests); add an ESLint config wired into CI + PR review once the developer is on; bring remaining dependencies current behind Dependabot/CI.
- **P2 - product threads (no patient-safety gate):** therapist surface Slice 2+ (cockpit consuming `therapist_note`, per-goal cards); face module production integration; EHR-text reshape; REDCap dictionary reconciliation; per-goal handoff note; persistent/recurring therapist access; cross-version goal chart.

**Your first reply:** confirm you've read `HANDOVER.md`, state the current build
+ migration in a line or two, and either wait for my “go” or ask the one thing
you need to start.
