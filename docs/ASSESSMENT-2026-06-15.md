# Treatment Companion — State-of-the-Art Roadmap Assessment

*15 June 2026. Grounded in the repository as it stands today (live Postgres
replay harness + package.json + CI workflows + migrations + governance docs),
benchmarked against a current state-of-the-art app-development checklist, and
written to be handed to a new chat session and to the incoming developer.*

**This supersedes `ASSESSMENT-2026-06.md`.** That earlier version is still
accurate on architecture, but several of its 🔴/🟡 ratings have since been closed
— see the changelog at the end.

---

## 0. How to read this

Candid evaluation, not reassurance. Where the work is strong I say so plainly,
because it is; where there is risk I name it without softening, because the
things that hurt a clinical app are not the things that show up in a demo.

**Rating legend**

- 🟢 strong / on par with good practice
- 🟡 adequate but with real gaps
- 🔴 needs action before real patients
- ⚪ deliberate non-goal or not-applicable (with the reason stated)
- ⛔ blocked on an external party (regulatory, legal, qualified translator)

**What I cannot assess** (flagged, never guessed): runtime behaviour of RLS/auth,
production dashboard configuration (whether backups are on, which secrets/region
are set), rendered UI and real-device behaviour, and anything requiring a legal,
regulatory, or clinical-safety opinion.

---

## 1. Verdict

You have built a substantial, genuinely well-engineered clinical web application
— engineering hygiene well above what is typical for a solo-built project, and
ahead of many funded startups. ~38k lines of TypeScript; 28 tables with row-level
security on every one; a real from-scratch-migration-replay CI pipeline; bilingual
to the bone with parity enforced in CI; and an unusually deep set of
design/accessibility/workflow audits.

**The picture has improved sharply this month.** The single most urgent risk in
the June assessment — running a framework with a known unpatched CVSS-10 RCE — is
**closed** (now on Next.js 16.2.7). The SECURITY DEFINER privileged surface has
been **audited and hardened** (0108 + 0109), error monitoring is **wired and
live in code**, E2E now **runs automatically**, and **Dependabot** is in place.

**What now gates going live with real patients is almost entirely *not* code.**
In order: (1) the EU regulatory and data-protection sign-offs that special-category
health data legally requires are drafted but not finalised; (2) it is unconfirmed
whether the database has automated backups with a *tested* restore; (3) the
clinical Danish is first-pass and needs native review. None of these is an
engineering defect — they are approvals and operational confirmations.

| Engineering dimension | Was (June) | Now | One line |
|---|---|---|---|
| Front-end | 🟢 | 🟢 | Mature patterns, a11y-audited, i18n enforced, motor-impairment-aware UX. |
| Back-end / data model | 🟢 | 🟢 | RLS on all 28 tables, append-only migrations, schema-contract CI. |
| Security — architecture | 🟢 | 🟢 | DB-enforced authorization; SECURITY DEFINER surface now audited + tightened. |
| Security — framework currency | 🔴 | 🟢 | **Now Next.js 16.2.7 + next-intl 4.13.0** — the CVSS-10 RCE and May-2026 advisories are patched. |
| Privacy & regulatory | 🟡→🔴 | ⛔🔴 | Excellent groundwork; nothing signed off; MDR determination still open. **Top gate.** |
| Testing & QA | 🟡 | 🟡 | Good foundation + E2E now auto-runs; coverage still shallow; no device/load testing. |
| CI / CD | 🟢 / 🟡 | 🟢 / 🟡 | Strong CI gate + E2E automation; deploy still manual and not CI-gated. |
| Observability & ops | 🟡 | 🟡→🟢 | **Sentry now live in code** (set the DSN to finish); backups still unconfirmed. |
| Dependency currency | 🟡→🔴 | 🟡 | **Dependabot added; Next current.** A couple of transitive items remain, now tracked. |
| Code quality (lint/review) | — | 🟡 | TypeScript-strict enforced in CI; **no ESLint config**, no human peer review yet. |
| Docs / maintainability | 🟢 | 🟢 | Exceptional for a solo build; real mitigation of bus-factor risk. |

