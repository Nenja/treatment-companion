# Information architecture review — Face module (FaceMap + area flow)

Scope: where the face module sits in the treatment flow, the Standard/Face/both model, and the
coherence of marks → summary → export. Build `facemap-copy-clear`.

Tags: `[verified-in-code]` / `[needs-on-screen-check]` / `[ask a clinician]`. Dev build; not a
regulatory blocker.

---

## Current structure (verified-in-code)

- **Treatment page:** area selector (in the LEFT "For reference" column) → main form (date,
  drug, dilution, guidance) → `{Standard → muscle list}` → `{Face → FaceMap}` → cycle totals
  (computed by the page) → save. Export is separate: the EHR export (text/structured) and the
  FaceMap PNG download.
- **Inside FaceMap:** display + model toggles → dose legend → the map → marks → below-map
  actions (add / copy×2 / clear / download).

---

## What's genuinely good

- **The Standard / Face / both model is structurally clean.** `[verified-in-code]` Two
  independent flags, each gating its own section, at least one required, validated, and both
  carried into a single cycle (standard injections + face marks). One treatment cycle, two
  optional modalities — coherent and correct.
- **Marks → export is faithful.** `[verified-in-code]` The PNG renders exactly the marks placed,
  in the same display mode, with the same legend — what you see is what you export. The EHR text
  export lists face injections as a separate group from standard. Consistent across surfaces.
- **Placement in the overall flow is logical.** `[verified-in-code]` Area first (what am I
  recording), then the recording surface, then save. The FaceMap appears exactly where "record
  the face treatment" belongs in the cycle.

---

## SEV-2 — IA tensions worth resolving

### 1. The area selector — a primary input — lives in the "For reference" column. `[needs-on-screen-check]`
`[verified-in-code]` the Standard/Face checkboxes sit at the top of the left column, which is
otherwise "For reference" context (last treatment, medication). But these checkboxes *decide the
entire form*.
- **Why it matters:** IA principle — controls that drive the form belong on the form's primary
  axis, not in a column connoting read-only context. The thing that determines "what am I
  recording" is currently filed under "reference".
- **History:** it was moved there at your request and to fix a compact-mode layout bug, so this is
  a known tradeoff, not an oversight.
- **Fix:** confirm on-screen how it reads. If the left column scans as "context", the selector
  arguably belongs atop the main form. If it reads as "settings for this record", it's fine where
  it is. This is a judgement call the rendered page settles.

### 2. With the on-map summary removed, the face dose total no longer sits near the marks. `[verified-in-code]`
The page still computes the cycle total (`standardDosesSum + faceDosesSum`), but the FaceMap
itself now shows no running total or per-side breakdown adjacent to the work.
- **Why it matters:** feedback locality — after placing several face marks, "how much have I put
  on the face, and how is it split L/R" is now answered only by the combined total elsewhere on
  the page, not next to the map where the decision is happening.
- **History:** you asked to remove the four-box summary, so this is by request — flagged only so
  the *consequence* is explicit.
- **Fix (optional):** if clinicians miss the local readout, a single compact "Face total: N U"
  line near the map would restore the feedback loop without bringing back the four-box clutter
  you removed.

---

## SEV-3 — Smaller IA points

### 3. Two export mechanisms, unclear relationship. `[verified-in-code]`
The FaceMap PNG (download) and the EHR export (text/structured) are separate. A clinician may not
know whether the PNG is part of the EHR record or a standalone artifact, or which to use when.
- **Why it matters:** ambiguity about where the authoritative record lives.
- **Fix:** one clarifying sentence — is the PNG included in the EHR export, or a separate
  shareable image? Decide and state it.

### 4. The two toggles group a real setting with a pilot. `[verified-in-code]`
Display-mode (a genuine clinical display choice) and face-model (a pilot A/B) sit together above
the map as if equivalent.
- **Why it matters:** IA groups things by kind; these are different kinds. (Cross-ref progressive
  disclosure #1, trust #4, DMT #3.)
- **Fix:** separate the pilot toggle from the real setting.

---

## Priority order
1. **#1** — resolve whether the area selector reads as "input" or "reference" on screen; it's the
   one structural decision that affects how the whole form is understood.
2. **#2** — decide if the removed local face-total needs a one-line replacement.
3. **#3 + #4** — clarify the two exports; separate the pilot toggle.
