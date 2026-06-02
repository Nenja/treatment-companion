# "Don't Make Me Think" audit — Face module (FaceMap + treatment-area flow)

Scope: the `FaceMap` component (tap-to-place facial injection mapping) and the
Standard / Face area-selection flow on the clinician treatment page. Lens: Krug's
self-evidence principle — every interaction should be obvious without instruction;
flag anything that creates a moment of "what do I do / what just happened?".

**A note on method.** Each finding is tagged so you know how far to trust it:
- `[verified-in-code]` — traced to the source; the behaviour is definitely as described.
- `[needs-on-screen-check]` — the code implies this, but only your eyes on a real
  screen/phone can confirm (spacing, overflow, perceived affordance).

This is a dev build; nothing here is a regulatory blocker. Severity is about user
confusion, not compliance.

---

## What's genuinely good (earned, not padding)

- **Tap-to-place with auto-side is the right model.** `[verified-in-code]` Tapping the
  face opens an editor pre-seeded with the side derived from where you tapped
  (`sideFromX`), and the side is overridable. That's recognition-over-recall done
  well: the clinician points at the anatomy instead of filling a form.
- **The save button enforces the data rule instead of explaining it.** `[verified-in-code]`
  Save is disabled until both a dose and a muscle exist (`editorValid`), and a one-line
  reason appears (`needDoseAndMuscle`). The system prevents the error rather than
  scolding after it.
- **The running summary answers the question the clinician actually has.** `[verified-in-code]`
  Total / Left / Right / count update live. "How much have I put where" is visible
  without tapping into anything.

---

## SEV-1 — Real confusion, fix before pilot

### 1. Nothing tells the clinician to tap the face when marks already exist. `[verified-in-code]`
The only "tap to add" instruction (`emptyHint`) renders **only when `marks.length === 0`**
(line 629). The moment there's one mark, the hint disappears — so a clinician who places
one mark and then wonders "how do I add another?" gets no on-screen cue. The affordance
(a crosshair cursor) is desktop-only and invisible on the touch devices this tool targets.
- **Why it matters:** the core action of the tool becomes a guess after the first use.
  Krug's first law: the primary action must be self-evident, always — not just on an empty
  canvas.
- **Fix:** keep a persistent, quiet instruction near the image regardless of mark count
  (e.g. "Tap the face to add a mark; tap a mark to edit"). It can shrink after the first
  mark, but it must not vanish.

### 2. "Tap a mark to edit/remove" is never stated; it's only in a screen-reader label. `[verified-in-code]`
The edit affordance is communicated solely through the per-mark `aria-label`
(`…${t('editHint')}`, line 481) — invisible to sighted users. A sighted clinician has no
on-screen indication that an existing dot is tappable, or that tapping it is how you
delete a misplaced mark.
- **Why it matters:** correcting a mistake (the most stressful moment) relies on
  undiscoverable knowledge. People who can't find "undo" feel the interface is fighting them.
- **Fix:** include "tap a mark to edit or remove" in the persistent instruction from #1.
  Optionally a subtle hover/active state on marks (desktop) — but the text cue is the
  must-have.

### 3. The two toggles + legend stack above the image with no spatial link to it. `[needs-on-screen-check]`
`[verified-in-code]` the order is: colour/symbol toggle, then face-model toggle, then dose
legend, then the image. That's three control rows before the thing they act on. On a phone
the clinician may not connect "Colour dots / Symbols" and "Line drawing / Muscle anatomy"
to the face below — especially since both toggles use identical pill styling, so they read
as one four-option group rather than two independent binary choices.
- **Why it matters:** Krug — visual grouping should mirror logical grouping. Two unrelated
  decisions rendered identically invites the "wait, which of these four am I picking?"
  pause you saw me make mistakes about elsewhere.
- **Fix (needs your eyes to tune):** give the two toggles clearly different weight — e.g.
  the display-mode (colour/symbol) toggle is a real clinical choice and stays prominent;
  the face-model A/B toggle is a pilot experiment and could be smaller / lower / labelled
  "Pilot:". At minimum, more vertical separation and a label per group so they don't read
  as one row.

---

## SEV-2 — Friction, fix soon

### 4. "Cancel" vs "Remove" is the same button wearing two hats. `[verified-in-code]`
The left popover button is `t('cancel')` for a new mark and `t('remove')` for an existing
one (line 599), and it's styled red (`#9a3b3b`) in both cases. For a *new, unsaved* mark,
a red "Cancel" implies destruction of something that doesn't exist yet, and shares colour
with the genuinely destructive "Remove".
- **Why it matters:** colour is a signal; using the danger colour for a harmless "never
  mind" dilutes it for the real delete. Momentary "will this delete something?" hesitation.
