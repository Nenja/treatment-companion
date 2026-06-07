# Accessibility audit — the clinician cockpit

**Scope.** The physician's working surfaces: `clinician/patient` (the
~2,200-line cockpit), `clinician/treatment`, and the goal charts
(`GoalProgressView`) and dialogs they open. Audited against WCAG 2.1 AA
expectations: keyboard operability, focus management, headings/landmarks, names
for controls, non-text alternatives, colour contrast, motion, and live regions.

**Method & honesty note.** Traced from the actual components and the design
tokens in `app/globals.css`. Contrast ratios below are **computed** from the
token hex values, not estimated. I can't see rendered pixels, run a screen
reader, or test on real AT, so interaction claims are "verify on device" — but
the structural facts (which hook runs, which element is which role, which token
is used where) are read directly from source.

---

## Headline

**Keyboard and focus handling is a genuine strength — better than most apps at
this stage — so the remaining gaps are narrow and mostly cheap.** The cockpit's
dialogs share one well-built hook (`useModalA11y`) that does focus-restore,
focus-on-open, a real bidirectional Tab trap, and Escape. The real gaps are: no
`<h1>` on the cockpit, charts that expose a title but not their data, no
body-scroll-lock behind modals, and one hand-rolled popover that skips the
shared hook. Colour contrast passes AA for all text.

---

## 1. Keyboard & focus — **strength, keep it**

`lib/useModalA11y(onClose)` is used by **every** cockpit dialog
(`NewCycleDialog`, `RecordGoalDrawer`, `EditGoalDrawer`, `GoalGraphModal`,
`GoalHistoryModal`, `LinkGoalModal`, `ExportModal`, `VideoPlayerModal`,
`VideoScoreQueue`, `VideoProtocolEditor`, `BaselineRecorderModal`, `ItbTrack`,
the inline **retire-goal** and **end-session** modals in `page.tsx`, and the
shared `PageHelpButton` / `EndSessionButton`). It:

- remembers the trigger element and **restores focus** to it on close (with a
  `setTimeout(0)` so it wins over a racing router push — a thoughtful detail);
- **moves focus into** the dialog on open (first focusable, else the container
  via `tabindex=-1`);
- **traps Tab** in both directions (wraps first↔last, filters disabled/hidden);
- **closes on Escape**.

