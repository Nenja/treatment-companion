# Treatment Companion — Roadmap (living doc)

_Last updated: 2026-06-30._

This is the **living** forward plan. `HANDOVER.md` holds history/architecture;
this file holds what's next; `OPS.md` holds run-time operations. When the dated
`ASSESSMENT-*.md` snapshots disagree with this file, this file is newer.

**Where we are:** v1 is feature-complete and in **pilot preparation**. As of
2026-06-30 we are **freezing v1 features** — the only work that lands on v1 now
is the remaining pilot gates and bug-fixes. New capability (wearables activation,
pain mapping) is **v2.0**.

Ownership tags: **you** (dashboard / clinical / decision) · **dev** (incoming
developer) · **external** (qualified professional — DPO, native-Danish clinician).

---

## Standing rules (unchanged)

- **Migrations go to staging first**, tested on the staging Preview URL, then
  production, then `main`.
- **Production deploys only on green CI** (deploy-on-green). Risky work to the
  `staging` branch / Preview first.
- **Run `supabase/checks/verify_security_invariants.sql` after every migration.**
  It catches the forgotten-revoke / NULL-propagation class on day one.
- **One source of truth:** `HANDOVER.md` (history) · this file (next) · `OPS.md`
  (ops).

---

## v1.0 — Pilot release  ·  FEATURE FREEZE

### Shipped (the inventory)