---

## 2. Scorecard against the state-of-the-art checklist

This maps the app to the six-section checklist you referenced. The checklist is
written for consumer mobile apps, so where an item doesn't fit a clinical
web-first product I say so rather than force-fit it.

### 1 · Strategy & Planning

- 🟢 **Validate the idea / prototypes.** The core problem is well-defined and
  narrow: patient-first goal capture, weekly check-ins, descriptive clinic
  summaries for BoNT/ITB spasticity care. The deliberate non-goals (no diagnosis,
  dosing, recommendation, or prediction) are the single best decision in the
  project. Significant UI goes through a mockup-then-approve loop; the face module
  was prototyped before integration.
- 🟡 **SMART goals / KPIs.** Consumer KPIs (retention %, star rating) aren't
  defined — and mostly shouldn't be, for a research tool. But the *research-
  appropriate* success metrics (enrolment, weekly check-in adherence, completion of
  clinician review cycles) aren't written down as measurable targets either.
  *Gap: define a handful of adherence/engagement metrics suited to a study
  deployment, so "is it working" has an answer.*
- 🟢 **Select the build.** Next.js web + a Capacitor Android wrapper, iOS
  deliberately deferred. A pragmatic, decided choice for a small team.
- 🟢 / 🟡 **Map user flows.** Three roles (patient, physician, community
  physiotherapist) are modelled and audited (`all-roles-workflow`,
  `dont-make-me-think`). One-handed / thumb-zone ergonomics are partially
  addressed (the patient surface is polished, the rating control is a deliberate
  tap-scale) but there's no formal thumb-zone pass — and the motor-impaired target
  group makes that more than cosmetic.

### 2 · Modern Design & Accessibility

- ⚪ **Design systems (HIG / Material).** Web-first Tailwind v4 design system. The
  Android app is a Capacitor webview, so it inherits the web UI rather than
  conforming to native iOS/Material components. Reasonable for a clinical web
  product, but worth documenting as a tradeoff: the app won't "feel native," and
  there is no native design-system conformance to point to.
- 🟡 **Accessibility (WCAG 2.2 AA).** Strong instincts and repeated audits (cockpit
  + face module a11y audits; colour-anchored meaning; tap-scale rather than a
  slider for motor impairment). But audits are not a conformance statement. *The
  finish line is an explicit WCAG 2.2 AA pass — contrast ratios, semantic labels,
  focus order, ≥44–48px targets, and a screen-reader walkthrough on real assistive
  tech — recorded as a conformance note.* For a disability-adjacent clinical
  audience this is a safety/quality item, not polish.
- 🟡 **Ergonomics / thumb zones.** As above — partially considered, not formally
  validated.
- ⚪ **Offline support.** A service worker (`public/sw.js`) and a web manifest are
  present, so the app is an installable PWA — not zero offline capability. But
  full offline-first is a *deliberate non-goal*: cached clinical data that's stale
  or diverges from the server is a safety and consistency risk, so the app is
  intentionally connectivity-dependent. *(The service worker's exact caching
  behaviour isn't characterised in this assessment; worth a one-line confirmation
  that it isn't caching patient data offline.)*

### 3 · Architecture & Data Handling

- 🟢 **Robust backend / BaaS.** Supabase (Postgres 16) — exactly the checklist's
  recommendation, used well.
- 🟢 **State management.** No heavyweight global store, and that's correct here:
  the App Router's server components plus local React state (explicit save-only
  forms, dirty-tracking, unsaved-changes guards) fit the app; TanStack Query covers
  server-cache where needed. A Redux/Zustand layer would be over-engineering.
- 🟢 **API integration (secure).** Supabase RPC over PostgREST, with authorization
  enforced at the database via RLS + SECURITY DEFINER functions — and that surface
  was **freshly hardened this month** (search_path pinned on all functions, dev
  functions locked to service_role, anon EXECUTE revoked except the 6 helpers RLS
  needs).
