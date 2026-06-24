# SAMPLE — six-lens audit: clinician patient page (`/clinician/patient`)

**This is a sample for sign-off.** You asked me to audit one high-value page first so you
can sanity-check the approach before I fan out into the six app-wide per-lens documents.
I picked the clinician patient page because it's the hub — patient context, the action row,
inline panels (medication, physio, suggestions), goal cards with progress, archived goals,
and five modals — so it exercises all six lenses at once. If the depth, tone, and the
verified-vs-needs-checking discipline here look right, I'll reproduce it across the other
pages, regrouped into the six per-lens docs.

Method, as before: `[verified-in-code]` = traced to source; `[needs-on-screen-check]` =
structure confirmed but rendering/feel needs your eyes; `[verify-in-component]` = depends on
a child component I'd confirm in the full pass. Contrast values are computed from the real
palette. Dev build; not a regulatory blocker.

---

## 1. Don't Make Me Think

**Good:** The action row with count badges is recognition-over-recall done well — a badge
appears only when something waits, so the badge *is* the signal `[verified-in-code]`. The
archive-goal dialog captures *how* a goal ended (achieved / partial / no longer suitable)
with one-line hints, so the choice is self-explanatory `[verified-in-code]`.

- **SEV-2 — The patient name in the header is a clickable button, but nothing says so or
  where it goes.** `[verified-in-code]` It wraps the name plus an aria-hidden ⓘ glyph and
  navigates somewhere, but the only affordance is a hover colour change (desktop-only). A
  clinician may not realise the name is tappable. *Fix:* give it an accessible/visible cue —
  e.g. an aria-label "View {name}'s details" and a clearer affordance.
- **SEV-2 — Three different behaviours hide behind four similar action-row icons.**
  `[verified-in-code]` Medication and physio open inline panels *here*; History *navigates
  away*; Export opens a *modal*. Same visual treatment, three outcomes the user can't predict
  before tapping. *Fix:* the short labels help; add a subtle cue distinguishing "opens here"
  from "goes elsewhere" (e.g. a chevron on History/Export).
- **SEV-3 — "Start new treatment" sits *below* the action row and any open panel.**
  `[verified-in-code]` The visit usually *begins* with a new cycle, but the primary button
  follows the secondary tools and shifts down when a panel opens. *Fix:* confirm on-screen
  that its prominence still wins; consider placing it directly under the cycle context.
- **SEV-3 — The retire-goal icon is a "door/exit" glyph.** `[verified-in-code]` Ambiguous on
  its own; the text label carries it. Minor.

## 2. Accessibility (WCAG 2.1 AA)

**Good, and better than the FaceMap was:** every contrast value I checked **passes AA** —
count badge (on-accent on amber-deep) **6.53:1**, outcome badges **4.76–5.92:1**, the
suggestions and primary buttons **7.14:1**, retire/reactivate text **7.38:1**, patientSummary
**4.69:1**. The modals use a shared `useModalA11y` hook (focus trap + Escape) with
`role="dialog"`, `aria-modal`, and `aria-labelledby` `[verified-in-code]`. The action row has
`role="group"`, and each button carries `aria-pressed` for the open panel plus an `aria-label`
that includes the count `[verified-in-code]`. The suggestions toggle does the same, and its
count badge is `aria-hidden` with the number surfaced in the button's label `[verified-in-code]`.
Goal-outcome badges pair colour **with a text label**, so they aren't colour-only
`[verified-in-code]`. This page is in good a11y shape.

