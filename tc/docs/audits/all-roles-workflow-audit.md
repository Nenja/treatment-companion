# All-roles workflow audit — patient · physician · therapist

**Scenario walked.** Three people are handed this app and told to "just use it":
an adult with spasticity (the **patient**), the **physician** who injects them
in clinic, and the **community physiotherapist** (the **therapist**) who sees
them weekly between injections. I sat in each chair and tried to go end to end.

**Method & honesty note.** Traced from the actual routes, copy and flow as of
build `physician-therapist-note` (migration 0088): the clinician surfaces
(`clinician/page` unlock, `clinician/patient`, `clinician/treatment`,
`clinician/suggestion`, `clinician/observations`, `clinician/admin`), the
therapist surfaces (`physio/page`, `physio/patient`, `physio/progress`), and the
patient surfaces. I **cannot** run the app, sign in, see rendered pixels, or
exercise live RLS — every claim is about *structure and wording*, so treat
interaction notes as "check this," not "confirmed broken."

The **patient** and **therapist** already have deep dedicated audits
(`patient-workflow-audit.md`, `therapist-workflow-audit.md`). This document
does three things those don't: (1) gives the **physician/clinician** its first
full workflow audit, (2) **re-states** the patient/therapist journeys at
current state — noting where prior High findings are now resolved by shipped
work — rather than re-deriving them, and (3) audits the **cross-role seams**,
where the roles hand off to each other and where this app's whole value lives.

Findings tagged **[High] / [Med] / [Low]** by how much they hurt a real user.

---

## The headline finding first

**[High] One screen action by the physician silently unblocks both other roles —
and nothing tells anyone that.**

"Start a new treatment cycle" on `clinician/patient` is the keystone. Until the
physician starts a cycle:

- the patient's weekly check-ins and goal-rating prompts don't exist;
- the therapist's *"Report progress"* is gated (`noActiveCycle`,
  `noCycleHint`: "Progress reporting and suggestions become available once the
  patient has an active treatment cycle.").

The dependency is real and correct — but it's **invisible from all three
chairs**. The patient is told "your clinic will set up your first cycle"; the
therapist is told to wait; and the physician's start-cycle button
(`startNewCycleHint`: "Begin here at each injection visit.") never says *"this
is what turns the patient's and therapist's app on."* So the one person who can
unblock the workflow isn't told that they're the unblocker, and the two people
waiting can't tell whether they're stuck by design or by error.

Everything else below is smaller. This is the seam to make legible first.

---

# Role 1 — The physician (no audit existed before this one)

**Persona walk.** I'm the treating physician. A patient is in front of me. I
open the app to record today's injection, review what they want to work on, and
leave a note for their physio.

### Step 1 — Landing cold on `clinician/page` ("Enter visit code")