- **Fix:** make "Cancel" (new-mark case) a neutral/secondary button; reserve the red
  treatment for "Remove" (existing-mark case) only.

### 5. The dose legend doesn't say what it's the legend *for*. `[needs-on-screen-check]`
`[verified-in-code]` the legend reads "Dose by colour:" then five swatches — but the bands
(2.5 / 5 / 7.5 / 10 / >10 U) are a fixed scale the clinician didn't choose, and nothing
explains that a mark's dot colour is *derived from* the dose they typed. A clinician may
expect to pick a colour, or wonder why their 6 U mark is the same colour as a 5 U one.
- **Why it matters:** an unexplained mapping invites a wrong mental model ("do I choose
  the colour?"). The colour is an *output*, not an input — that should be obvious.
- **Fix:** a half-line of framing ("Dot colour shows the dose band:") makes the
  direction of causation clear. (See the accessibility audit for the bigger problem that
  these bands are nearly indistinguishable by colour anyway.)

### 6. The custom-dose field's relationship to the quick-pick chips is implicit. `[verified-in-code]`
Tapping a quick-pick chip (2.5/5/7.5/10/15) sets the dose; the number input shows a value
*only* when it isn't one of those chips (line 549). So typing 6 clears the chip selection,
and tapping a chip empties the field — correct behaviour, but never explained. A clinician
who types into the box and sees the chips deselect may think something glitched.
- **Why it matters:** silent coupling between two controls reads as a bug the first time.
- **Fix:** a tiny "or type a custom dose" label between the chips and the field (the field
  already has a placeholder, but the *relationship* is the unclear part).

---

## SEV-3 — Polish

### 7. The download button shows "…" while working but never says what it produced. `[verified-in-code]`
`downloadPng` swaps the label to "…" during work (line 627) but there's no success
confirmation — the file just appears in the browser's downloads. On mobile especially,
a clinician may not notice the download happened and tap again.
- **Why it matters:** invisible system status (Nielsen #1, and Krug's "did that work?").
- **Fix:** brief toast on success ("Image saved"), and consider naming the patient/date in
  the filename so the saved file is self-identifying (currently always `face-dosing.png`,
  which collides across patients in a downloads folder).

### 8. "> 10 U" band hides real dose magnitude on the face. `[verified-in-code]`
Any dose above 10 collapses into band 4 (`bandIndex`), so a 12 U and a 40 U mark look
identical on the map. The exact value is preserved in the data and the summary total, so
this is a visual-encoding limitation, not data loss.
- **Why it matters:** low-stakes (the number is recoverable), but a clinician scanning the
  map can't see an outlier dose.
- **Fix:** optional — show the numeric dose on/beside the mark on hover/tap, or in the
  per-mark edit view (which already shows it). No urgency.

---

## Treatment-area flow (Standard / Face / both)

### 9. The area selector is clear, and the conditional reveal is correct. `[verified-in-code]`
The two checkboxes ("Standard treatment" / "Face treatment", ≥1 required), with the muscle
list shown only under Standard and the FaceMap only under Face, is a sound disclosure model
(see the progressive-disclosure pass for depth). The validation lists the missing area
plainly. No SEV-1/2 confusion here in the code.

### 10. `[needs-on-screen-check]` — does a clinician understand "Standard" vs "Face"?
The labels are "Standard treatment" and "Face treatment". For a botulinum-toxin clinician
treating both limb spasticity and facial dystonia, "Standard" is a slightly abstract label
for "everything that isn't the face." This is a wording/comprehension question I can't
resolve from code — it needs a real clinician's reaction.
- **Fix (pending user/clinician input):** consider whether "Body / limb treatment" or
  similar reads more concretely than "Standard". Not a code problem — a naming decision.

---

## Priority order
1. **#1 + #2** — persistent tap-to-add / tap-to-edit instruction. One small text element
   fixes the single biggest "what do I do now" gap. **Do first.**
2. **#3** — disentangle the two toggles so they don't read as one four-way control.
3. **#4, #6** — button-role and quick-pick/custom coupling clarity.
4. **#5, #7, #8** — legend framing, download confirmation, dose magnitude.
5. **#10** — "Standard" naming: take to a clinician.
