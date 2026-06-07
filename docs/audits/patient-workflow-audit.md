# Patient workflow audit — account creation to ongoing use

**Scenario walked:** a person with spasticity is told "use this app to record your goals," creates an account, and tries to go end to end.

**Method & honesty note:** this is traced from the actual code, copy, and flow of the patient-facing surfaces (`signup`, root `page.tsx` home, `visit-code`, `suggest-goal`, `checkin`, the onboarding wizard, profile). I can't run the app, sign in, or see it rendered, so every claim here is about *structure and wording*, not pixels — treat the visual/interaction notes as "check this," not "confirmed broken."

Findings are tagged **[High] / [Med] / [Low]** by how much they hurt a real first-time patient.

---

## The headline finding first

**[High] A brand-new patient cannot record a goal — the thing they were told to do.**

The journey assumes the clinic goes first. Concretely:

- Signing up creates a **login profile only**. The `patient` record, the treatment cycle, and the weekly check-in prompts are all created on the **clinic side** (when a clinician starts a cycle/treatment).
- Until that happens, the home shows: *"No treatment cycle yet. Your clinic will set up your first cycle at your next visit."* — a dead end with no action on it.
- If the patient navigates to "Suggest a goal" anyway, the submit **throws "No active cycle for this patient."** The goal-proposal flow is hard-gated on a cycle existing.

So the literal instruction in the scenario — *"use this app to record your goals"* — fails for the first-run patient. They can create an account and then… wait for an appointment. Everything below is downstream of this gap.

This is fixable without breaking the "clinician decides" model (see Recommendations), but it's the first thing to resolve.

---

## Step 1 — Account creation (`/signup`)

