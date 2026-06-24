# Health literacy audit — Face module (FaceMap + area flow)

Scope: labels and any patient-visible text in `FaceMap` + the Standard/Face area flow, build
`facemap-copy-clear`. Lens: plain, unambiguous language; appropriate reading level; clinical
terms used correctly.

Tags: `[verified-in-code]` / `[needs-on-screen-check]` / `[ask a clinician]`. Dev build; not a
regulatory blocker.

---

## Scoping note (read first)

The FaceMap is **clinician-facing** — it lives under `/clinician/treatment`, used by medical
professionals. So anatomical Latin (Frontalis, Corrugator supercilii, Orbicularis oculi) is
**correct and precise for this audience**, not a health-literacy problem. The lens therefore
applies to two things: (a) any text that can reach a *patient*, and (b) the plain-language
clarity of the *non-anatomical* UI labels. I've judged it on those, not on "is the Latin too
hard" — it shouldn't be dumbed down for clinicians.

---

## What's genuinely good

- **Instructional text is plain and low reading level.** `[verified-in-code]` "Tap the face to
  add a mark. Tap a mark to edit or remove it.", "Clear all marks?", "Dose (units)", "Muscle
  (required)", "Side" — direct, jargon-free where jargon isn't required, action-first. A
  non-specialist could follow the *mechanics* even though the clinical content is specialist.
- **The validation message is a model of clarity.** `[verified-in-code]` "Set a dose and a
  muscle name to save this mark." — says exactly what's missing and exactly what to do. This is
  excellent plain-language error writing.
- **Abbreviations are sensible for the audience and backed by full words.** `[verified-in-code]`
  "U" for units; "R"/"L" for right/left, with the full words exposed in the per-mark aria-label.

---

## SEV-2 — Language that could mislead

### 1. The exported PNG may exceed patient reading level — *if* it ever reaches patients. `[needs-on-screen-check]`
`[verified-in-code]` the export shows "Face — botulinum toxin", anatomical Latin per mark, and
the dose bands. For a clinician/record audience that's correct. But if a clinician hands this
image to a patient, the Latin, "botulinum toxin", and an unexplained ">10 U" band are well above
typical patient reading level.
- **Why it matters:** the same artifact is precise for one audience and opaque for another;
  health literacy depends on matching the reader.
- **Fix:** decide the export's intended audience. If clinician/EHR only — no change. If ever
  patient-facing — it needs a plain-language variant (lay muscle descriptions, "anti-wrinkle/
  muscle-relaxing injection" framing, explained doses). Most likely clinician-only; confirm.

### 2. "Standard treatment" is vague language. `[ask a clinician]`
"Standard" doesn't say what it covers (limbs? body? everything non-face?). Vague for clinicians,
and more so if ever patient-seen.
- **Why it matters:** plain, unambiguous labelling — a catch-all word forces the reader to infer.
- **Fix:** a descriptive label chosen with a clinician (e.g. body/limb treatment, if that's what
  it means). Cross-ref DMT #10, trust #5, IA #1 — same label, multiple lenses.

---

## SEV-3 — Smaller wording points

### 3. "M" for the midline/bilateral side button is ambiguous. `[verified-in-code]`
The side options are right / **bilateral** / left, but the middle button shows "M" (`sideMidShort`).
"M" can read as Medial, Middle, or Midline, and none of those is the underlying value, which is
*bilateral*.
- **Why it matters:** the short label doesn't map cleanly to the concept it stores; a clinician
  could second-guess what "M" commits to.
- **Fix:** reconcile label and concept. If the value means bilateral, consider "Bil."; if it means
  centre/midline placement, "Mid" is clearer than "M". Check the full-word form behind
  `sideMidShort` too, so the expanded text is unambiguous.

### 4. "> 10 U" uses a math symbol and a magnitude-hiding band. `[verified-in-code]`
Fine for clinicians; the only non-plain element in the legend. The printed exact dose on each
mark mitigates any misreading.
- **Why it matters:** minor; flagged for completeness.
- **Fix:** none needed for a clinician audience.

---

## Priority order
1. **#1** — settle the export's audience; it's the one place specialist text could land in front
   of a patient. Everything else is clinician-only and appropriately specialist.
2. **#2** — the "Standard" label (with a clinician).
3. **#3** — disambiguate the "M"/bilateral side button.