**Care-triangle model.** Patient (+caregiver on the patient's device), weekly
**physiotherapist**, treating **clinic**. The product's centre of gravity is the
clinic's consolidated **"since last visit" review-and-plan** view. Direction is
upward (patient/therapist → clinic) plus the clinic's goal discussion with the
patient; the one sanctioned downward channel is the physician→therapist handoff
note. No clinic→patient messaging (intentional).

- **Goals** — suggestion → clinician-approval → shared goal; goal **versioning /
  lineage** (recalibrate at a visit, frozen prior versions, per-goal history,
  link/merge); **GAS-aware** ratings; optional patient goal video.
- **Weekly check-ins** — patient-reported outcomes vs goals; self/caregiver
  label; **offline-resilient outbox** + durable drafts.
- **Treatment cycles** — cycle start/handling, treatment-session capture, the
  **face-injection map** (blepharospasm/dystonia, copyright-cleared base, free
  marks, PNG export), **ITB / baclofen-pump** dose changes. Modality model
  generalising beyond botulinum toxin.
- **Therapist signals (complete)** — visit-day auto-register, per-goal
  "working-on" + "needs adjustment" + note, GAS-aware therapist rating,
  suggestion-status echo, cycle-agnostic suggestions pre-first-injection.
- **Physician→therapist handoff note** — inter-professional, patient-readable
  care record, RLS-separated.
- **Questionnaire engine + library** — create/assign/due/submit/list/export;
  study-level + patient-level assignment; research export.
- **Studies & membership** — admin studies view, study-patient management.
- **Admin** — accounts, search/filter/pagination, password reset, access
  visibility, audit logging, research export, consent-deletion queue.
- **Roles & access** — patient / clinician / admin / physiotherapist; RLS
  everywhere; **session-gated** clinician access (active session, 1-hour
  timeout).
- **Bilingual** en/da (sv/nb first-pass); localized EHR-text export; read-aloud;
  night mode; text scale.
- **REDCap research sync** — built + proven end-to-end (gated on DPO before real
  data).
- **PWA** — installable; service-worker offline shell + offline page.
- **Push notifications** — web + native.
- **Security / ops** — RLS-denial test suite; SECURITY DEFINER audit + hardening
  (0108/0109/0121–0125); Sentry (EU); Dependabot; CI (type-check / i18n parity /
  build / E2E / RLS); deploy-on-green + staging; **tested** backup/restore;
  saved security-invariants check; CI DB-type regeneration.
- **Wearable ingestion module** — built but **feature-flagged OFF**
  (`NEXT_PUBLIC_WEARABLES_ENABLED`). This is v2's activation target, not a v1
  feature.

### Remaining gates before real patients (no new features — just these)

- ⛔ **Regulatory + DPO sign-off** _(external)_ — MDR intended-purpose written
  down; DPO review of DPIA, privacy notice, sub-processor DPAs (Supabase /
  Vercel / FCM / Sentry), EU residency, retention, DSAR. Done = determination +
  sign-offs on file.
- 🔧 **Apply 0123 → 0124 → 0125** _(you)_ — the security fixes from 2026-06-30
  (webhook-RPC grants, anon revoke, questionnaire guard hardening) on production
  **and** staging, then run `verify_security_invariants.sql` → all PASS.
- 🔧 **Verify the service worker on a preview** _(you)_ — active worker,
  airplane-mode → offline page, push still works — before it reaches patients.
- 🔧 **Native-Danish clinical review** _(external)_ — every first-pass Danish
  string (incl. wearables/offline/login).
- 🔧 **QA the refactored treatment screen** _(you)_ — record / edit / new-cycle /
  save / copy-from-previous, once each without regression.
- 🔧 **REDCap go-live hygiene** _(you)_ — repoint/remove Preview `REDCAP_API_*`
  so staging can't write to the live study; finalise the dictionary before
  "Move to production".

---

## v1.x — hardening (post-pilot, still no new features)

Carried from the old P1 band; sequence after the pilot is live.

- **CSP** — Report-Only → enforced → nonce-based (drop `unsafe-inline/eval`).
- **Branch protection + PRs** — once the developer joins (complicates the
  zip-upload flow today).
- **Test depth** — component tests for patient flows; Tier-2 E2E write-journeys
  against staging.
- **WCAG 2.2 AA + real-device pass** — phone + screen-reader audit.
- **Type-aware ESLint** — layer the typed rule set into CI.
- **2FA / biometric** — TOTP via Supabase MFA; biometric via the Capacitor
  wrapper.
- **SECURITY DEFINER RPC smoke test in CI** — Method-D/CI call of the research
  export + key RPCs (the class that caused the `0111` hotfix).
- **Dependency currency** — keep Dependabot's grouped PRs flowing; review majors
  periodically.

---

## v2.0 — next major release

Two epics. Both are partly scaffolded already; neither ships until its gates
clear.

### Epic A — Wearables activation

The whole stack exists behind the feature flag (observation store, webhook RPCs,
metric allowlist, connect panel, normalize layer). Activating it is:

1. **Choose + onboard an EU aggregator** _(you / external)_ — Terra / Thryve /
   Vitalera / Rook. For a Danish clinical app, EU data residency favours
   **Thryve** (Germany-hosted, excludes non-EU sub-processing) or **Vitalera**
   (EU, FHIR-native, Garmin-clinical track record). Comparison in the
   2026-06-30 session notes.
2. **Reconcile `lib/wearables/aggregator.ts`** _(dev)_ — the single seam: connect
   session, signature scheme, `parseWebhookEvents`, deauthorize, to the chosen
   vendor's live docs. Nothing downstream changes.
3. **Compliance gates** _(external)_ — DPIA update, DPA with the aggregator,
   sub-processor disclosure, transfer basis, DPO sign-off on consent wording.
4. **Flip on** — run `gen:types`, set `NEXT_PUBLIC_WEARABLES_ENABLED=true`.
5. **Constraint:** descriptive only — no thresholds/alerts/auto-titration, to
   stay the safe side of the MDR line. The clinician metric allowlist (built)
   enforces data-minimisation.

Self-testing with your own Garmin is already possible now via the Level-A
harness (`scripts/wearable-webhook-test.console.js` + `wearable-test-setup.sql`)
without choosing a vendor.

### Epic B — Pain mapping / treatments

1. **Pain / body-region mapping** _(you / external + dev)_ — prototype exists
   (`subcutaneous-tracker-anatomical.html`), **shelved pending commissioned
   medical illustrations**. Needs: illustration commission → schema for
   pain/body regions → patient capture + clinician review UX.
2. **Patient-facing muscle names → function language** _(you + dev)_ — parked;
   draft ready (`docs/muscle-function-mapping-DRAFT.md`). Body muscles are free
   text today → needs a structured catalogue. Directly feeds the mapping UX.
3. **Treatment-modality generalisation** _(you + dev)_ — extend beyond botulinum
   toxin + ITB toward surgery and other modalities in the cycle/session model.

---

## Backlog / parking lot (deferred, unscheduled)

Product threads with no patient-safety gate; pull into a release when they earn
priority.

- **Adjustment-request status loop** — give the therapist's "needs adjustment"
  flag a physician-set status echoed back (needs a status column + RPC +
  cross-role UI).
- **Cross-version goal chart** — currently the history modal shows per-version
  rating chips instead.
- **Persistent / recurring therapist access** — touches the consent model.
- **Per-goal handoff note** (vs the current per-cycle) — needs a migration.
- **EHR-text content reshape** — _your call_ on what the note should contain.
- **REDCap dictionary reconciliation** — _decision_: extra check-in fields, PII
  flags, quasi-identifiers — DPO/study-team call before any push is built.
- **Distribution / iOS** — Play listing vs closed testing; iOS build is a later
  decision.

---

## Cross-cutting / ongoing

- **Onboard the incoming developer** — the standing rules, the font-stub build,
  Method-D harness, and `verify_security_invariants.sql` are the things to hand
  over first.
- **Native-Danish review** recurs with every i18n addition — Claude's Danish is
  always first-pass, flagged.

---

## Non-goals (on purpose — not gaps)

- **No clinic→patient messaging channel** — care-team notes are a care-record
  surface, not a chat.
- **No separate caregiver accounts** — caregivers use the patient's own device;
  a per-check-in self/caregiver label records who entered it.
- **No auto-titration / triage / alerts** — the app informs; the clinician
  decides. Automating the decision would change the MDR classification.
- **No product analytics** — deliberate for a patient-facing clinical tool;
  Sentry covers errors, not behaviour.
- **No global state library** — React Query + local state suffices.

_(Superseded: the previous "No offline-first / PWA layer" non-goal — a
deliberately-scoped PWA + check-in outbox shipped in v1. Scope is install +
graceful-offline + never-lose-a-check-in; **not** a fully offline authed app.)_
