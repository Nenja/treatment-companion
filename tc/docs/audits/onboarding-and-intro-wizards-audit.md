# Audit — Onboarding material & introduction wizards

> **Status update (build `onboarding-content-fixes`).** Findings **#1–#6, #9,
> #10 are now implemented** — the graph step shows both an NRS (0–10) and a GAS
> (banded) live chart; the check-in tour and Help are kind-agnostic and now
> mention training days and the optional video; new-goal/suggestion Help covers
> the NRS-vs-GAS choice and GAS levels (plus the video toggle); the
> clinician-page Help describes the Training panel and the "Since last visit"
> note; history Help distinguishes the two chart kinds. **#7** (Cancel on
> check-in) was fixed in the previous build. **#8** (re-surfacing to existing
> users) is covered via the always-available Help; a *forced* re-show of the
> tour remains optional (it needs an onboarding-version field). The findings
> below are kept as the original record.

**Scope.** The first-run tour (`components/feedback/OnboardingWizard.tsx`, copy in
the `intro` namespace), the per-page Help dialogs (`PageHelpButton`, copy in the
`help` namespace), and the explanatory copy inside the patient check-in flow
(`patient.checkin`). Not the broader app UX — that's covered by the separate
six-lens audits.

**Method.** Read the actual copy and wizard code against the *current* feature
set: NRS **and** GAS goals; the NRS 0–10 line chart vs the GAS banded chart;
the optional patient video at the week 6–8 check-in; weekly training-day
reporting split into *at home* / *with a therapist*; the clinician "Since last
visit" note; layout compact/wide.

**Headline.** The in-flow check-in copy is in good shape, but the *onboarding
and help that set expectations* predate GAS goals, video, and training, so they
now teach a partial — and in one case contradictory — picture. Tags below:
`[verified-in-code]` = confirmed against the source; `[fixed-here]` = addressed
in this build.

---

## High — teaches something now wrong or missing entirely

### 1. The graph tour teaches only the GAS banded chart; NRS goals look nothing like it
`[verified-in-code]` The clinician/physio "Reading the progress graph" step
(`intro.graphTitle/graphBody/graphBetter/graphExpected/graphBelow`, the
`GraphBandsIllustration`, and the live `GoalProgressView` demo) renders the demo
**without a `kind` prop**, so it defaults to the GAS bands (OnboardingWizard
~ll. 223–228). `intro.graphBody` says *"The coloured bands show how the week
compares to what was expected… the y-axis is the outcome level, not a raw
score."*

- **Why it matters.** NRS is the default goal kind and likely the majority. An
  NRS goal now draws a plain 0–10 line with gridlines and **no bands**, and its
  y-axis **is** the raw score — the exact opposite of what the tour says. A
  clinician taught the banded model meets a chart that doesn't match, which
  erodes trust in the tool right at the "learn it" moment.
- **Fix.** (a) In the graph step show *both*: keep the bands illustration for
  GAS and add a short 0–10 line example for NRS — or render two live
  `GoalProgressView` demos, `kind="gas"` and `kind="nrs"`. (b) Reword
  `graphBody`: "GAS goals use descriptive bands (an outcome level); NRS goals
  plot the raw 0–10 the patient reported." (c) Pass an explicit `kind` to each
  demo. `help.clinicianPatientBody`/`help.historyBody` lean on "coloured bands"
  too — qualify them as the GAS view.

