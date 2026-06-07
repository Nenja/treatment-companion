# Treatment Companion — visual coherence audit

_Static (code-level) audit. Date: 2026-06-04. Build at audit: `patient-home-treated-muscles`._

## What this is, and its one big limitation

I audited the **code** for the mechanical signals of visual coherence: design-token
adherence, the typography and spacing scales, repeated component patterns (cards,
buttons, modals), colour semantics, theming, and localisation gaps. Every finding
below is backed by a grep across `app/` and `components/`.

**I cannot see the app rendered** — no running dev server, no pixels, no device. So
this report does two things: (1) lists inconsistencies I can prove from the code, and
(2) gives you a prioritised list of screens to *look at*, because some kinds of
incoherence only show up on screen. Treat every flag as "likely worth a look", not
"confirmed broken".

## Overall verdict

The foundation is genuinely solid. The colour-token system is used almost everywhere
(no rogue `text-gray-500`/`bg-white-ish` Tailwind palette utilities), border-radius
goes through the radius tokens 336 times, **all 12 modals share an identical overlay**
(`fixed inset-0 z-50` + `bg-ink/40` + `useModalA11y`), spacing sits on a consistent
scale, and localisation discipline on attributes is 100% (zero hardcoded
`aria-label` / `placeholder` / `title`). That's better than most codebases.

The drift is concentrated in a few places — most of it traceable to **two missing
abstractions**: there is no shared `Button` component, and there is no central type
scale. Fix those two and most of the rest follows.

---

## Findings by priority

### HIGH

**H1 — No shared `Button`; 204 hand-rolled buttons across 6 heights.**
Every button sets its own height, padding, radius, and weight by hand. Heights in use:

| height | count | likely role |
|--------|-------|-------------|
| h-12   | 48    | primary |
| h-11   | 35    | primary (competing with h-12) |
| h-8    | 13    | small |
| h-10   | 11    | small/medium |
| h-9    | 8     | small |
| h-14   | 4     | large/one-off |

`h-11` and `h-12` are both used heavily for what look like primary buttons, so a
"primary button" is two different heights depending on the screen. This is the single
biggest driver of visual drift and the hardest to eyeball-audit (it's spread over 204
sites). Recommendation: introduce a `Button` component (`variant` + `size`) and migrate
incrementally. (My own recent buttons are hand-rolled too — see "Recent additions".)