Every dialog also carries `role="dialog"` + `aria-modal="true"`, and the ones I
checked name themselves via `aria-labelledby` (e.g. `new-cycle-title`,
`end-session-title`, `archive-goal-title`, `export-modal-title`). This is the
hard part of modal a11y and it's done well. **Recommendation: leave it; just
make sure new dialogs keep calling the hook** (worth a one-line note in
HANDOVER §3 so it isn't forgotten).

### [Low] One popover skips the shared hook

`components/clinician/FaceMap.tsx` is the only `role="dialog"` that does **not**
use `useModalA11y`; it hand-rolls focus (`popoverRef.focus()`) and Escape but
has **no Tab trap**. It's an anchored popover, not a blocking modal, so the
stakes are lower — but a keyboard user can Tab out of it into the page behind.
Either give it the hook or document it as an intentional non-trapping popover.

---

## 2. Headings & landmarks — **[Med] gap**

**There is no `<h1>` on the cockpit page.** Headings start at `<h2>` (goals,
panels) and `<h3>` (sub-sections). The patient's name in the header bar is not
marked as the page's top-level heading. For a screen-reader user navigating by
heading, the most important fact — *whose record am I in* — has no `h1` to land
on, and the outline starts mid-level.

**Fix (cheap):** make the patient name the `<h1>` (visually it can stay the
same size), and sanity-check that the `h2`/`h3` nesting under it has no skipped
levels. While there, confirm the main content sits in a `<main>` landmark
(the sibling pages use `<main>`; verify the cockpit does too).

---

## 3. Charts — **[Med] gap: title without data**

`GoalProgressView` renders the weekly-ratings SVG as `role="img"` with a single
`aria-label` ("Weekly ratings chart for: {goal} (higher/lower is better)").
That's the *minimum* and it's present — but for a tool where **the data is the
point**, a screen-reader user gets the chart's name and nothing else: not the
weekly values, not the trend, not the latest score.

**Fix:** pair each chart with a non-visual data path — a visually-hidden
`<table>` (week → rating, plus baseline/target/GAS level) referenced via
`aria-describedby`, or a expandable "values" list. This also future-proofs the
GAS-vs-NRS overlays. (And note: that aria-label is currently hardcoded English —
see the i18n audit, finding #2; fixing both together is natural.)

---

## 4. Colour & contrast — **pass, with one guardrail**

Computed from the tokens in `globals.css` (WCAG AA needs ≥4.5:1 normal text,
≥3.0:1 large/bold):

| Foreground | Background | Ratio | AA normal |
|---|---|---|---|
| ink `#1f2421` | cream | 14.0:1 | ✅ |
| ink-soft `#4b5450` | cream | 6.96:1 | ✅ |
| ink-muted `#686d69` | cream | 4.69:1 | ✅ (just clears) |
| ink-muted | cream-soft | 4.98:1 | ✅ |
| sage-deep `#3f5a4b` | cream | 6.73:1 | ✅ |
| on-accent `#fbf8f2` | sage-deep (button) | 7.14:1 | ✅ |
| amber-deep `#705619` | amber-soft (warning) | 4.76:1 | ✅ |
| sage-deep | sage-soft (chip) | 5.92:1 | ✅ |
| focus `#2f5563` | cream | 7.18:1 | ✅ |

All **text-bearing** pairs pass AA. The only sub-threshold token is plain `sage`
(`#5c7a6a`): as text it's 4.20:1 and white-on-`sage` is 4.45:1 — both **fail AA
for normal text**. In practice it's used only for 2.5px decorative dots
(`bg-sage/60` in `NavStyleChooser`), which are contrast-exempt, so **no current
impact**.

**[Low] Guardrail:** don't use plain `sage` for normal-size text or as a button
fill with light text — it won't pass AA. Use `sage-deep` (which does). Worth a
token note so it isn't reached for later.

**Please-verify (can't compute here):** that focus rings are actually rendered
(I see `focus:border-sage` and a `--color-focus` token, but some inputs use
`focus:outline-none` with only a border change — confirm the focus indicator is
visible against every background, especially the code input and date pickers).

---

## 5. Motion, live regions, structure — **mostly good**

- **Reduced motion:** a `@media (prefers-reduced-motion: reduce)` rule exists in
  `globals.css`, and `useModalA11y` relies on it for its entrance animation —
  good, motion-sensitive users get instant transitions.
- **Toasts:** `components/feedback/Toast.tsx` uses `role="status"` +
  `aria-live="polite"` — status changes are announced. (The *strings* in three
  cockpit toasts are hardcoded English — i18n audit #1.)
- **[Low] No body-scroll-lock while a modal is open.** `useModalA11y` traps Tab
  but doesn't lock background scroll, and `ModalPortal` only portals. On the long
  cockpit page, the background can still wheel-scroll behind a dialog — a
  disorientation/"where am I" issue more than a blocker. Add an `overflow:hidden`
  on `body` for the modal's lifetime (or a small `useScrollLock`).

---

## 6. Please-verify on device (I can't here)

- Icon-only header controls (switch-patient, end-session, info) have keyed
  `aria-label`s — confirm their **hit area is ≥44×44px** (the labels are right;
  the tap target needs eyes).
- Real screen-reader pass (NVDA/VoiceOver) through: open cockpit → open the
  record-goal drawer → save → retire a goal → end session. The structure says
  this should work; AT behaviour needs confirming.
- Date inputs (`type="date"`) and the visit-code input: keyboard entry + focus
  visibility.

---

## Punch list

| # | Fix | Where | Severity | Effort |
|---|-----|-------|----------|--------|
| 1 | Add an `<h1>` (patient name) + verify heading nesting & `<main>` | `clinician/patient/page.tsx` | Med | Small |
| 2 | Give charts a non-visual data alternative (hidden table / `aria-describedby`) | `GoalProgressView.tsx` | Med | Medium |
| 3 | Key + translate the chart aria-label (shared with i18n #2) | `GoalProgressView.tsx` | Med | Copy |
| 4 | Body-scroll-lock while any modal is open | `useModalA11y` / shared | Low | Small |
| 5 | Give `FaceMap` popover the shared hook (or document the exception) | `FaceMap.tsx` | Low | Small |
| 6 | Token note: never use plain `sage` for text/light-on-fill | design tokens / HANDOVER §3 | Low | Doc |
| 7 | Verify focus-ring visibility + 44px icon targets on device | cockpit | — | QA |

**Net read.** The expensive, easy-to-get-wrong layer (modal focus management) is
already right and consistent. What's left is a missing `h1`, a data-alternative
for charts, and three small hardening items — none of which needs the database,
and #1/#4/#5 are quick.