- 🟡 **Code quality (linting + peer review).** Two halves. The strong half:
  TypeScript-strict with `tsc` run in CI on every push/PR, plus a schema-contract
  check and recursive i18n-parity check — that's real, enforced static quality.
  The gap: **there is no ESLint configuration** (none in the repo, none in
  dependencies; Next 16 no longer lints on build), so lint-class issues aren't
  caught, and **there is no human peer review** yet (solo non-developer author; a
  developer is incoming). *Add a flat ESLint config wired into CI, and make
  PR-based review the norm once the developer is on.*

### 4 · Quality Assurance & Testing

- 🟢 **Automated testing / CI-CD.** A standout. Every push and PR runs a `verify`
  job (type-check, i18n parity, 41 unit tests, production build) and a `migrations`
  job (bootstrap a Supabase-like Postgres 16, replay *every* migration from
  scratch, snapshot schema, run the schema-contract check) — no secrets needed.
  The Playwright E2E smoke (login, signed-out redirect, sign-in, a full weekly
  check-in) **now runs automatically** (daily schedule + after each production
  deploy + manual), not just on demand.
- 🔴 **Device-farm testing.** None. No BrowserStack/Sauce-style real-device matrix;
  UI fragmentation across Android devices/screen sizes is untested. I also can't
  verify rendered screens or a physical phone from here. *A modest real-device
  pass (or a hosted device-farm run of the smoke journeys) before real patients.*
- 🟡 **Stress / load testing.** None done. For a bounded research cohort the scaling
  risk is low, but it's unquantified — there's no load profile. *Low priority at
  expected scale; revisit if the cohort grows.*
- 🟡 **Beta / UAT with non-technical users.** Physician (domain-expert) review and
  workflow audits exist, but independent user-acceptance testing with real patients
  is tied to research-ethics approval and hasn't happened formally. Sequence it
  with the regulatory/ethics track.

### 5 · Security & Compliance

- 🟢 **Authentication.** Supabase Auth (JWT-based) — modern and standard.
- 🟢 **Data protection (at rest + in transit).** Encrypted at rest (Supabase) and
  in transit (HTTPS + HSTS); RLS as the authorization spine; pseudonymised CSV
  exports; Sentry configured to scrub PII; deliberately generic (health-data-free)
  push payloads. This is the app's strongest area.
- 🟢 **Permissions (least privilege).** Just tightened: `anon` EXECUTE revoked on
  all but the 6 functions RLS policies require (`0109`), dev functions restricted
  to `service_role` (`0108`), Android runtime permissions minimal.
- ⛔🔴 **Compliance — the gate.** This is EU special-category health data (GDPR
  Article 9), and two regimes apply. **GDPR:** DPIA and privacy notice are written
  but *not signed off*; Data Processing Agreements and a documented sub-processor
  list (Supabase, Vercel, Google/Firebase FCM, Sentry) aren't finalised; EU
  residency per processor, a written retention policy, and a DSAR/erasure process
  need confirming. **MDR:** a physician shipping clinical software needs a
  *documented* determination of whether it's a medical device (MDCG 2019-11 on
  software qualification); the no-diagnosis/dosing design is the right instinct to
  stay out of (or low in) classification, but "we think it isn't a device" isn't a
  documented determination. In Denmark the competent authority is
  Lægemiddelstyrelsen. *This needs qualified regulatory/clinical-safety advice and
  a DPO review before any real patient — it is not an engineering task, and this
  document is not regulatory or legal advice.*

### 6 · Launch & Post-Launch

- 🟡 **App Store Optimization (ASO).** The web app is live on Vercel. The Android
  app has a build + push pipeline (`mobile/`), but Play Store listing assets
  (keywords, screenshots, description) aren't evident. *If distribution is a closed
  research cohort, public ASO may not apply — but the intended distribution model
  (public listing vs. internal/closed testing track) should be decided and written
  down.*