**What works**
- Clean single purpose: a big monospace code field, `ABC-DEF` placeholder,
  `autoCapitalize="characters"`, friendly mapped error (`errorInvalid`: "That
  code isn't valid. Ask the patient to generate a new one.").
- **Multi-patient continuity is genuinely good:** *Open patients* (switch back
  without a code) and *Seen earlier today* (reopen without a new code) rows mean
  a busy clinic day doesn't mean re-entering codes all morning.
- Timeout handling is careful — a deliberate `ended=1` end is distinguished
  from an inactivity `timeout=1`, so a clinician who *chose* to end isn't told
  they "timed out."

**Friction / gaps**
- **[Med] A first-time physician gets no orientation.** The onboarding tour is
  mounted `replayOnly` (`OnboardingWizard role="clinician" replayOnly`), which
  returns null unless explicitly replayed from the account menu. So a clinician
  dropped onto "Enter visit code" on day one sees a code box and nothing else —
  no "here's how a visit goes" map. Same is true for the therapist (also
  `replayOnly`). Consider a one-time auto-show for professionals' first session.
- **[Low/Med] Session-duration copy is inconsistent across the two pro roles.**
  The therapist unlock says, plainly, "Entering it gives you access for one
  hour." The physician unlock (`clinician.unlock.body`) says nothing about
  duration; the only mention is the inactivity `timeoutBody`. Two professionals,
  one mechanism, two different stories. State the access window on both.

### Step 2 — The cockpit: `clinician/patient` (the 2,200-line page)

**What works**
- The wide layout earns its keep: **context left** (cycle banner, since-last-visit,
  start-cycle, action row: medication / therapist-input / training / wearable /
  ITB), **goals right** (the actual work surface), with the look-up tools lifted
  into a header toolbar. Goals-first is the right priority.
- Empty states are calm and specific, not scary: `activeGoalsEmpty` "No active
  goals yet.", `physioGoalsEmpty` "No goal suggestions from the therapist this
  cycle.", `trainingPanelEmpty` "No check-ins yet, so there's no training to
  show."
- `startNewCycle` dialog body is honest about consequence: "This closes the
  current cycle and creates a new one with the treatment date you choose. The
  current cycle's data is preserved." — good for a destructive-sounding action.

**Friction / gaps**
- **[Med] First-run density with no labelled map.** Five action-row panels plus
  two columns plus a header toolbar is a lot of surface to meet cold. Without
  the auto-tour (above), a new physician has to discover that "therapist input,"
  "wearable," and "ITB" are panels behind icons. The icons + live counts help,
  but a first-session legend would cut the discovery cost.
- **[Med] The start-cycle keystone isn't framed as the patient/therapist
  unblocker** (the headline finding). One line — "this is what activates the
  patient's weekly check-ins" — closes the gap.
- **[Low] "Physician" vs "clinician" vs "the treating clinic" drift.** Internals
  and routes say `clinician`; admin filters say "Physicians"; the therapist card
  says "Note from the treating clinic." Each is defensible in context, but a
  deliberate glossary keeps the patient-facing/professional-facing line crisp.

### Step 3 — Recording the injection: `clinician/treatment`

**What works**
- Logical order: **Treatment areas** ("Choose at least one.") → **Muscles
  injected** ("One row per muscle.") → **Session notes** → **Note for the
  therapist**.
- The handoff note panel is well-built and **explicitly safe**: `handoffTitle`
  "Note for the therapist", `handoffHint` "Shared with the patient's therapist
  to guide their work between visits. **Not shown to the patient.**",
  `handoffChangedLabel` tri-state "Did you change the treatment this visit?"
  (Adjusted / No change / Not specified), and a real example placeholder
  ("e.g. Reduced calf dose — ease off heavy loading for now."). This is the kind
  of inter-professional copy that builds trust.

**Friction / gaps**
- **[Med — please QA] When does the handoff note actually persist?** It saves
  via `useSetTreatmentHandoff`, separately from the main treatment save (per
  §5.13 / BUILD.txt: "saved after the session"). A physician who types a focus
  note and a flag needs unambiguous "saved" feedback — otherwise the risk is a
  note typed but not committed, the worst failure mode for a downward channel
  that the therapist is now relying on. Verify the save affordance and
  confirmation are obvious, and that closing without saving warns.
- **[Low] `overwriteTitle` / `lockedTitle` edge copy** ("This treatment can no
  longer be edited.", "Overwrite current entries?") is fine, but confirm the
  physician understands *why* a treatment locks (a check-in scored it) at the
  moment they hit the wall — the lock reason isn't in the title.

### Step 4 — Acting on what the patient/therapist raised: `clinician/suggestion`

**What works**
- The **review → act** menu is a thoughtfully complete set: *Approve / Edit and
  approve / Discuss at next visit / Combine with another goal / Not suitable this
  cycle.* It respects that not every suggestion becomes a goal, and gives each
  outcome a name (which is what the therapist's status echo then reads back).
- The approve form's anchor copy is excellent and clinically literate:
  `anchorZero` "What you realistically expect," and the instruction that anchors
  "describe the situation in observable terms — what the patient or carer would
  see." NRS-vs-GAS model picker with direction ("Pick what 'higher' means").

**Friction / gaps**
- **[Med] Authoring a goal mid-visit is heavy.** To approve, the physician
  writes: patient-facing text + SMART version + a weekly NRS question *or* five
  GAS anchors + direction. That's a real cognitive/time load with a patient
  sitting there. Consider a "recently used / template anchors" shortcut, or
  letting the SMART + anchors be finished after the patient leaves while the
  patient-facing text is set live. The quality bar of the copy is high — which
  is exactly why doing it under time pressure risks rushed anchors.

### Step 5 — Closing the loop the therapist opened

**What works**
- The physician *sees* the therapist's signals: the visit-day strip,
  "working on this" goal chips, and the **adjustment-requests list**.

**Friction / gaps**
- **[Med] No closure on the therapist's "needs treatment adjusted" flag.** Goal
  and muscle *suggestions* now carry a status the therapist sees echoed; the
  **adjustment request does not** (no status column — this is the pending
  "adjustment-request status loop" in §8). From the physician's chair there's no
  "mark addressed / acknowledged"; from the therapist's chair the flag never
  resolves. This is the one asymmetry in an otherwise reciprocal signal system,
  and it's the highest-value next slice for *this* role.

### Step 6 — Side surfaces: observations & admin

- **[Med] `clinician/observations` is engineer-grade for a physician.** It asks
  for a LOINC code (placeholder "55423-8"), a display label, units ("steps"),
  device string, and a CSV paste. Correct as a data plumbing surface, but it's
  not "physician at point of care" — fine as an advanced/optional module; just
  don't surface it as a routine action.
- **[Low] `clinician/admin`** (create/list accounts, profession field, temp
  password, role filters, deactivate, reset password) reads clean. Note the
  "Physicians" filter label vs the `clinician` role internally — see the
  terminology drift above.

---

# Role 2 — The patient (re-stated at current state)

Depth lives in `patient-workflow-audit.md`. What matters here is **what's
changed** and the **seams**.

- **[Resolved — please re-verify] The old [High] "a new patient can't record a
  goal."** That cul-de-sac was the prior headline. Shipped work appears to close
  it: `pre-visit-suggestions` (0081) creates a patient row on signup and makes
  goal **suggestions** cycle-agnostic; `patient-visit-and-status` adds visit-code
  teaching to onboarding and the no-cycle home, plus a pending-suggestion status
  echo. So a brand-new patient should now be able to *suggest* a goal and see its
  status before their first cycle. **Re-walk this to confirm** the no-cycle home
  actually offers "Suggest a goal" and the teaching copy renders — then retire
  the old High in the patient audit.
- **What works (current):** weekly check-in is the core recurring loop with a
  24h **undo** (`reopen_weekly_checkin`, 0082) that refuses once a clinician has
  scored a clip — a humane, correct guard. Visit-code page deliberately avoids a
  ticking countdown to reduce clinic-floor pressure. Nav-style choice
  (top vs side) respects motor/preference differences.
- **[Med] "Cycle" is still clinician language** where it leaks into patient copy.
  The patient's mental model is "my treatment and the weeks after it," not "a
  cycle." Watch for the word in patient-facing strings.
- **Seam (see cross-role):** the patient's check-in *is* the data that both the
  therapist's and physician's charts read. The patient rarely learns that their
  weekly tap is what the two professionals see — a small "this is shared with
  your clinic and therapist" reassurance would close the loop.

---

# Role 3 — The therapist (re-stated at current state)

Depth lives in `therapist-workflow-audit.md` (this build's epic was driven by
it). Current state and seams:

- **What works (current):** the **"Note from the treating clinic"** card (0088)
  now appears high on `physio/patient`, **regardless of the muscle-sharing
  preference** — correctly treated as a deliberate message, not injection detail.
  `clinicNoteChanged` / `clinicNoteUnchanged` give the since-last-visit delta the
  audit said was missing. Suggestion **status echo** (Awaiting / Will take
  forward / Considered / Not this time) reads back the physician's decision.
  Pre-cycle suggestion is possible ("suggest a goal now, before the first
  treatment cycle"). Low-intensity capture (taps + one short reason) honours "no
  double documentation."
- **[Med] Per-visit access fights a weekly relationship.** "Entering it gives
  you access for one hour" + a fresh code every visit is friction for someone
  who sees the patient weekly and may want to write up *after* the session. This
  is the **persistent/recurring therapist access** open decision in §8 — flagged,
  not yet built, touches the consent model. It's the biggest structural friction
  in this role.
- **[Low] `noGoalsToReport` wording implies a power the therapist lacks.** "Add
  a goal first — progress is rated against approved goals." The therapist can
  only *suggest*, not add. "A goal must be approved first…" is truer to what they
  can do.
- **Seam:** the therapist's "needs treatment adjusted" flag has no closure
  (mirror of the physician finding above).

---

# Cross-role seams (where the value — and the bugs — live)

This app is fundamentally about three people sharing one record with a strict
information direction. The seams are the product.

1. **[High] The start-cycle dependency is invisible to all three** (headline).
   One screen action gates two other roles; no screen names it. Make it legible
   from the physician's button *and* in the patient/therapist "waiting" states.

2. **[Med] The adjustment-request loop is one-way.** Patient suggestions and
   therapist goal/muscle suggestions are now **reciprocal** (raised → status
   echoed). The therapist's *treatment-adjustment* request is the lone
   **one-way** signal: raised, surfaced to the physician, never closed back. A
   status column + echo makes the whole system symmetric. (= §8 pending item.)

3. **[Strength] The downward channel is correctly singular and safe.** Direction
   is upward everywhere except the physician→therapist handoff note, which is
   inter-professional, never patient-visible (no patient SELECT policy, dedicated
   table), and clearly labelled as such in the UI. The model is clean — protect
   it; don't let a second downward channel creep in.

4. **[Med] The visit code is one mental model, two duration stories.** Both pros
   unlock the same way, but only the therapist is told "one hour." Align the
   copy, and decide whether the physician's window should differ.

5. **[Low] Terminology pass needed across the seam.** physician / clinician /
   "treating clinic" and therapist / physiotherapist appear in different chairs.
   Patient-facing = "your clinic / your therapist"; professional-facing =
   role-precise. One glossary, applied once.

6. **[Med] The patient never sees that their tap feeds the professionals.** The
   weekly check-in is the shared substrate, but the patient experiences it as a
   private diary. A light "shared with your clinic and therapist" line both
   reassures and sets correct expectations (and supports the consent story).

---

# Prioritised punch list

Ordered by value-to-effort. "Copy" = strings only (en+da, watch ternary/error
blind spot). "Migration" = DB work.

| # | Finding | Role(s) | Severity | Effort |
|---|---------|---------|----------|--------|
| 1 | Name the start-cycle dependency on the physician button + in patient/therapist waiting states | all | High | Copy |
| 2 | Adjustment-request status loop (raise → echo back) | physician ⇄ therapist | Med | **Migration** (status column) + UI |
| 3 | Confirm/strengthen handoff-note save affordance + "saved" feedback | physician | Med | QA + Copy |
| 4 | Auto-show onboarding tour on a professional's first session (not replay-only) | physician, therapist | Med | Small logic |
| 5 | Align visit-code access-window copy across both pro roles | physician, therapist | Med | Copy |
| 6 | "shared with your clinic and therapist" reassurance on the check-in | patient | Med | Copy |
| 7 | Lighten mid-visit goal authoring (template/recent anchors, or finish-after-visit) | physician | Med | Medium UI |
| 8 | `noGoalsToReport` wording — suggest vs add | therapist | Low | Copy |
| 9 | Terminology glossary pass (physician/clinician/clinic; therapist/physio) | all | Low | Copy |
| 10 | "Cycle" → patient-language audit in patient-facing strings | patient | Low | Copy |
| 11 | Re-verify the resolved patient cold-start High; retire it in the patient audit | patient | — | QA |

**Net read.** The role machinery is sound and the trust model (single safe
downward channel, reciprocal upward signals) is genuinely well-designed. The
remaining work is almost entirely about **making the seams legible** — telling
each person what their action does to the others — plus the one structural
asymmetry (the adjustment-request loop). None of the top items except #2 needs
the database.