- **SEV-2 — The header patient-name button has no name describing its action.**
  `[verified-in-code]` Its accessible name is just the patient's name (a navigation with no
  stated destination). *Fix:* aria-label "View {name}'s details" (pairs with DMT #1).
- **SEV-3 — Count-badge legibility.** `[needs-on-screen-check]` Contrast passes, but it's a
  bold ~10px number in an 18px circle — confirm it's readable on a real phone.
- **SEV-3 — patientSummary is `truncate`d.** `[verified-in-code]` It carries clinical context
  (age, etiology, affected side, ambulation); truncation can hide part of it with no
  programmatic full text. *Fix:* expose the full string (title attr or wrap) so it isn't lost.

## 3. Progressive disclosure

**Good:** Inline panels (medication, physio, suggestions) and the archived-goals section
render only when relevant; heavier flows (export, new cycle, enlarged goal graph) are modals
`[verified-in-code]`. The two action-row panels are mutually exclusive (toggling one closes
the other) `[verified-in-code]`.

- **SEV-2 — Two separate panel systems on one page.** `[verified-in-code]` The action row
  drives `openPanel` (medication | physio); Suggestions has its *own* toggle lower down
  (`showSuggestions`). Conceptually similar "reveal a panel" actions live in two places with
  two mechanisms. This was a deliberate split (suggestions belong with goals), so it's a
  defensible tradeoff — flagged so it's a conscious one.
- **SEV-3 — Every active goal renders a full progress chart inline.** `[verified-in-code]` Fine
  for a few goals; for many it's a lot at once, though each has an expand-to-modal. Acceptable.

## 4. Trust & credibility

**Good:** Goals are framed as the patient's — the "Record a goal" path is the physician acting
as scribe (`create_goal_for_patient`), and cards show the patient-facing wording
`[verified-in-code]`. Retiring a goal is treated as a clinical event with a recorded outcome,
not a flat delete `[verified-in-code]`. The new-cycle action is guarded by a confirm dialog
`[verified-in-code]`.

- **SEV-2 — Is the EHR export clearly a *draft to review*?** `[verify-in-component]` The page
  builds `buildEhrExport(...)` and hands it to `ExportModal` as `initialText`. An
  auto-generated clinical summary should signal "review and edit before pasting", not read as
  an authoritative record. *Fix:* confirm the modal frames it as an editable draft (it likely
  is — verify in the full pass).
- **SEV-3 — Truncated patientSummary can hide clinical context.** `[verified-in-code]` Same as
  a11y #3, but the trust angle: silently dropping etiology/affected-side undermines a precise
  record. *Fix:* don't truncate safety-relevant context.

## 5. Information architecture

**Good:** The page reads as a coherent top-down narrative — who (name + summary) → when (cycle
context / week) → tools (action row) → primary action (new treatment) → goals (active, then
earlier with outcomes) `[verified-in-code]`.

- **SEV-2 — Suggestions live *inside* the "Active goals" section.** `[verified-in-code]` The
  Suggestions toggle and its panel sit under the "Active goals" heading, but patient
  suggestions are *proposed* goals awaiting review — not active goals. The nesting can imply
  they're already active. *Fix:* confirm the grouping reads as "goal-related" rather than "a
  kind of active goal"; a small subheading on the panel would disambiguate.
- **SEV-2 — Opening a panel inserts content above the primary action.** `[verified-in-code]`
  Medication/physio panels render between the action row and "Start new treatment", so the
  primary button's position shifts with panel state. Minor instability; note.
- **SEV-3 — Mixed mental model: panel vs page vs modal.** `[verified-in-code]` The page mixes
  inline panels, full-page navigations (history, suggestion detail, new goal), and modals.
  Coherent individually, but the user has three different "where did the content go" patterns.

## 6. Health literacy

**Scoping:** clinician-facing page, but it surfaces patient-authored / patient-facing text —
goal cards show `patientFacingText`, and suggestions show the patient's own words in quotes.

**Good:** Goal cards use the patient-friendly phrasing, and suggestions preserve the patient's
voice verbatim `[verified-in-code]`. The retire dialog's outcome language is plain — "achieved",
"partially achieved", "no longer suitable" — each with a hint `[verified-in-code]`.

- **SEV-3 — "Cycle" is clinical jargon.** `[verified-in-code]` Fine for this clinician audience;
  flagged only because if any cycle/"week N" framing reaches patients elsewhere it would need
  explaining. No change here.
- **SEV-3 — "Retire" a goal.** `[verified-in-code]` Clear enough for clinicians; the dialog
  carries the meaning. Minor.

---

## Priority order (this page)
1. **Header name button (DMT #1 / a11y #2)** — make the clickable name and its destination
   obvious and labelled. One fix closes a usability *and* an accessibility gap.
2. **Action-row behaviour cue (DMT #2)** — distinguish "opens here" from "navigates away".
3. **patientSummary truncation (a11y #3 / trust #2)** — don't silently hide clinical context.
4. **Suggestions-under-Active-goals (IA #1)** — a subheading to stop suggestions reading as
   active goals.
5. **Export-as-draft framing (trust #1)** — verify in the full pass.

---

### Does this look right?
If the calibration here works for you — severity, the verified-vs-needs-checking split, praise
only where earned, concrete fixes — say so and I'll produce the six app-wide per-lens documents
covering the clinician + patient + physio pages (this page's findings folded into each). If
you'd rather they be shorter/longer, more/less prescriptive, or structured differently, tell me
now and I'll recalibrate before writing six of them.