**H2 — Danish gap: the GAS rating UI renders English even in Danish.**
The only hardcoded user-facing English left in the app is the goal-attainment (GAS)
rating step:
- `components/wizard/GasGoalRatingPicker.tsx:41,71,148` — level meanings ("Much better
  than expected" …) and the prompts.
- `app/[locale]/checkin/page.tsx:52` — `gasLevelMeaning()`.

This hits any patient with a GAS goal during their weekly check-in, in Danish. It's a
real bilingual-coherence defect (everything around it is translated). Fix: move these
strings into `messages/{en,da}.json` like the rest. (I can do this on request.)

### MEDIUM

**M1 — Type-scale sprawl (~18 distinct sizes, no central scale).**
All text uses arbitrary `text-[Npx]` (no default `text-sm` etc. mixed in — good), but
there are 18 distinct sizes. The body range is fine-grained (10/11/12/13/14/15/16) and
the **heading range has near-duplicate steps**: 18, 20, 22, 24, 26, 28, 30, 32 (plus
44, 72 for hero numerals). With no shared scale, a "section heading" lands on 20 on one
screen and 22 or 24 on another. This is why headings can feel subtly inconsistent
page-to-page. Recommendation: collapse to ~6–7 named steps.

**M2 — Card surface + border-opacity drift.**
Card *radius* is consistent (all via `--radius-card`). What varies:
- Surface: `bg-cream-soft` (199) vs `bg-cream` (133) are both used as the card
  background, and they're very close shades — so some cards are fractionally
  lighter/darker than others with no obvious rule.
- Border opacity: `border-stone` (251) is the convention, but `border-stone/70` (38),
  `/60` (6), and `border-sage/30` (4) `/40` (8) `/50` (9) all coexist — several
  almost-identical border treatments. `border-ink` (3) is unusually heavy and may be a
  one-off.

Recommendation: pick one card surface + one default border, document the exceptions.

**M3 — Icon-size spread.**
Inline SVG icons that sit inside buttons use 14, 15, 16, 17, and 18px more or less
interchangeably, so icons in similar buttons don't quite match. Also one **non-square**
icon: `h-8 w-9` (a 32×36 box) — likely a typo worth checking. Recommendation:
standardise to ~2 icon sizes (e.g. 16 inline, 20 standalone).

### LOW

**L1 — Off-palette red, and a few tokens hardcoded as hex.**
There's **no dark mode** in the app, so hardcoded hex is a maintainability/consistency
issue, not a theming break. Two sub-cases:
- An off-palette red (`#9a3b3b` text, `#d8b9b9` border) is used for destructive /
  recording cues in `FaceMap.tsx` (remove-mark) and `GoalVideoRecorder.tsx`. The token
  palette has no red, so this is a deliberate choice — but it lives outside the system.
  Decide whether to add a `danger`/`recording` token.
- A few token *values* are written as raw hex instead of referencing the token, e.g.
  `Skeleton.tsx` uses `#E5DFD3` (that's `--color-stone`), and `FaceMap.tsx` has
  `#1f2421`/`#3f5a4b` (ink / sage-deep). Cosmetic; tidy when convenient. (Most of the
  43 hex hits are SVG fills/strokes in `FaceMap`, which is normal for SVG.)

**L2 — 11 small elements use default `rounded-md`/`-sm`.**
Chips, toasts, skeletons (`VisitChanges`, `Toast`, `Skeleton`, `ExportModal`,
`GasCutPoints`, `NotificationsCard`, `AppearanceSettings`, `CycleAnalysisViews`). The
radius-token set only defines `card` (1.25rem) and `button` (0.875rem) — there's **no
small-radius token**, so `rounded-md` on a chip is defensible. Consider adding
`--radius-chip` so even these go through the system.

**L3 — One `bg-white`.** A single card/element uses bare `bg-white` instead of
`bg-cream`/`bg-cream-soft` — one off-convention surface to track down.

**L4 — Modal widths vary; inline vs portal split.** Overlays are identical, but dialog
*widths* differ (`max-w-2xl` for the goal graph, `max-w-md` for treated-muscles, others
elsewhere) — fine if intentional. Also most modals render their overlay inline while 2
use `ModalPortal`; inline overlays can be clipped if an ancestor has `overflow`/
`transform`. Worth a quick check on a phone (see checklist).

**L5 — Section rhythm.** Vertical section gaps use mt-5/6/7/8/9/10 somewhat
interchangeably; `mt-7` (9×), `mt-9` (1×), `mt-12` (1×) look like one-offs. Minor.

---

## Screens for you to look at (prioritised)

Because I can't see render output, please eyeball these — each maps to a finding:

1. **Danish + a GAS goal → weekly check-in rating step.** Confirm the level meanings and
   prompts appear in English (they will). _[H2]_
2. **Primary buttons across patient home, the check-in wizard, and the clinician patient
   page.** Do they look the same height/weight/radius, or do some sit taller (h-12 vs
   h-11)? _[H1]_
3. **Scroll each page and compare section headings.** Do they read as one scale, or do
   some pages have slightly larger/smaller headings? _[M1]_
4. **Cards on the patient home vs the clinician page side by side.** Are the card
   backgrounds the same cream, and do border weights match? _[M2]_
5. **The FaceMap remove-mark control and the video recorder's recording state.** Do the
   reds read as intentional, or jarring against sage/amber? _[L1]_
6. **On a phone: open the goal graph pop-up, the treated-muscles pop-up, and the export
   modal.** Centered, not clipped, comparable widths? _[L4]_
7. **Icons next to button labels.** Do they look consistently sized, or is one a touch
   bigger/smaller? _[M3]_

---

## What's already coherent (don't spend time here)

- Colour tokens: no rogue Tailwind palette utilities anywhere.
- Border-radius: 336 uses go through `--radius-card` / `--radius-button`.
- Modals: all 12 share `fixed inset-0 z-50` + `bg-ink/40`; `useModalA11y` in 10 files.
- Localisation of attributes: zero hardcoded `aria-label`/`placeholder`/`title`.
- Width tokens (`page-narrow` 480 / `page-mid` 720 / `page-wide` 1080) all defined and
  used; z-index layering is clean (z-50 modals, z-40, z-30).
- Spacing sits on the standard scale (only one off-scale `gap-[5…]`).

## On my recent additions (honest self-check)

The work I shipped lately (the "Since last visit" card, the goal-graph button on the
patient home, the treated-muscles pop-up) **participates in the existing patterns rather
than introducing new drift**: the treated-muscles modal matches the shared modal overlay
exactly; its width (`max-w-md`) and the `VisitChanges` chips' `rounded-md` are in line
with peers. But my hand-rolled buttons (h-10 / h-11) and icons (16 / 17px) do add to the
H1/M3 spreads — so when those get standardised, my components should be migrated too.

---

## Note

This is a read-only audit — I changed no code. I can act on any of it: introduce a
`Button` component and migrate the high-traffic screens, localise the GAS rating UI,
collapse the type scale into tokens, or normalise the card surfaces. Say which and I'll
do it as a normal change (build-verified, en/da parity, new zip).
