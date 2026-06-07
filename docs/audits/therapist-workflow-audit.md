# Therapist workflow audit — end to end

**Persona walked:** a community physiotherapist who sees the patient **weekly for training** as part of their spasticity rehabilitation, often *not* at the injecting clinic (the patient's local gym, clinic, or home). They contribute progress observations, exercise guidance, and suggestions the physician considers at the next injection visit.

**Method & honesty note:** traced from the actual therapist code — the unlock page (`/physio`), the patient working page (`/physio/patient`), the progress page (`/physio/progress`), the progress/suggestion/muscle components, the physio data hook, and the assessment/suggestion RPCs. I can't run the app or see it rendered, so interaction/visual claims are "check this," not "confirmed."

Findings tagged **[High] / [Med] / [Low]**.

---

## The headline finding first

**[High] The therapist's main job — the weekly training — has nowhere to be recorded.**

This persona's defining activity is running weekly training sessions. But in the app:

- **"Training days with the therapist" is reported by the _patient_**, inside the patient's weekly check-in (the check-in has both an "at home" and a "with therapist" day-picker, both filled in by the patient). The therapist has no screen to log "I trained them on these days / this is what we did."
- The only therapist-owned free-text surface is a single **exercise *plan*** field (`PhysioPlanSection`) — what the patient *should* do, not a record of sessions that *happened*.

So the system captures the therapist's *plan* and the patient's *self-reported* adherence, but never the therapist's own account of the sessions they ran. For a care model built around weekly therapist-led training, that's the core workflow gap. Everything else below is secondary to it.

(There's a coherent reason it ended up this way — the app's spine is the patient's weekly self-report, and the therapist was added as a contributor of *observations and suggestions*, not as a primary data author. But for the "communal therapist doing weekly training" persona specifically, that leaves their main contribution invisible.)

---

## Step 1 — Account creation (signup as therapist)

**What works**
- Self-signup supports the therapist role, with a profession picker (so "physiotherapist," "occupational therapist," etc. can be distinguished).
- Same clean form, password rules, and error handling as the patient side.

**Friction / gaps**
- **[Low] Profession list breadth.** The persona could be OT, speech therapist, etc. Worth confirming the profession options cover the "any therapist who meaningfully contributes" intent, since the role label otherwise defaults to "physiotherapist" language throughout the UI ("physio" routes, "therapist" copy).
- **[Med] No org / clinic affiliation at signup.** A community therapist isn't tied to the injecting clinic. There's no concept of which clinic(s) a therapist works with — access is established per-visit by a code (see Step 3). Fine for the consent model, but it means the therapist has no "my patients" roster (see below).

---

## Step 2 — Onboarding (therapist path)

**What works**
- A tailored wizard path (`intro → how → graph → actions → record → comfort`) that's genuinely role-appropriate. The copy is good: it explains unlocking by visit code, reporting progress, suggesting goals/muscles for the physician, and that "your own clinical notes stay in your usual record system" — a smart expectation-setter that avoids implying this replaces their EMR.
- A graph-reading step (therapist line vs patient line) so they understand the dual-line chart they'll see.

**Friction / gaps**
- **[Med] Onboarding sets the expectation "record how goals are progressing… suggest goals… flag muscles," but never mentions logging training.** This is consistent with the app (there is no training log), but it quietly tells the persona their main activity isn't part of the tool — reinforcing the headline gap.

---

## Step 3 — Getting access to a patient (`/physio` unlock)

**What works**
- Reuses the visit-code → time-boxed session mechanism (the `clinician_session` table and unlock RPC are role-agnostic; a therapist has a `clinician` row so `current_clinician_id()` works). One patient at a time, code-entry UI is large and clear (uppercase, monospace, `ABC-DEF`).
- Auto-redirects to the patient view if a session is already live.

**Friction / gaps**
- **[Med] The per-visit code model fits an in-clinic visit, not a recurring weekly relationship.** A community therapist sees the *same* patient every week. Each session they must ask the patient to open their app, generate a code, and read it out — and the patient must be present and able to do so. For a weekly cadence that's real, repeated friction, and it breaks down if the patient can't operate their phone that day (common in this population) or the therapist wants to write up the session afterwards (the session has expired).
- **[Med] No patient roster / recurring link.** Because access is purely per-code, the therapist has no list of "the patients I work with," no way to prepare before a session, and no way to do anything between sessions. A longer-lived or therapist-initiated (patient-approved) link for an ongoing care relationship would fit this persona far better — without necessarily abandoning the consent gate.
- **[Low] Session length.** Worth confirming the session is long enough for a full training session + write-up (the code copy elsewhere says 10-min code validity / 1-hour session). A weekly training visit can run longer than an injection appointment.

---

## Step 4 — The patient working page (`/physio/patient`)

**What works**
- Sensible top-to-bottom shape: read-only clinical context (etiology, affected side, ambulation, assistive devices) → recent patient comments → action row → goals with progress.
- **Recent patient comments (last 14 days, with self/caregiver attribution)** are surfaced — genuinely useful context before a session, and respecting that a caregiver may have filled them in.
- **Treated-muscle visibility is consent-gated** (`share_muscles_with_physio`): the therapist sees which muscles were injected *only if the patient shares*. Good privacy posture, and clinically useful when shared (a therapist should know what was treated before loading those muscles).
- Goal charts overlay the **therapist's assessment line separately from the patient's self-report line** — the two voices stay distinct, which is correct.
- A free-text **exercise plan** the therapist can maintain.

**Friction / gaps**
- **[Med] Read-only clinical context is good, but there's no "what changed since I last saw them."** The patient home has a "since last visit" framing; the therapist page shows recent comments but not a clear "new since your last session" diff (new injections, new goals, retired goals). For weekly cadence, a delta view would orient them fast.
- **[Low] Exercise plan is a single last-write-wins field.** No history, no authorship, and two therapists (or the same one over time) overwrite each other. Fine for a prototype; flaggable.
- **[Low] No training-adherence view.** The patient reports "days trained at home / with therapist" weekly — but it's unclear the therapist can *see* that adherence trend, which would be exactly what a training therapist wants. Worth verifying; if it's not shown to the therapist, surfacing it is high-value and low-cost (the data already exists).

---

## Step 5 — Reporting progress (`/physio/progress`) — the primary task

**What works**
- A dedicated page (not a cramped inline panel), mirroring the clinician's treatment page — the routine task gets room.
- Pick a visit date, optionally one visit-level note "for the physician to see at the next visit," and rate only the goals that are relevant (a goal stays collapsed/skipped until you open its picker). Skip-by-default is the right model — a therapist won't have a view on every goal.
- Ratings render as the therapist's own dated points on each goal's chart, separate from the patient's line.

**Friction / gaps**
- **[Med] Every goal is rated on a bare 0–10, including GAS goals — with no anchors shown.** The progress form uses the NRS picker for all goals; for a GAS goal it passes an empty goal text and a null question, so the therapist rates an *anchored, functional* goal on an abstract 0–10 with none of the worded levels (`much worse … as expected … much better`) in front of them. The patient and clinician rate GAS goals against those anchors; the therapist doesn't get them. That makes the therapist's GAS ratings both harder to give and less comparable. A GAS-aware picker (show the anchors, rate the level) would fix it.
- **[Med] The note is single, visit-level, free text.** No per-goal note, and it's "seen at the next visit" — there's no structured way to flag "goal 2 regressed because of X." For a training therapist whose value is the *why*, per-goal context would help.
- **[Med] Still no training log here either.** The "report progress" task is *rating goals*, not *recording the session*. The persona finishes a training session and the only thing they can enter is goal ratings + one note — not what they worked on, reps/sets/tolerance, or attendance.

---

## Step 6 — Suggesting goals and muscles (upward to the physician)

**What works**
- The therapist can suggest a new goal (with rationale) and flag a muscle (with side + rationale, optionally linked to a goal). These go to the physician as `needsReview` items — the correct upward-only, MDR-safe flow (the therapist informs; the physician decides).
- Matches the patient's suggestion model, so the physician has one review surface.

**Friction / gaps**
- **[Med] Therapist suggestions still hard-require an active cycle.** `submit_physio_goal_suggestion` / `submit_physio_muscle_suggestion` raise "patient has no active treatment cycle." We just made the *patient's* suggestions cycle-agnostic; the therapist's aren't. A therapist who starts working with a patient before the first injection cycle (or between cycles) can't suggest anything. Inconsistent, and a real block in the gap between referral and first injection.
- **[High-ish/Med] No feedback on what the physician did with a suggestion.** The therapist fires suggestions upward and — as far as I can see — never learns whether they were approved, declined, or are still pending. A professional collaborator reasonably expects to know if their flag was acted on (especially a muscle flag that affects the next injection). The upward-only *messaging* rule needn't block a simple *status* echo (pending / accepted / not this time), like the one we just added for patients. Without it, the therapist is guessing.

---

## Step 7 — Assessment history

**What works**
- An assessment-history panel lets the therapist see past assessments (theirs and others'), so progress reporting has continuity across weeks.

**Friction / gaps**
- **[Low] Confirm it's legible over many weeks** (a weekly therapist accrues a lot of assessments) — grouping by goal or a compact timeline would help; flag to verify rendering.

---

## Step 8 — Recording assistive devices

**What works**
- The therapist can record assistive devices in the patient's info (per onboarding copy and `set_patient_info` access) — a sensible, in-scope contribution for a physio.

**Friction / gaps**
- **[Low] Verify the edit surface is obvious** from the patient page (it's mentioned in onboarding but I didn't see a prominent control in the action row — the actions are muscles / suggest goal / suggest muscle / history). If device-editing lives only behind the patient-info page, the onboarding promise and the UI may not line up.

---

## Step 9 — Ending / resuming

**What works**
- Explicit end-session, and the unlock page clears the "ending" signal cleanly; re-entry requires a fresh code.

**Friction / gaps**
- **[Med] No after-the-fact write-up.** Once the session ends (or the code expires), the therapist can't go back and add the note they meant to write on the bus home. For a weekly clinician who documents after sessions, that's a workflow mismatch — tied to the per-visit access model in Step 3.

---

## Cross-cutting

**Strengths worth keeping**
- The upward-only, physician-decides model is coherent and MDR-cautious; therapist and patient voices stay visually and structurally separate on the charts.
- Consent-gated muscle sharing is a thoughtful privacy default.
- Role-appropriate onboarding that explicitly *doesn't* claim to replace the therapist's own record system.
- Skip-by-default goal rating respects that a therapist won't opine on everything.

**Accessibility — verify (can't render here)**
- The big code-entry field and action buttons look generously sized; confirm focus order, visible focus, and screen-reader labels on icon-only actions, same caveats as the patient side.

**Missing features (ranked for this persona)**
1. **[High] A therapist training/session log** — attendance + what was worked on (even lightweight: date, "session done," a short free-text of what was trained, optional tolerance/notes). This is the persona's core activity and currently has no home. It would also give the physician a real picture of the rehab between injections.
2. **[Med] GAS-aware rating for therapists** — show the goal's anchors and rate the level, instead of an unanchored 0–10.
3. **[Med] Suggestion status echo** — let the therapist see pending/accepted/declined on their goal and muscle suggestions.
4. **[Med] A recurring therapist↔patient link / roster** — so a weekly community therapist isn't re-unlocking by fresh code every session and can prepare/write up around the visit. Keep it consent-based, but longer-lived than a per-visit code.
5. **[Med] Cycle-agnostic therapist suggestions** — mirror the patient fix so a therapist can contribute before the first cycle.
6. **[Med] Surface training adherence to the therapist** — the patient already reports home/therapist training days; show that trend on the therapist page.
7. **[Low] Per-goal notes; exercise-plan history/authorship; a "since last session" delta.**

---

## Prioritized recommendations

1. **Give the therapist a place to record the session.** Even a minimal session log (date + what was trained + optional note + attendance) turns the therapist from a rater of someone else's goals into a first-class contributor — and matches the persona. This is the one change that most changes the experience.
2. **Make the therapist's goal rating GAS-aware** (anchors shown) so their input is as meaningful as the patient's and clinician's.
3. **Echo suggestion status** to the therapist (pending/accepted/declined), reusing the pattern we built for patients.
4. **Rethink access for recurring care** — a longer-lived, consent-based therapist link (or roster) so weekly visits and after-session write-ups don't fight the per-visit code.
5. **Make therapist suggestions cycle-agnostic** for consistency with the patient flow.

The therapist surface is well-built *as a progress-and-suggestion tool*: clean unlock, good context, separate-voice charting, MDR-safe suggestions. The gap is one of **scope** — for a therapist whose job is the weekly training, the app currently lets them rate goals and advise the physician, but not record the work they actually do. Close that, make their ratings GAS-aware, and close the suggestion loop, and the therapist becomes a genuine third corner of the care triangle rather than a commentator on it.