### 2. Check-in onboarding/help promise a 0–10 scale; GAS goals are rated by picking a level
`[verified-in-code]` `intro.checkinBody` ("rate each goal on a simple 0–10
scale"), `intro.checkinLow`/`checkinHigh`, and `help.checkinBody` ("Rate each
goal on a 0–10 scale") describe only NRS. A GAS goal's check-in step shows five
descriptive options (Much worse … Much better).

- **Why it matters.** A patient told "0–10" then shown five word-options has
  been mis-prepared on the one screen they use every week. (Credit: the *in-flow*
  copy already branches correctly — `patient.checkin.rateGoalHelperGas` plus the
  `scaleMuchHarder…scaleMuchBetter` labels — so only the expectation-setting copy
  is wrong.)
- **Fix.** Make it kind-agnostic: "rate how each goal went this week — some goals
  use a 0–10 scale, others a set of options from 'much worse' to 'much better'."

### 3. Nothing mentions the optional check-in video
`[verified-in-code]` No `intro`/`help` key references video. Yet at a week 6–8
check-in a video-enabled goal shows a consent screen and camera.

- **Why it matters.** An unexplained camera/consent prompt mid-check-in is
  jarring and invites refusals or confusion; on the other side, clinicians never
  learn the per-goal video toggle exists.
- **Fix.** Patient check-in onboarding: "Once during your cycle we may ask for a
  short, optional video — you'll always be asked first, and only your care team
  can see it." Clinician new-goal/help: "You can turn on an optional short video
  for a goal; the patient is offered it once, around peak effect (weeks 6–8)."

### 4. Nothing mentions weekly training-day reporting (home / with therapist)
`[verified-in-code]` No `intro`/`help` key references training. The check-in now
has a dedicated step with two Mon–Sun selectors, and the clinician page has a
"Training" overview.

- **Why it matters.** Patients hit an unexplained step; clinicians aren't told
  the Training panel exists or how to read it (home = filled, therapist = amber
  ring).
- **Fix.** Patient check-in onboarding: "You'll also mark which days you did your
  exercises — at home and with a therapist." Clinician `help.clinicianPatientBody`:
  "A collapsible 'Training' panel shows which days the patient trained, at home
  vs with a therapist, across the cycle."

---

## Medium — incomplete; will mislead on setup

### 5. New-goal & suggestion help describe only NRS setup
`[verified-in-code]` `help.newGoalBody` ("set the 0–10 question they'll answer…
how their answers map to outcome levels") and `help.suggestionBody` ("the rating
setup — the 0–10 question and outcome levels") omit the NRS-vs-GAS choice and GAS
anchors that the new-goal form now offers.

- **Fix.** "Choose how the goal is measured — a 0–10 question (NRS) or five
  descriptive levels (GAS) — then set it up. The goal still belongs to the
  patient." Mirror in the suggestion-review help.

### 6. The "Since last visit" note isn't introduced
`[verified-in-code]` Not in `intro` or `help.clinicianPatientBody`.

- **Fix.** Add to clinician patient-page help: "Keep a free-text 'Since last
  visit' note on the patient's page — it's tied to the current cycle and starts
  fresh each visit."

### 7. Check-in had no Cancel control `[fixed-here]`
`[verified-in-code]` The check-in passed `forgiving` to `WizardLayout`, so the
only top-left action was "Save & finish later"; the prepared
`patient.checkin.cancelConfirm*` strings were never wired.

- **Fixed in this build.** The check-in now shows a **Cancel** button that opens
  the confirmation dialog ("Leave your check-in? Your answers so far will be
  kept.") with *Keep going* / *Leave for now*. Remaining nit: `WizardLayout`
  takes its "Cancel" label from `patient.suggestGoal.cancel` rather than
  `patient.checkin.cancel` — same word today, worth unifying so they can't drift.

---

## Low — polish & discoverability

### 8. Existing users won't see the new material
`[verified-in-code]` The tour shows once per account (`profile.hasSeenIntro`,
with a replay trigger). Anyone onboarded before GAS/video/training won't see the
additions unless they replay.

- **Fix.** Either bump an onboarding "version" so the new steps re-surface once,
  or rely on the always-available per-page Help — which means Help must carry the
  new info (it currently doesn't; see #1–#6). At minimum, fix Help first since
  it's the only path for existing users.

### 9. `intro.recordBodyClinician` omits goal-kind choice & video toggle
Overlaps #3/#5; fold a sentence in rather than adding a step.

### 10. Terminology drift: "score" vs "outcome level"
Once goals can be either kind, define both once ("NRS = a 0–10 score; GAS = an
outcome level from 'much worse' to 'much better'") and use the framing
consistently instead of defaulting to "0–10".

### 11. Patient tour has no graph step — correct
`[verified-in-code]` Patient steps are `intro → details → checkin → comfort`;
patients never see a goal graph, so the absence is right, not a gap.

---

## What's already good (keep)

- The check-in **in-flow** copy branches correctly for GAS (`rateGoalHelperGas`,
  descriptive scale labels) and is warm and clear ("no right or wrong answers,"
  caregiver attribution, an urgent-concerns safety note).
- The graph step uses a **live** `GoalProgressView`, so "tap a dot" is literally
  true and always matches the real component — good instinct; it just needs the
  per-kind variants.
- The cancel-confirm copy was already written with the right reassurance — only
  the wiring was missing (now done).

---

## Coverage matrix

| Feature | First-run tour | Per-page Help | In-flow copy |
|---|---|---|---|
| NRS goal (0–10) | ✓ | ✓ | ✓ |
| GAS goal (levels) | ✗ (#2) | ✗ (#2,#5) | ✓ |
| NRS 0–10 graph | ✗ (#1) | ✗ (#1) | n/a |
| GAS banded graph | ✓ | ✓ | n/a |
| Optional video | ✗ (#3) | ✗ (#3) | partial (consent screen only) |
| Training days (home/therapist) | ✗ (#4) | ✗ (#4) | step exists, unlabelled in tour |
| "Since last visit" note | ✗ (#6) | ✗ (#6) | n/a |
| Cancel / leave check-in | n/a | n/a | ✓ `[fixed-here]` |

## Suggested order of fixes

1. **Help dialogs first** (#1–#6 in `help`) — the only channel that reaches
   existing users, and low-risk copy edits.
2. **Graph step** (#1) — show both chart kinds; highest comprehension impact.
3. **Check-in tour** (#2–#4) — GAS rating, video heads-up, training step.
4. **New-goal/record + suggestion** (#5, #9) and the **note** (#6).
5. **Re-surfacing** (#8) and **terminology pass** (#10).

All of #1–#6, #9, #10 are copy/markup changes (plus passing `kind` to the demo);
none need a migration. I can implement any subset on request — say which.