- 🟡 **Store guidelines / SDK & API levels.** Android `targetSdk` / current Play
  policy compliance isn't verified here and should be checked before any Play
  submission. iOS is N/A (deferred).
- 🟡→🟢 **Analytics & monitoring.** **Error/crash monitoring is done** (Sentry,
  enabled in code this session — finishing it is just setting the DSN in Vercel).
  **Product analytics** (behavioural funnels, adherence dashboards) is *not* in
  place — and given the research framing, privacy-respecting product analytics is a
  deliberate decision to make, not an automatic add.
- 🟢 / 🟡 **Continuous feedback.** The development loop is genuinely iterative
  (HANDOVER-driven batches, audits feeding back into the build). What's missing is
  a *user* feedback loop (in-app feedback, structured bug intake from patients/
  clinicians), which is naturally a post-launch item.

---

## 3. Clinical-app dimensions the generic checklist misses

A consumer-app checklist under-weights the things that matter most for a clinical
EU product. These are the real ones:

- ⛔🔴 **Regulatory / MDR determination** — covered in §5; this is *the* gate.
  "App Store guidelines" is not the same as medical-device regulation.
- 🔴 **Backups & disaster recovery.** `OPS.md` documents a backup/restore
  *procedure*, but it's unconfirmed that automated backups / point-in-time recovery
  are actually *on* (Supabase Pro) and that a restore has been *tested* into a
  scratch project at least once. A backup you've never restored is a hope. Patient
  data is the one thing you cannot recreate — this is the highest data-loss risk.
- 🟢 **Research-data governance.** Pseudonymised exports, research-consent capture,
  and a REDCap data-dictionary track — a genuine strength the generic checklist
  doesn't capture.
- 🟡 **Runtime RLS verification.** The policies and SECURITY DEFINER guards read
  correctly and the grants are verified, but cross-patient denial isn't *proven* at
  runtime from here. A small suite of RLS-denial tests (assert patient A cannot
  read patient B; assert a clinician without access is refused) would convert
  "looks right" into "verified" — high value for a clinical app.

---

## 4. Top risks, ranked (current)

1. **Regulatory & data-protection sign-off not done** (⛔🔴, legally gating). EU
   health data with an unsigned DPIA, no finalised DPAs, and no documented MDR
   determination. *Mitigation: qualified regulatory/clinical-safety opinion + DPO
   review before any real patient.* — was #3; now the top gate.
2. **Unverified backups / no tested restore** (🔴). The only failure you cannot
   undo is data loss. *Mitigation: confirm Supabase Pro + PITR, then test one
   restore into a scratch project.*
3. **First-pass clinical Danish** (🟡). *Mitigation: native-Danish review of the
   clinical strings; a qualified translator for legal/privacy text.*
4. **Deploy not gated on CI + manual zip flow** (🟡). Green CI is a signal, not a
   gate — Vercel builds whatever lands on the branch. *Mitigation: protected branch
   requiring the CI check; move to a git-based deploy once the developer is on.*
5. **Shallow test coverage; no device/load testing** (🟡). Critical paths are
   covered; most components and RPCs are not, and no real device has been tested.
   *Mitigation: component tests + a few RLS-denial tests + a real-device smoke pass.*
6. **CSP shipped Report-Only** (🟡). The header that would harden the front end
   isn't enforced and relies on `unsafe-inline`/`unsafe-eval`. *Mitigation: enforce
   it, then plan a nonce-based policy.*

**Closed since June:** unpatched framework (now 16.2.7) · Sentry dormant (now live
in code) · SECURITY DEFINER surface unaudited (now hardened: 0108/0109, FORCE RLS
reviewed and deliberately declined) · E2E manual-only (now auto-runs) · no
dependency-update mechanism (Dependabot added).

---

## 5. Prioritised action plan

### P0 — before any real patient touches the system
- ⛔ **Regulatory + DPO.** Documented MDR determination + DPO sign-off on the DPIA,
  privacy notice, sub-processor DPAs (Supabase/Vercel/Google-FCM/Sentry), EU
  residency, retention, and DSAR. *(Qualified external advice — not engineering.)*
