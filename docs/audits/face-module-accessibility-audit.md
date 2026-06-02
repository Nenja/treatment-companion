# Accessibility audit (WCAG 2.1 AA) — Face module (FaceMap)

Scope: the `FaceMap` tap-to-place component and its controls. Lens: WCAG 2.1 AA —
keyboard operability, focus, screen-reader semantics, colour contrast, the
colour-vs-symbol question for colourblind users, and touch-target sizing.

**Method.** Contrast values below are **computed** from the actual palette
(`app/globals.css` `@theme` tokens) and the dose colours in the component — they
are real ratios, not estimates. Findings that depend on rendered layout are
tagged `[needs-on-screen-check]`. Colour values are exact; everything labelled
with a ratio is `[verified-in-code]`.

Dev build; not a regulatory blocker. But accessibility debt is cheapest to fix
now, and the colour finding below is a genuine patient-safety-adjacent issue, not
a checkbox.

---

## Headline finding (read this first)

**The symbol mode does NOT fully solve the colourblind problem — because the
colour mode was never really conveying dose by *hue* in the first place. The dose
ramp is a single green getting darker, so the bands are separated by *lightness*,
and lightness collapses for everyone — colourblind or not.**

Measured adjacent-band contrast on the five dose dots (`#a9c2b3 → #6f9482 →
#3f5a4b → #2a3f33 → #16201a`):

| Adjacent bands | Normal vision | Deuteranopia | Protanopia | Tritanopia |
|---|---|---|---|---|
| 2.5U vs 5U | 1.77:1 | 1.93 | 1.89 | 1.83 |
| 5U vs 7.5U | 2.25:1 | 2.20 | 2.21 | 2.23 |
| 7.5U vs 10U | 1.49:1 | 1.43 | 1.45 | 1.46 |
| 10U vs >10U | 1.48:1 | 1.36 | 1.39 | 1.42 |

Two things this proves:
1. **Colourblindness barely changes the numbers** — because the ramp is
   monochromatic. The simulation columns track the normal-vision column closely.
   So "we added symbols for colourblind users" addresses a problem the design
   doesn't actually have, while missing the real one.
2. **The real problem affects everyone:** bands 3→4→5 differ by ~1.5:1, far below
   any reliable distinguishability threshold. On a 3px dot over a textured,
   skin-toned face, **no clinician — fully sighted included — can reliably tell a
   7.5U mark from a 10U from a >10U by colour.** The darkest three are mud.

This is the most important accessibility finding and it's also a plain usability
finding. See SEV-1 #1.

---

## SEV-1 — Must fix for AA / for the feature to do its job