**What works**
- Clean, short form: role (patient/therapist), name, email, password, show/hide password.
- Role is clamped server-side (a patient can't self-create a clinician) — good safety.
- Friendly, mapped error messages (already registered, weak password, rate limit, network).
- Handles both instant-session and email-confirmation projects gracefully ("check your email").

**Friction / gaps**
- **[Med] No "why am I here / who invited me" framing.** A spasticity patient asked to use the app likely got a leaflet or a verbal instruction. The signup page doesn't acknowledge that context or say "your clinic will connect your record at your next visit." First impression is a generic sign-up with no map of what comes next.
- **[Med] Role choice puts a clinical decision on the patient.** "Patient vs therapist" is obvious to staff, less so to an anxious first-timer. Defaulting to patient is right; consider hiding the therapist option behind a small "I'm a clinician/therapist" link so patients see one fewer fork.
- **[Low] Password rule (≥8 chars) is shown only on error.** Stating it under the field up front avoids a failed first attempt — relevant for users with motor/typing fatigue who don't want to re-enter.
- **[Low] No password-manager / autofill hints noted** (`autoComplete` attributes worth verifying) — matters for one-handed or tremor users who rely on autofill.

---

## Step 2 — First landing on the home (no cycle yet)

**What works**
- It doesn't crash or show a scary error; it's a calm, explicit empty state.
- The safety notice is still present.

**Friction / gaps**
- **[High] The empty state is a cul-de-sac.** "Your clinic will set up your first cycle at your next visit" tells the patient to do nothing. There's no "here's how to prepare," no "show this code at your visit," no "jot down goals you'd like to raise." The one screen a brand-new patient sees gives them zero forward motion.
- **[Med] The visit-code and suggest-goal actions are hidden in exactly the state where a new patient would look for them.** Those buttons only render once a cycle exists (the no-cycle branch returns early). So the patient can't even *find* the visit code from the home until after the clinic has already linked them — which is backwards from how linking should feel.
- **[Low] No indication of what "a cycle" is.** The word "cycle" is clinician language; the body copy uses it without translation into patient terms ("your treatment and the weeks after it").

---

## Step 3 — Connecting to the clinic (`/visit-code`)

**What works**
- Thoughtful design: the code persists server-side (same code across devices, survives reload), and it deliberately does **not** show a ticking one-second countdown — explicitly to avoid time pressure while standing at a clinic. That's a genuinely empathetic touch.
- Auto-generates a code on arrival; copy button with confirmation.

**Friction / gaps**
- **[Med] The mental model isn't taught anywhere the patient will see it first.** The code's purpose ("show or read this to your clinician so they can open your record for this visit, expires in 10 minutes") is good copy — but it lives *on the visit-code page*, which a new patient has no reason to open, and which isn't surfaced in the no-cycle home state. The one moment they need this explanation (first appointment) is the one moment they may not have found the page.
- **[Med] 10-minute expiry is per-visit, not for linking.** This is access-for-a-visit, not account-linking. It reinforces that nothing in the app is actionable from home before/independent of a visit. Fine as designed, but it deepens the cold-start problem.
- **[Low] No fallback if the patient can't show a screen** (forgot phone, dead battery). A clinician-initiated lookup path would help, but that's a clinic-side concern.

---

## Step 4 — The onboarding wizard (`OnboardingWizard role="patient"`)

**What works**
- One-time orientation, replayable; patient gets a tailored short path (intro → details → check-in → comfort) rather than the longer clinician path.
- A "details" step (DOB/sex) with a skip option — optional, not a wall.

**Friction / gaps**
- **[Med] It teaches the check-in before the patient has anything to check in on.** For a no-cycle patient the wizard explains weekly rating, but there are no goals and no prompts yet, so the lesson is abstract and possibly forgotten by the time it's relevant (weeks later).
- **[Med] It doesn't teach the one thing the first-run patient actually needs:** "at your appointment, open Show visit code." The wizard is the natural home for that, and it's missing.
- **[Low] Asking DOB/sex during orientation** may feel like form-filling before any value has been delivered. Consider deferring to when it's clinically used.

---

## Step 5 — Proposing a goal (`/suggest-goal`)

**What works**
- A calm 4-step wizard (domain → own words → importance → optional context + review) with **draft auto-save to localStorage** and resume — excellent for fatigue/interruption, and for users who need multiple sittings.
- Plain-language framing; the patient describes goals in their own words; the clinician is "the scribe." This respects the care model well.
- Removed the "when do you hope to see change" question to avoid setting expectations the system can't honor — a good, deliberate simplification.

**Friction / gaps**
- **[High] Hard dependency on an active cycle (throws on submit).** As above: the patient can fill in the entire wizard and only discover at submit that there's "no active cycle." Worst-case timing for an error — after the effort, not before.
- **[Med] No way to capture a goal *before* the cycle exists.** A patient told to "record your goals" before their visit has nowhere to put them. A pre-cycle "goals I want to raise" capture (that the clinician later converts) would directly serve the scenario.
- **[Low] "Importance" as a three-option scale** is good, but verify the options read in patient language, not clinical priority terms.

---

## Step 6 — The home once a cycle is set up

**What works**
- Strong information hierarchy: the **check-in CTA leads** the screen directly under the greeting — the one job the patient is there for.
- Week framing is humane: *"Week {n} since your last treatment"* instead of "cycle week," so the patient never has to think in cycles.
- **Catch-up card** for missed past check-ins sits right under the CTA (it *is* check-in work) — good.
- Notifications opt-in is demoted and quiet; goal cards with an optional "view graph" only when there's data to show; treated-muscles peek only when a treatment exists. Conditioning UI on data presence avoids empty/confusing affordances.

**Friction / gaps**
- **[Med] "Suggest a goal" and "Show visit code" share equal, quiet weight after the goals.** For an established patient this is fine; but a patient mid-cycle who wants to add a goal may not scan that far. Acceptable, low urgency.
- **[Low] No visible sense of "what happens to my suggestion."** After suggesting a goal, the patient sees a thanks screen, but the home doesn't show "1 suggestion awaiting your clinician." The upward-only model is intentional (no clinic→patient messaging), but a neutral status ("sent — your clinician will review at your next visit") would reduce the "did that do anything?" feeling without breaking the model.

---

## Step 7 — The weekly check-in (`/checkin`)

**What works**
- Stepwise: one goal per step, plus a final step bundling training days, an optional comment, and "who filled this in" (self vs caregiver) — caregiver attribution is a real-world necessity for spasticity and is handled.
- **Draft auto-save + "save and finish later" + reassurance copy** — again strong for fatigue and interruption.
- Per-goal pickers tuned to the goal type (0–10 NRS vs GAS −2..+2 with worded anchors like "much better / as expected / much harder"), and the **previous rating is shown** for context.
- Optional video only appears in the peak window (weeks 6–8) and only once per cycle — it doesn't nag every week.
- Cancel guard ("discard / keep") prevents accidental loss.

**Friction / gaps**
- **[Med] Step count scales with goals with no overview.** A patient with 5–6 goals walks 7–8 steps weekly. There's a "step X of Y," but consider a one-glance progress dots row and the ability to jump to a goal, so a weekly ritual doesn't feel longer over time.
- **[Med] No way to amend a submitted check-in.** If a patient taps the wrong rating and submits, there's (as far as the flow shows) no patient-side correction. For tremor/motor users mis-taps are common; even a short edit window would help.
- **[Low] Video step on phone vs the desktop fallback** — verify the recorder/upload path is obvious and forgiving for someone recording one-handed; this is exactly where a confused patient abandons.
- **[Low] "Training days" wording** — confirm it's clearly the patient's home exercises, not clinic visits.

---

## Step 8 — Seeing progress

**What works**
- Goal cards offer a read-only graph **only when ratings exist** — no empty charts.
- The patient view is deliberately simpler than the clinician's (no clinician overlays), matching the principle that patients self-report and don't read clinical scoring.

**Friction / gaps**
- **[Low] Reassurance is thin.** Spasticity progress is slow and non-linear; a patient may rate "no change" for weeks and feel they're failing. A gentle, honest framing ("ups and downs are normal; your clinician looks at the whole picture") near the graph would protect morale without overpromising. Keep it non-clinical and non-judgmental.
- **[Low] No "what my therapist/clinician added" visibility.** Intentional (upward-only), but worth a conscious decision: patients often want to see that their input was received.

---

## Step 9 — Profile & account management

**Not deeply walked here**, but flag to verify: password reset path, changing email, language switch (en/da) discoverability, and a plain-language privacy link. These are table stakes for trust and weren't part of the goal-recording spine.

---

## Cross-cutting observations

**Strengths worth keeping**
- Draft persistence everywhere (suggest-goal, check-in) — the single best accessibility decision in the app for this population.
- Anti-pressure choices (no live countdown; optional video; skippable details).
- Plain-language reframing of clinical concepts (weeks-since-treatment, "in your own words").
- Caregiver attribution and the upward-only communication model are coherent and MDR-cautious.

**Accessibility — verify**
- Tap targets look generous (h-11 ≈ 44px) — good for tremor/low dexterity; confirm across all interactive controls.
- Confirm focus order, visible focus rings, and screen-reader labels on the icon-only buttons (visit code, treated muscles).
- Confirm the 0–10 and −2..+2 pickers are operable by keyboard/switch and have clear selected-state contrast.

**Missing features (ranked by impact on the stated scenario)**
1. **[High] Pre-cycle goal capture** so a newly-told-to-record patient can actually record. A "goals to raise" list, stored against the profile, that the clinician converts into real goals at the visit — preserves "clinician decides" while unblocking the patient.
2. **[High] A first-run "connect to your clinic" path** — orientation + a reachable visit-code explanation from the no-cycle home, so the empty state has a next action.
3. **[Med] Pre-submit cycle check in suggest-goal** so the wizard never dead-ends at submit (and, before #1 ships, tells the patient *why* and *what to do* instead of throwing).
4. **[Med] Edit/undo window on a submitted check-in.**
5. **[Med] Suggestion status echo** ("sent — your clinician will review") to close the loop without two-way messaging.
6. **[Low] Reminders/notifications tied to due check-ins** (the opt-in exists; confirm it actually drives weekly nudges).

---

## Prioritized recommendations

1. **Unblock the cold start (do first).** Either (a) let a patient capture goals pre-cycle into a holding list the clinician converts, or at minimum (b) replace the no-cycle dead-end with an orientation: what to expect, "Show visit code at your appointment," and "Jot down goals to raise." This is the difference between the scenario working and not.
2. **Make suggest-goal fail gracefully** until #1 lands: check for a cycle on entry and explain, rather than throwing on submit after the patient's effort.
3. **Teach the visit code where the new patient is** — in the onboarding wizard and on the no-cycle home, not only on the visit-code page.
4. **Add a check-in edit/undo window** and a lightweight per-goal progress overview as the weekly ritual grows.
5. **Echo suggestion/check-in status** so the patient feels heard, staying within the upward-only model.

The bones are good — the check-in and suggest-goal wizards are genuinely well-built and kind to this population. The gap is almost entirely at the **front door**: the app today is excellent for a patient the clinic has already set up, and close to unusable for one who hasn't been — which is precisely the person in the scenario.
