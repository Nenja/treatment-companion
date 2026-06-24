# Treatment Companion — Engineering & Roadmap Assessment

*June 2026. Grounded in the repository as it stands today; benchmarked against
current (mid‑2026) best practice. Written to be read by Nikolaj and handed to
the incoming developer.*

---

## 0. How to read this

This is a candid evaluation, not a pat on the back. Where the work is strong I
say so plainly, because it genuinely is; where there is risk I name it without
softening, because the things that can hurt a clinical app are not the things
that show up in a demo.

- **What I assessed:** the actual codebase — `package.json`, the CI workflows,
  `next.config.ts`, the 109 SQL migrations, the middleware, the test suites, and
  the governance docs. Numbers in here are counted from the repo, not recalled.
- **What I could not assess:** anything that lives only in your Supabase/Vercel
  dashboards (whether backups are actually on, whether RLS behaves at runtime as
  the policies intend, what secrets are set), and anything requiring a
  professional opinion I am not qualified to give (legal, regulatory, clinical
  safety). Those are flagged, not guessed.
- **Rating legend:** 🟢 strong / on par with good practice · 🟡 adequate but with
  real gaps · 🔴 needs action before real patients.

---

## 1. Verdict

**You have built a substantial, genuinely well‑engineered clinical web
application — the engineering hygiene is well above what is typical for a
solo‑built project, and ahead of many funded startups.** ~38,000 lines of
TypeScript across 26 routes, 81 components and 60 lib modules; 28 tables with
row‑level security on every one of them; a real CI pipeline; bilingual+ from the
ground up; and an unusually deep set of design/accessibility/workflow audits.

**The risks that gate going live with real patients are almost entirely *not*
about code quality.** They are: (1) the framework is pinned to a version with
known, patched, serious security vulnerabilities; (2) it is unconfirmed whether
the database has tested backups; and (3) the regulatory and data‑protection
sign‑offs that EU patient health data legally requires are drafted but not
finalised. Each is addressed below.

| Dimension | Rating | One line |
|---|---|---|
| Front‑end | 🟢 | Mature patterns, accessibility‑audited, i18n enforced, thoughtful UX. |
| Back‑end / data model | 🟢 | RLS on every table, strong migration discipline, schema‑contract CI. |
| Security (architecture) | 🟢 | Defence‑in‑depth via RLS, solid headers, no framework fingerprint. |
| Security (framework currency) | 🔴 | Next.js 15.1.9 is missing multiple patched CVEs incl. a CVSS‑10 RCE. |
| Privacy & regulatory | 🟡→🔴 | Excellent groundwork; nothing signed off; MDR determination open. |
| Testing & QA | 🟡 | Good foundation (41 unit + 4 E2E), but shallow coverage overall. |
| CI / CD | 🟢 / 🟡 | Strong CI gate; deploy is manual and not gated on CI. |
| Observability & ops | 🟡 | Sentry wired but dormant; backups/restore unconfirmed. |
| Dependency currency | 🟡→🔴 | ~12–18 months stale; Next.js is the security‑critical one. |
| Documentation & maintainability | 🟢 | Exceptional for a solo build; real mitigation of the bus‑factor risk. |

---

## 2. What you've built (architecture & scale)

A **patient‑first clinical app for botulinum‑toxin / ITB spasticity care**, in a
research‑group context, with a deliberate and well‑held design principle: it
captures structured input and produces descriptive summaries, EHR text and
pseudonymised exports, but it does **not** diagnose, dose, recommend or predict.
That restraint is not incidental — it is the single most important design
decision in the whole project, and section 3.4 explains why.

Three deployment surfaces, correctly separated:

- **Web app** — Next.js 15 / React 19 / TypeScript / Tailwind v4, deployed to
  Vercel via GitHub.
- **Native Android** — a Capacitor‑style wrapper (there is an `android-build.yml`
  workflow and a `mobile/` runbook set) with Firebase Cloud Messaging push,
  now live end‑to‑end. iOS is deliberately deferred.