### 1. The dose colour ramp is not distinguishable (all users) and fails as a colour channel. `[verified-in-code]`
Numbers above. WCAG 1.4.11 (non-text contrast) wants ≥3:1 for meaningful graphical
objects against adjacent colours; the dose bands sit at 1.5–2.3:1 against each other.
- **Why it matters:** dose is the single most safety-relevant attribute on the map.
  An encoding that can't separate 7.5/10/>10 means the visual map can mislead about
  dose magnitude. Symbol mode helps (shapes are categorical, see #2) but is opt-in and
  has its own sizing problem.
- **Fix options (pick one, all better than the current ramp):**
  a. **Re-space the ramp for lightness, not hue** — pick 5 steps with monotonic,
     well-separated luminance (e.g. near-white → mid → black with ≥3:1 between
     neighbours), so it works in greyscale and for everyone. This is the smallest change.
  b. **Make symbol mode the default** (shape is colourblind-safe by construction) and
     keep colour as the option.
  c. **Always show the numeric dose** on/next to the mark, making colour decorative
     rather than load-bearing. Most robust; see Don't-Make-Me-Think #8.

### 2. Symbol mode's marks are likely below the perceptual + touch size needed. `[needs-on-screen-check]`
`[verified-in-code]` symbols render at `s = 3` in image units inside a 198-unit-wide
viewBox that scales to the container width. On a ~360px-wide phone the whole 198-unit
field is ~360px, so 1 image unit ≈ 1.8px → a symbol is ~11px across, and the
distinguishing detail (○ vs ◆ vs ✕) is a few px. The white backing circle is r4.2 (~15px).
- **Why it matters:** WCAG 1.4.11 + plain legibility — if a clinician can't tell ○ from
  ◇ at a glance, symbol mode doesn't rescue the dose encoding either. And the *tap* target
  (next item) is separate from the *visible* glyph.
- **Fix:** confirm on a real phone; if the glyphs are too fine, increase `s` and the
  backing radius, or render the dose number instead of/with the glyph.

### 3. The whole canvas is one tappable surface with no keyboard way to *place* a mark. `[verified-in-code]`
Placing a new mark is `onClick` on the SVG (line 465). Existing marks are keyboard-
reachable (each `<g>` has `tabIndex=0` + Enter/Space → edit, lines 486–498 — good), but
there is **no keyboard path to create a mark**: you must click a position. A keyboard-only
or switch-access clinician can edit/delete existing marks but cannot add one.
- **Why it matters:** WCAG 2.1.1 (Keyboard) — all functionality must be keyboard-operable.
  Creation is currently mouse/touch-only.
- **Fix:** provide a non-spatial "Add a mark" button that opens the editor with a default
  position (e.g. midline, mid-face) that the clinician then adjusts — or allow entering a
  mark by muscle without a position. Even a basic "Add mark" button clears the 2.1.1 fail.
- **Caveat:** for a fundamentally spatial tool this is genuinely hard to make *good* for
  keyboard users; the button is the floor, not a great experience. Flag for design.

---

## SEV-2 — AA gaps, fix soon

### 4. Input fields and inactive toggles have invisible borders. `[verified-in-code]`
The `stone` border (`#e5dfd3`) against `cream`/`cream-soft` inputs computes at **1.18:1 /
1.25:1** — essentially invisible. The dose number field, muscle field, and all inactive
pill toggles rely on this border to signal "this is an editable control."
- **Why it matters:** WCAG 1.4.11 wants ≥3:1 for the visual boundary of input components.
  At ~1.2:1 the field edges are decorative, not perceivable — users may not see where to
  type, especially in bright clinic lighting.
- **Fix:** darken the input/control border to ≥3:1 vs its background (somewhere around
  `ink-muted`/`#686d69` gives 1.8:1 — still short; you need roughly `#9a9488` or darker for
  3:1). Active controls are fine (sage-deep edge = 6.73:1).

### 5. The mark's white ring vanishes on light skin / cream. `[verified-in-code]`
Marks are drawn as a white ring (`#ffffff`) behind a coloured/symbol core. White vs the
cream face background is **1.13:1** — the ring that's supposed to separate the mark from
the face is itself invisible against light regions of the image.
- **Why it matters:** the ring is the mark's figure-ground separator (1.4.11). On the
  forehead/light areas it does nothing, so a pale band-0/band-1 dot (which is also low
  contrast, #5 in colour) can disappear.
- **Fix:** give the ring a dark outline too (it already has a 0.7px `#1f2421` stroke on the
  colour-mode outer ring — verify that's enough; the symbol-mode backing has no dark edge
  at all, line 508, and should get one).

### 6. The R / L side labels fail text contrast. `[verified-in-code]`
The "R"/"L" labels flanking the face use `#9a7c64` on cream = **3.43:1**. As small bold
text (8px, scaled) the AA threshold is 4.5:1 (they're not "large").
- **Why it matters:** WCAG 1.4.3. R/L is laterality — clinically meaningful, not decorative.
- **Fix:** darken to ≥4.5:1 (e.g. `ink-soft` `#4b5450` = 6.96:1). Same applies to the
  export's R/L text (same colour, line 235–236).

### 7. Two text tokens miss AA on their backgrounds. `[verified-in-code]`
- Summary-box caption: `ink-muted` on `stone-soft` = **4.40:1** (needs 4.5). The big number
  above it is fine (6.31:1); the small uppercase caption is the miss.
- Disabled save-button text: `ink-muted` on `stone` = **3.98:1** (needs 4.5). Disabled
  controls are exempt from AA *only* if truly inactive — but this text still communicates
  ("Save", greyed), so treat it as needing contrast.
- The active dose quick-pick chip uses `on-accent` on **`sage`** (not sage-deep) = **4.45:1**
  — a hair under 4.5 for normal text (line 536). Every other active control uses sage-deep
  (7.14:1) and passes; this one chip is the outlier.
- **Fix:** nudge each: caption → `ink-soft`; disabled text → darker; the chip → use
  `sage-deep` like the side/toggle active states for consistency and to clear 4.5.

---

## SEV-3 — Semantics & polish

### 8. The popover isn't a dialog and doesn't trap focus. `[verified-in-code]`
The editor is a plain `<div>` with no `role="dialog"`, no `aria-modal`, no focus trap, and
no autofocus into it. Opening it leaves keyboard focus behind on the canvas; there's no
Escape-to-close handler shown.
- **Why it matters:** WCAG 4.1.2 / 2.4.3 focus order. A screen-reader user who triggers the
  editor (via an existing mark) gets no announcement that a dialog opened, and Tab may walk
  the page behind it.
- **Fix:** `role="dialog"` + `aria-label` (new vs edit), move focus to the first field on
  open, return it on close, and add Escape-to-cancel. (The mark `role="button"` semantics are
  otherwise good.)

### 9. Toggles don't expose selected state to assistive tech consistently. `[verified-in-code]`
The face-model toggle buttons have `aria-pressed` (good, lines added in the model-toggle
change), but the colour/symbol display-mode buttons and the dose/side pickers convey
"selected" only through Tailwind classes (filled background), **no `aria-pressed` /
`aria-selected`** (lines 388–407, 530–542, 574–587). A screen-reader user can't tell which
mode/dose/side is active.
- **Why it matters:** WCAG 4.1.2 — state must be programmatically determinable.
- **Fix:** add `aria-pressed={displayMode==='color'}` etc. to every toggle group, matching
  what the model toggle already does.

### 10. The SVG canvas has a label but no role; marks have good labels. `[verified-in-code]`
`aria-label={canvasAria}` on the `<svg>` (line 466) is helpful, but the SVG has no
`role="application"`/`"group"` and, combined with #3, a SR user hears a label but has no
creation action. Marks themselves are well-labelled (muscle, side, dose, edit hint — line
481) — that part is good and worth keeping.
- **Fix:** pairs with #3; once a non-spatial add exists, give the canvas an appropriate role
  and ensure the marks list is navigable as a group.

### 11. Colour/symbol live in `displayMode` (persisted) but face-model doesn't — fine, just note. `[verified-in-code]`
Not an a11y defect: display mode is a real per-cycle setting; the model toggle is a local
pilot preference. Flagging only so a future "remember my colourblind-safe mode" preference
isn't accidentally tied to the wrong one. If a clinician sets symbol mode for accessibility,
make sure that choice persists (it does, via the cycle) — good.

---

## Contrast reference (computed, for fixing)

PASS (keep): ink on cream 14.0:1 · ink on cream-soft 14.9:1 · ink-soft on cream 6.96:1 ·
ink-soft on cream-soft 7.38:1 · on-accent on sage-deep 7.14:1 · sage-deep on stone-soft
6.31:1 · amber-deep (validation) on cream-soft 6.53:1 · focus ring on cream 7.18:1 · delete
text #9a3b3b on cream 6.09:1.

FAIL (fix): stone border on cream 1.18:1 · stone border on cream-soft 1.25:1 · white mark
ring on cream 1.13:1 · R/L #9a7c64 on cream 3.43:1 · ink-muted on stone-soft 4.40:1 ·
ink-muted on stone (disabled) 3.98:1 · on-accent on **sage** (quick-pick active) 4.45:1 ·
**every adjacent dose-band pair** 1.48–2.25:1.

---

## Priority order
1. **#1 (dose ramp) + #2 (symbol size)** — the dose encoding doesn't reliably work for
   anyone; this is the headline. Re-space for luminance and/or default to numbers/symbols.
2. **#3 (keyboard create)** — the only outright 2.1.1 functional fail. Add a non-spatial
   "Add mark" path.
3. **#4 + #5 + #6 (invisible borders, mark ring, R/L)** — perceivability of controls and
   laterality.
4. **#7 (sub-4.5 text)** — three small token nudges.
5. **#8 + #9 + #10 (dialog semantics, aria-pressed, canvas role)** — screen-reader
   correctness.
