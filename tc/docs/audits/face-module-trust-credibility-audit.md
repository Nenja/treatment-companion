# Trust & credibility audit — Face module (FaceMap + area flow)

Scope: `FaceMap` + the Standard/Face area flow, build `facemap-copy-clear`. Lens: does the
UI feel clinically trustworthy and precise, and — critically — does it avoid implying the app
*suggests* doses or muscles? It must only **record** what the clinician chose.

Tags: `[verified-in-code]` / `[needs-on-screen-check]` / `[ask a clinician]`. Dev build; not a
regulatory blocker, but trust failures here are the kind a clinician (or later a regulator)
notices fast.

---

## What's genuinely good

- **The "record only, never suggest" stance is implemented faithfully.** `[verified-in-code]`
  The component contains no recommended doses, no flagged muscles, no auto-filled clinical
  values, no warnings asserting clinical judgement. The muscle field is free text (the datalist
  is autocomplete, not a constraint — any muscle name is accepted). Every dose is clinician-
  entered. This is exactly the right posture for a recording tool and it holds throughout.
- **Precision signals are strong.** `[verified-in-code]` Exact doses are printed on every mark;
  units ("U") are always shown; laterality (R/L) is labelled; muscle names are correct
  anatomical Latin. The export is titled "Face — botulinum toxin" with a dose legend. It reads
  as a precise clinical artifact, not a sketch.
- **No fabricated confidence.** `[verified-in-code]` Nothing claims accuracy it can't have — no
  "validated", no fake certainty, no computed clinical recommendation dressed up as fact.

---

## SEV-2 — Could be read as the app suggesting clinical values

### 1. The quick-dose presets [2.5, 5, 7.5, 10, 15] U risk reading as *recommended* doses. `[verified-in-code]`
A row of preset dose buttons, in a clinical tool, can implicitly anchor or endorse those values
— which is in tension with "record only".
- **Why it matters:** the line between "entry shortcut" and "suggested dose" is exactly the line
  this tool must not cross. A clinician — or a reviewer — could read five prominent dose buttons
  as the app nudging dose selection.
- **What protects you now:** the presets are *unlabelled numbers* (no "typical", "recommended",
  "standard"), which is the safe form. So this is a latent risk, not a present violation.
- **Fix / guard:** never label them with anything implying endorsement; keep them visually as
  neutral entry shortcuts. If you want to fully neutralise the risk, make the preset set
  configurable per clinic (so they read as *your* shortcuts, not the app's recommendation), or
  reduce prominence relative to the free numeric field. At minimum, hold the line on labelling.

### 2. The fixed dose-band scale (2.5 / 5 / 7.5 / 10 / >10) can imply an app-asserted clinical standard. `[verified-in-code]`
The legend presents five fixed bands the clinician didn't define. They're only a *visual*
encoding (the exact dose is what's recorded), but the legend ("Dose: 2.5U 5U 7.5U 10U >10U")
presents them as if they were meaningful thresholds.
- **Why it matters:** fixed, app-defined bands can read as the tool asserting dose categories
  that have clinical meaning. The ">10 U" top band is the sharpest case — collapsing everything
  above 10 into one bucket could be read as "10 is a ceiling" or "above 10 is undifferentiated",
  both of which are clinical implications the tool shouldn't make.
- **What protects you now:** the exact dose is printed on each mark, so magnitude above 10 is
  never actually lost — a strong mitigation you already shipped.
- **Fix / guard:** make it clear (in framing or docs) that the bands are a display convenience,
  not clinical thresholds. Consider whether the legend should say "dose band (display only)" or
  similar. The printed number already does the real work.

---

## SEV-3 — Smaller credibility points

### 3. The exported image isn't self-identifying. `[verified-in-code]`
The PNG's *filename* now carries patient + date (good), but the image's internal title is just
"Face — botulinum toxin" — no date, patient, or clinician baked into the picture itself.
- **Why it matters:** a clinical record image that gets printed, pasted into notes, or shared
  loses its provenance once detached from the filename. Trust in a record depends on knowing
  whose it is and when.
- **Fix:** bake the date (and possibly patient initials / clinician) into the exported image.
  Watch the privacy tradeoff — initials or an ID rather than full name if it may travel.

### 4. The face-model A/B toggle makes the tool look under construction. `[verified-in-code]`
A visible "which picture do you prefer?" control signals an unfinished, experimental product
inside a clinical setting.
- **Why it matters:** credibility — clinicians trust tools that feel decided. A pilot toggle in
  the main workspace quietly undercuts that.
- **Fix:** hide behind options or badge it clearly as a pilot; collapse to one default when the
  A/B concludes. (Same control as progressive-disclosure #1 and DMT #3.)

### 5. "Standard treatment" is a vague label in a tool that otherwise reads precise. `[ask a clinician]`
- **Why it matters:** precision is a trust signal; "Standard" is a catch-all that doesn't say
  what it covers. It's the one imprecise label among otherwise exact clinical terms.
- **Fix:** a more descriptive label, chosen with a clinician. (Cross-ref DMT #10, IA, health
  literacy.)

---

## Priority order
1. **#1 + #2** — the dose presets and fixed bands are the two places the "record, don't suggest"
   line could blur. Neither is currently *violated* (unlabelled numbers, exact dose printed), but
   both deserve a deliberate guard so they can't drift. This is the highest-stakes trust item.
2. **#3** — make exported images self-identifying.
3. **#4 + #5** — the pilot toggle and the "Standard" label.