- **Database + edge** — Supabase (Postgres 16); 109 numbered migrations run by
  hand; one edge function (`send-checkin-notifications`) deployed separately and
  triggered by a daily `pg_cron` job.

Scale signals that this is a real product, not a prototype: **1,668 i18n keys**
maintained in parity across four locales (en/da/sv/nb), **129 RLS policies**, and
**134 `SECURITY DEFINER` functions** carrying the controlled‑write logic.

---

## 3. Dimension‑by‑dimension

### 3.1 Front‑end — 🟢

**Strong.** Current stack (React 19, Tailwind v4, the App Router). The codebase
shows mature patterns rather than tutorial defaults: explicit save‑only forms
with dirty‑tracking and unsaved‑changes guards, a deliberate tap‑scale rating
control chosen for the motor‑impaired target group (not a slider), colour‑anchored
meaning to avoid per‑goal label flips, and a "mockup‑then‑approve" discipline for
significant UI. Accessibility has been audited repeatedly (there are dedicated
a11y audits for the cockpit and the face module), and internationalisation is not
bolted on — it is enforced in CI by a recursive key‑set parity check.

**Gaps / state‑of‑the‑art deltas:**
- Translations for sv/nb/da are first‑pass and explicitly flagged for native
  review. For a Danish clinical audience, native‑Danish review of the
  clinical strings is a safety item, not polish (see 3.4).
- The CSP that would harden the front end is shipped **Report‑Only** and relies
  on `'unsafe-inline'`/`'unsafe-eval'` (Next.js hydration). Enforcing it, and
  later moving to a nonce‑based policy, is the front‑end security finish line.

### 3.2 Back‑end / data model — 🟢

**Strong, and the most impressive part of the project.**
- **RLS on every table** (28/28), with 129 granular policies. The data‑flow
  architecture is principled: data flows *upward* (patient/therapist → clinic),
  and sensitive downward channels (physician→therapist notes) live in dedicated
  tables with **no patient SELECT policy** — because Postgres RLS is row‑level,
  not column‑level. That is exactly the right way to model it.
- **Migration discipline** is excellent: 109 numbered, append‑only migrations,
  verified two ways — locally on a throwaway Postgres ("Method D"), and in CI by
  replaying *every* migration from scratch on Postgres 16 on every push/PR.
- **A schema‑contract check** (`check-schema-contract.mjs`) compares the app's
  queries against the resulting schema in CI. This catches the classic
  "UI shipped, migration not run / column renamed" drift before it reaches
  production. Very few teams do this; it is a real asset.

**Gaps / hardening:**
- **No `FORCE ROW LEVEL SECURITY`** anywhere (0/28). RLS is enabled and *is*
  enforced for the `anon`/`authenticated` roles the app actually uses, so this is
  not an open door. But `FORCE` closes the table‑owner bypass as defence in
  depth, and on a clinical database that margin is worth having.
- **134 `SECURITY DEFINER` functions is a large privileged surface.** Each one
  bypasses RLS by design and must (a) pin an explicit `search_path` and
  (b) authorise the caller. Your recent ones do gate correctly
  (`current_clinician_id()`, `clinician_can_access_patient()`), which is the right
  pattern — but a one‑time audit confirming *all* of them set `search_path` and
  check the caller is high‑value, because a single `SECURITY DEFINER` function
  with a mutable `search_path` is a textbook privilege‑escalation vector.

### 3.3 Security — architecture 🟢, framework currency 🔴

**The architecture is good.** Authorisation is enforced at the database (RLS),
not in the application layer, which is the robust choice. The middleware does
only session‑cookie refresh and locale routing — it does **not** make
authorization decisions — so an attacker who bypasses middleware still hits RLS
at the database and gets nothing. Security headers are properly set and enforced:
HSTS, `X‑Frame‑Options: DENY`, `nosniff`, a tight `Referrer‑Policy`, a
`Permissions‑Policy` that restricts camera/mic to same‑origin and opts out of
Topics, and `poweredByHeader: false`. Newly added: a global signed‑out → `/login`
guard. The signed‑out‑redirect, RLS‑first model, and generic (health‑data‑free)
push payloads are all correct instincts.

