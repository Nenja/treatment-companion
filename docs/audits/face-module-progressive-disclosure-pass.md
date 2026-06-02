# Progressive disclosure pass — Face module (FaceMap + area flow)

Scope: the `FaceMap` component and the Standard/Face area-selection flow, as they
stand in build `facemap-copy-clear`. Lens: is complexity revealed only when needed?
Is the editor popover showing the right amount at the right time?

Tags: `[verified-in-code]` = traced to source; `[needs-on-screen-check]` = structure
is confirmed but whether it *feels* cluttered needs a real screen. Dev build; not a
regulatory blocker.

---

## What's genuinely good

- **Area selection gates the entire sub-UI.** `[verified-in-code]` The FaceMap renders
  only when "Face" is checked (`{includesFace && (…)}`), and the standard muscle list only
  under "Standard". A clinician doing a limb-only treatment never sees one pixel of face
  complexity. This is the strongest disclosure boundary in the feature — the whole modality
  is hidden until chosen.
- **The editor popover is correctly scoped.** `[verified-in-code]` It appears only on tap
  and shows exactly the three decisions for one mark — dose, muscle, side — and nothing
  else. Per-mark complexity stays hidden until you're actually editing a mark. Textbook.
- **Dose entry: common path fast, full range available.** `[verified-in-code]` Five quick
  chips for the usual doses with a custom field underneath. The frequent case is one tap;
  the rare case (an odd dose) is still reachable without a mode switch. Good layering.
- **The legend adapts to mode.** `[verified-in-code]` In symbol mode the legend shows
  symbols, in colour mode it shows dots — it discloses the encoding actually in use, not both.

---

## SEV-2 — Disclosed too early / competes with the core task

### 1. The face-model (pilot A/B) toggle is always visible, equal in weight to a real setting. `[verified-in-code]`
The "Face model: Line drawing / Muscle anatomy" toggle sits permanently above the map,
styled identically to the display-mode toggle. It's a *research* control — you added it to
learn which base image clinicians prefer — yet every clinician sees it every session with
the same prominence as a genuine clinical setting.
- **Why it matters:** progressive disclosure says experimental/secondary controls shouldn't
  compete with the primary task. "Which picture do you prefer?" is not a question a clinician
  placing injections should have to field each time.
- **Fix:** demote it — smaller, lower, behind an "options" affordance, or explicitly badged
  "Pilot". When the A/B concludes, it should collapse to a single default. (Cross-ref DMT #3
  and the trust audit — same control, three lenses.)

### 2. Five action types sit below the map at once; "do the work" and "after the work" are mixed. `[needs-on-screen-check]`
`[verified-in-code]` the below-map stack is: tap hint → "+ Add a mark" → copy×2 → clear →
download. "Add" is the *doing* action; copy, clear, and download are *after you've placed
marks* actions — but they're all surfaced inline at equal weight.
- **Why it matters:** a column of five buttons dilutes the one that matters most (adding a
  mark) and presents management/finishing actions before there's anything to manage.
- **Fix:** copy and download already self-disable when not yet usable (no marks / empty
  side) and clear only appears when marks exist — so the bones of state-based disclosure are
  there. Consider grouping the "finishing" actions (copy / clear / export) visually apart from
  the primary add flow, so the map + add reads as the main act and the rest as a toolbar.

### 3. The keyboard "Add a mark" button duplicates the tap affordance at equal prominence. `[verified-in-code]`
Both the persistent "Tap the face to add a mark" hint and the explicit "+ Add a mark" button
are always shown. For a mouse/touch user these are two routes to the same thing, surfaced
equally.
- **Why it matters:** the accessibility fix (the button) is necessary, but presenting it as
  prominently as the primary interaction can make the simpler route (just tap) less obviously
  *the* way.
- **Fix:** keep the button (it's the WCAG path) but make it visually quieter than the map's
  tap affordance, so touch users gravitate to tapping and keyboard users still have the button.

---

## SEV-3 — Minor

### 4. The legend shows before any mark exists. `[verified-in-code]`
The dose legend renders even on an empty map, when it has nothing on the face to explain yet.
- **Why it matters:** very mild premature disclosure.
- **Fix:** optional — reveal once the first mark is placed. But an up-front legend also teaches
  the scale before the clinician starts, which is arguably helpful. Low priority; likely leave.

### 5. The custom-dose field is always shown alongside the chips. `[verified-in-code]`
For the common preset-dose case the custom field is extra surface.
- **Why it matters:** negligible — hiding it behind a "custom" toggle would cost a click for
  the legitimately-common custom doses in dystonia.
- **Fix:** none recommended; the always-visible field is the right call. Noted as deliberate.

---

## Priority order
1. **#1** — demote the pilot model toggle. Biggest disclosure win; it's the one control that
   shouldn't be in the clinician's face at full weight.
2. **#2 + #3** — quieten the finishing/management actions and the redundant add button so the
   map + tap reads as the primary act.
3. **#4** — optional legend-on-first-mark.