- 🔧 **Backups.** Confirm Supabase Pro + automated backups/PITR are on, then **test
  a restore** into a scratch project (per `OPS.md`).
- 🔧 **Finish Sentry.** Set `NEXT_PUBLIC_SENTRY_DSN` (+ `=production` env) in Vercel
  on an EU-region project, redeploy, confirm with a throwaway error. *(Code is
  already shipped this session.)*
- 🔧 **Native-Danish clinical-string review.**

### P1 — hardening, shortly after
- **Enforce CSP** (off Report-Only; plan nonce-based to drop `unsafe-inline`).
- **Gate Vercel on CI** (protected branch requiring the check) and add a **staging**
  environment.
- **Expand tests:** component tests for patient flows, more E2E journeys (clinician
  approves a suggestion; therapist-note round-trip), and a few **RLS-denial tests**.
- **Add ESLint** (flat config) wired into CI; establish **PR review** with the
  developer.
- **Bring remaining dependencies current** behind CI; let Dependabot's grouped PRs
  carry the cadence (and flip on the two Dependabot settings toggles if not already).
- **Decide the distribution model** (public Play listing + ASO vs. closed testing)
  and verify Android `targetSdk` against current Play policy.

### P2 — product threads (no patient-safety gate; sequence by value)
- Therapist surface Slice 2+ (cockpit consuming `therapist_note`, per-goal cards).
- Face module production integration (prototype + schema decisions done).
- EHR-text reshape; REDCap dictionary reconciliation; per-goal handoff note;
  persistent/recurring therapist access; cross-version goal chart.

---

## 6. Deploy/config items already staged but not yet applied

These are written and verified in the repo but require your manual action
(GitHub Desktop drop, SQL editor, or a Vercel/Supabase dashboard step):

- Run `0108_harden_secdef_functions.sql`, then `0109_tighten_anon_execute.sql`
  in the Supabase SQL editor (0108 before 0109).
- Add `proxy.ts` and **delete** `middleware.ts` (Next 16 rename) if not done.
- Commit `package.json` + `package-lock.json` together + `.github/dependabot.yml`;
  enable the two Dependabot toggles in repo settings.
- Add `instrumentation-client.ts`, **delete** `sentry.client.config.ts`, then the
  Sentry DSN dashboard steps above.

---

## 7. Honest limits of this assessment

- **Runtime behaviour of RLS/auth** — I read the policies and verified the grants
  on a replay harness; I cannot prove from here that production denies cross-patient
  access at runtime. RLS-denial tests would close that.
- **Production configuration** — whether backups are on, which secrets/region are
  set, lives in dashboards I can't see.
- **Rendered UI / real-device behaviour** — I can't see screens or a phone.
- **Legal, regulatory, and clinical-safety determinations** — flagged throughout as
  needing qualified professionals. This is an engineering assessment, not
  regulatory, legal, or medical advice.

---

## Changelog vs `ASSESSMENT-2026-06.md`

| Item | June | Now |
|---|---|---|
| Next.js | 15.1.9 (CVSS-10 RCE unpatched) | **16.2.7** (patched) |
| next-intl | 3.26 | **4.13.0** (open-redirect GHSA-8f24-v5vv-gm5j patched) |
| Dependency updates | none | **Dependabot** (weekly, grouped, CI-checked) |
| Sentry | wired but dormant | **live in code** (`instrumentation-client.ts` fix; set DSN to finish) |
| SECURITY DEFINER audit | not done | **done** — `0108` (search_path + dev lockdown), `0109` (anon least-privilege) |
| FORCE RLS | flagged as a gap | **reviewed and deliberately not enabled** (wrong tool here; rationale in the audit doc) |
| E2E | manual-trigger only | **auto-runs** (daily + on deploy + manual) |
| Top risk | unpatched framework | **regulatory sign-off** (framework risk closed) |