**The framework version is the problem, and it is urgent.** You are on
**Next.js 15.1.9**. Since that release:
- **CVE‑2025‑66478** (Dec 3, 2025) — a **critical, CVSS 10.0 remote‑code‑execution**
  vulnerability in the React Server Components protocol.
- Dec 11, 2025 — further RSC vulnerabilities; all 13/14/15/16.x users told to
  upgrade immediately. The patched 15.1‑line release is **15.1.11**.
- May 6–7, 2026 — a coordinated release of ~13 advisories (DoS, middleware/proxy
  bypass, SSRF, cache poisoning, XSS). Patched versions: **15.5.18** or
  **16.2.6**. Current stable is **16.2.7**.

  *Sources: nextjs.org/blog security updates (2025‑12‑03, 2025‑12‑11),
  vercel.com/changelog Next.js May 2026 security release.*

Nuance that matters: several of the May advisories specifically affect apps that
use middleware/proxy *for authorization* — which you don't — so that class is
largely defanged by your RLS. **But the CVSS‑10 RCE is framework‑level and not
architecture‑dependent.** For an app that will hold special‑category health data,
running a framework with a known unpatched RCE is not acceptable at go‑live.

**Action:** upgrade to a patched release. Minimum **15.5.18** (stays on the 15
line; small change from 15.1, patches everything above). Better, plan the move to
**16.2.x** (current stable; the main migration work is webpack→Turbopack, which
you likely don't touch). Run the full `verify` + E2E + a click‑through, then
deploy. You are on Vercel (not Netlify), so the Netlify‑specific adapter caveat in
the advisories does not apply, and a WAF cannot block these — upgrading is the
only real fix.

### 3.4 Privacy & regulatory — 🟡 groundwork, 🔴 until signed off

This is the dimension a non‑developer is most likely to under‑weight, and the one
with the least forgiving failure mode. Two separate regimes apply.

**GDPR (this is EU special‑category health data, Article 9).** The groundwork is
genuinely good: a `DPIA.md` and a `PRIVACY_NOTICE_DRAFT.md` exist, the data model
is privacy‑by‑design (upward‑only, pseudonymised exports), and the push payloads
are deliberately generic. What is **not** done, and is legally gating:
- DPO / legal **sign‑off** on the DPIA and the privacy notice (both are drafts).
- **Data Processing Agreements** and a documented sub‑processor list — you now
  have at least Supabase, Vercel, **Google/Firebase (FCM)** and (when enabled)
  Sentry in the chain. FCM in particular puts a US processor in the path; confirm
  the transfer mechanism and that only non‑health payloads reach it (they do, by
  design — document that).
- **EU data residency** confirmed for each processor, a written **retention
  policy**, and a **DSAR / erasure** process.

**Medical Device Regulation (MDR) — the big strategic question.** A physician
building software for clinical use must obtain a **documented determination of
whether the product is a medical device** under EU MDR (the relevant guidance is
MDCG 2019‑11 on qualification/classification of software). Your design choice to
avoid diagnosis, dosing, recommendation and prediction is *exactly* the instinct
that tends to keep software out of — or low in — the device classification, and
it was the right call. But "we think it isn't a device" is not the same as a
documented determination, and if any future feature drifts toward decision
support, the answer can change. In Denmark the competent authority is the Danish
Medicines Agency (Lægemiddelstyrelsen).

**I am not a regulatory or legal adviser, and this assessment is not regulatory
advice.** The action here is not for me or the developer to decide — it is to get
a qualified regulatory/clinical‑safety opinion and a DPO review *before* real
patient data enters the system.

### 3.5 Testing & QA — 🟡

**A real foundation, deliberately shallow.** 41 unit tests (Vitest, pure‑logic
first — check‑in completeness, EHR export text, etc.) plus a 4‑test Playwright E2E
smoke that now passes end‑to‑end against the live site (login, signed‑out
redirect, sign‑in, a full weekly check‑in). The E2E is honest about its limits and
is environment‑gated so it never blocks CI.

**Gaps vs state‑of‑the‑art:**
- Coverage is thin relative to the surface: 7 test files against 81 components and
  134 RPCs. The critical *paths* are covered; most components and most
  `SECURITY DEFINER` functions are not directly tested.
- The highest‑value next increments: component tests (jsdom + Testing Library is
  already installed) for the patient‑facing flows, more E2E journeys (clinician
  approves a suggestion; therapist note round‑trip), and — because the RPCs are
  where the authorization lives — a few pgTAP‑style tests asserting that RLS and
  the `SECURITY DEFINER` guards actually deny cross‑patient access.

### 3.6 CI / CD — CI 🟢, deployment 🟡

**The CI is a standout.** On every push to main and every PR, two jobs run with no
secrets required: a `verify` job (type‑check, i18n parity, unit tests, production
build) and a `migrations` job (bootstrap a Supabase‑like Postgres 16, replay all
migrations from scratch, snapshot the schema, run the schema‑contract check). This
is better than most production teams have.

**The deployment is the weak half.** It is a manual `zip → GitHub Desktop → Vercel
auto‑build` flow, and SQL migrations are run by hand in the Supabase SQL editor.
Two consequences:
- **Vercel deploys are not gated on CI passing.** Green CI is a signal, not a
  gate — Vercel will build whatever lands on the branch. Closing that gap
  (protected branch + require the CI check, or a PR‑merge deploy flow) removes a
  whole class of "deployed something broken" risk.
- **The manual zip flow is bus‑factor‑fragile** and error‑prone (it is why the
  font‑stub workaround and cumulative‑zip discipline exist). Once the developer is
  on, moving to a normal git‑based workflow is a clear upgrade.
- E2E is manual‑trigger only; making it run automatically is already flagged as
  high priority in HANDOVER §8.

### 3.7 Observability & operations — 🟡

- **Sentry is wired but dormant** (`@sentry/nextjs` present, no DSN set). In
  production that means you are flying blind: a runtime error a patient hits is
  invisible to you. Turning it on (EU project, DSN + env in Vercel, the alert
  rules already documented in `OPS.md`) is low‑effort, high‑value.
- **`OPS.md` is a real operations runbook** — backups/restore procedure, alert
  rules, secrets inventory, rollback, incident checklist, routine cadence. Having
  it at all puts you ahead of most small teams.
- **Backups are unconfirmed and this is the highest data‑loss risk.** The runbook
  describes a test‑restore procedure; what matters is that automated backups /
  point‑in‑time recovery are actually *on* (Supabase Pro) and that a restore has
  been *tested* into a scratch project at least once. A backup you have never
  restored is a hope, not a backup — and patient data is the one thing you cannot
  recreate.

### 3.8 Dependency currency & supply chain — 🟡→🔴

The dependency set is pinned to a coherent but **~12–18‑month‑old snapshot**
(late‑2024 / early‑2025): Next 15.1.9, next‑intl 3.26, supabase‑js 2.46,
react‑query 5.59, Sentry 8.42, TypeScript 5.7. Most are merely behind; **Next.js
is the security‑critical one** (3.3). There is **no automated dependency update
mechanism** (Dependabot/Renovate). For a clinical app maintained by a small team,
a patching cadence is not optional — it is how you avoid being a year behind on
the *next* CVE. Recommendation: adopt Renovate/Dependabot with grouped,
auto‑opened PRs, and let the strong CI vet them.

### 3.9 Documentation & maintainability / bus factor — 🟢

**Exceptional for a solo build, and the main reason the bus‑factor risk is
tolerable.** `HANDOVER.md` as a living single source of truth, `OPS.md`,
`DEPLOY.md`, `DPIA.md`, `PRIVACY_NOTICE_DRAFT.md`, the `mobile/` runbooks, and a
deep `docs/audits/` set (all‑roles workflow, accessibility, i18n parity,
data‑output correctness, the face module from six angles, onboarding, visual
coherence). The honest constraint — that you are a non‑developer and cannot run or
verify code locally — is real, but it is well‑mitigated by this documentation plus
the incoming developer plus the unusually strong CI. The single best thing you can
do for maintainability is keep that CI honest and bring the developer up to speed
on the data‑flow and RLS model first.

---

## 4. Top risks, ranked

1. **Unpatched, vulnerable framework (🔴, time‑sensitive).** Next.js 15.1.9 is
   missing patches including a CVSS‑10 RCE. *Mitigation: upgrade to 15.5.18 (min)
   or 16.2.x.*
2. **Unverified backups / no tested restore (🔴).** The only failure you cannot
   undo is data loss. *Mitigation: Supabase Pro + PITR + one tested restore.*
3. **Regulatory & data‑protection sign‑off not done (🔴, legally gating).** EU
   health data with an unsigned DPIA, no DPAs, and no documented MDR
   determination. *Mitigation: qualified regulatory/clinical‑safety opinion + DPO
   review before any real patient.*
4. **Production blindness (🟡).** Sentry dormant. *Mitigation: set the DSN + alert
   rules.*
5. **SECURITY DEFINER surface not fully audited (🟡).** 134 privileged functions.
   *Mitigation: confirm `search_path` + caller checks on all; add `FORCE` RLS.*
6. **Deploy not gated on CI + manual zip flow (🟡).** *Mitigation: protected branch
   requiring CI; move to git‑based deploys once the developer is on.*
7. **First‑pass clinical Danish (🟡).** *Mitigation: native‑Danish review of
   clinical strings; qualified translator for legal/privacy text.*

---

## 5. Prioritised action plan

### P0 — before any real patient touches the system
- **Upgrade Next.js** to a patched release (15.5.18 min; plan 16.2.x). Verify +
  E2E + click‑through + deploy.
- **Backups:** confirm Supabase Pro + automated backups/PITR, then **test a
  restore** into a scratch project (per `OPS.md`).
- **Regulatory + DPO:** obtain a documented MDR determination and a DPO sign‑off
  on the DPIA, the privacy notice, sub‑processor DPAs (Supabase/Vercel/Google‑FCM/
  Sentry), EU residency, retention, and DSAR. *(Qualified external advice — not an
  engineering task.)*
- **Turn on Sentry** (EU project, DSN, the four documented alert rules).
- **Native‑Danish clinical‑string review.**

### P1 — hardening, shortly after
- **Enforce CSP** (off Report‑Only; plan nonce‑based to drop `unsafe-inline`).
- **Add `FORCE` RLS** and **audit all SECURITY DEFINER functions** for explicit
  `search_path` + caller authorization.
- **Make the E2E run automatically** (already flagged §8) and **expand tests**
  (component + more E2E journeys + a few RLS‑denial tests).
- **Gate Vercel on CI** (protected branch) and add a **staging** environment.
- **Adopt Renovate/Dependabot** for a real patching cadence; bring the rest of the
  dependencies current behind CI.

### P2 — product threads (no patient‑safety gate; sequence by value)
- Therapist surface Slice 2+ (cockpit consuming `therapist_note`, per‑goal cards).
- Face module production integration (prototype + schema decisions done).
- EHR‑text content/structure reshape; REDCap dictionary reconciliation; per‑goal
  handoff note; persistent/recurring therapist access; cross‑version goal chart.

---

## 6. What I could not assess (honest limits)

- **Runtime behaviour of RLS/auth.** I read the policies and functions; I cannot
  prove from here that production denies cross‑patient access as intended. A short
  suite of RLS‑denial tests would convert that from "looks right" to "verified."
- **Production configuration.** Whether backups are on, which env/secrets are set,
  whether the EU Supabase region is used — all live in dashboards I can't see.
- **Rendered UI / real‑device behaviour.** I can't see screens or a phone.
- **Legal, regulatory and clinical‑safety determinations.** Flagged throughout as
  needing qualified professionals. This document is an engineering assessment, not
  regulatory, legal, or medical advice.
