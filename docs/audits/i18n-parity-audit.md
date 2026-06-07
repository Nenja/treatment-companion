# i18n parity audit — en ⇄ da

**What was checked.** Three layers: (1) **structural** key parity between
`messages/en.json` and `messages/da.json`; (2) **ICU argument** parity (do the
`{placeholders}` and `plural`/`select` arguments match per key — a real
runtime-bug class); (3) the **documented blind spot** — user-facing strings
hardcoded in source (ternaries, `throw`, toasts, `aria-label`s) that never reach
the catalog at all.

**Method & honesty note.** Layers 1–2 are computed exactly from the two JSON
files (not eyeballed). Layer 3 is a source scan over `app/` + `components/`; a
regex scan can miss cleverly-built strings, so treat it as "these are real," not
"these are all." Danish quality itself still needs a native review — this audit
is about *coverage and leaks*, not phrasing nuance.

---

## Headline

**Catalog parity is essentially perfect; the only real i18n debt is a handful of
strings that bypass the catalog entirely — and they cluster exactly where you
predicted: toasts and aria-labels, not visible body text.**

- **1301 en keys / 1303 da keys.** Zero strings missing a Danish value. Zero
  empty values either side. The two extra `da` keys are `_meta.reviewedBy` /
  `_meta.status` (translation-process metadata, not user-facing).
- **Zero ICU argument mismatches.** Every `{name}`, `{count}`, `{date}` and every
  `plural`/`select` argument matches across the two languages. (An earlier naive
  scan flagged six "mismatches" — all false positives from literals *inside*
  plural sub-messages like `one {No check-ins}`. A proper ICU-argument extractor
  confirms none are real.)

So the structured catalog is in excellent shape. The work is in source.

---

## Layer 3 — hardcoded literals bypassing i18n (the real findings)

### [Med] Three clinician-facing toast strings, hardcoded

`app/[locale]/clinician/patient/page.tsx`, in the patient-suggestion status
action (`act()`), ~lines 2137 / 2190 / 2193:

- `toast.success(next === 'reviewed' ? 'Marked considered' : 'Suggestion dismissed')`
- `toast.error('Could not update the suggestion.')` (appears twice)

A Danish clinician acting on a patient suggestion gets English toasts. This is
the textbook ternary-and-error blind spot. Move all three into the catalog
(`clinician.patient` namespace) with en+da.

### [Med] Chart aria-label hardcoded (also an accessibility leak)

`components/clinician/GoalProgressView.tsx` ~line 320, the SVG `role="img"`
label:

```
`Weekly ratings chart for: ${goalText} (${higherBetter ? 'higher is better' : 'lower is better'})`
```

The entire screen-reader description of every goal chart is English — and this
chart renders for patient, therapist *and* clinician, so it's the widest-reach
leak of the set. The English is hidden inside a `${…}` interpolation, which is
why a plain string scan would miss it. Key it (and see the a11y audit — the
label also wants the data behind it, not just a title).

### [Med] Export confirmation hardcoded

`components/clinician/ExportModal.tsx` ~line 92:

```
{copied ? 'Copied to clipboard' : 'placeholder'}
```

"Copied to clipboard" is visible *and* announced (`aria-live="polite"`), so a
Danish screen-reader user hears English on every export copy. Key the visible
string; the `'placeholder'` branch is invisible transparent filler (fine, though
a non-breaking space would read cleaner).

### [Low] Untranslated catalog values (present but identical to en)

Two keys carry English in the Danish file:

- `visitChanges.checkinCount`: `'{count, plural, one {# check-in} other {# check-ins}}'`
  — left in English while its siblings were translated (`checkinsThisCycle` uses
  "status", `saveAssessment` uses "besøg"). Inconsistent; translate to match.
- `treatment.forPatient`: `'For {name}'` — likely wants `'Til {name}'` in Danish.
  Low confidence; flag for the native reviewer.

### [Low] Example-data placeholder

`app/[locale]/clinician/observations/page.tsx` ~line 323:
`placeholder="Garmin Vivoactive 4"` (a device-name example in the advanced
wearable-import tool). Example device strings are arguably fine untranslated;
key it only if you want full consistency.

---

## Everything else: clean

- All visible body text in the clinician cockpit (`clinician/patient`,
  `clinician/treatment`) uses `t(...)` — the visible-text scan found no leaks.
- Icon-only buttons (switch patient, end session, open info) use keyed
  `aria-label`s.
- Thrown `Error` strings in `lib/supabase/*` (`'Not signed in'`, `'No patient
  row'`, etc.) are developer-facing; the user-reaching one — `'Code must be 6
  characters'` — is caught on the unlock page and mapped to the translated
  `errorInvalid`. The old `'No active cycle…'` raw string now survives only as a
  code comment, not user text (consistent with the patient cold-start fix).

---

## Punch list

| # | Fix | File | Severity | Effort |
|---|-----|------|----------|--------|
| 1 | Key the 3 suggestion-action toasts | `clinician/patient/page.tsx` ~2137/2190/2193 | Med | Copy |
| 2 | Key the goal-chart aria-label + direction phrase | `GoalProgressView.tsx` ~320 | Med | Copy |
| 3 | Key "Copied to clipboard" | `ExportModal.tsx` ~92 | Med | Copy |
| 4 | Translate `visitChanges.checkinCount` plural to match siblings | `da.json` | Low | Copy |
| 5 | Native-review `treatment.forPatient` ("For" → "Til"?) | `da.json` | Low | Review |
| 6 | (Optional) key the Garmin example placeholder | `observations/page.tsx` ~323 | Low | Copy |

All copy-only. After keying, re-run the structural + ICU parity check (it's
scriptable) to confirm the new keys land in both files. **A standing guard worth
adding:** a tiny CI/script check that fails on `toast.\w+\('` with a literal and
on `aria-label=` containing a quoted English string — that's where leaks recur.
