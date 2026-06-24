# Data-output correctness audit — EHR text & pseudonymised export

**Why this lens.** Generated outputs are the highest-trust surface in the app: a
clinician pastes the EHR text into a hospital record, and a study team analyses
the pseudonymised export. Silent wrongness here propagates into the medical
record and the dataset, where it's hard to catch. This audits the **two**
output artifacts for *correctness of the produced data*, not UX.

**Method & honesty note.** Traced from `lib/ehrExport.ts` (the EHR-paste
builder), its call site in `clinician/patient/page.tsx`, `ExportModal.tsx`, the
submit RPCs (`0021`, `0053`) that populate what the export reads, and the REDCap
data dictionaries in `redcap/`. Logic claims are read from source; clinical-text
judgments are mine and worth a second clinician eye. I can't run the exports, so
the worked examples below are hand-traced through the code, not executed.

**Two artifacts, two purposes — and they are correctly separate:**

- **EHR-paste text** (`buildEhrExport` → `ExportModal`): a **named-patient**,
  editable, copy-only block. The modal states plainly that *nothing is sent
  anywhere*. The patient's name appears in the header — appropriate, because it
  goes into that patient's own record.
- **Pseudonymised export** = the **REDCap data dictionary** (`redcap/*.csv`).
  Important: **there is no in-app CSV builder/push yet** — the dictionary is the
  *target schema*, not a working export. So "pseudonymised CSV export" is
  currently spec, not feature. Correctness here = does the schema match what the
  app actually produces, and are the pseudonymisation rules sound.

Findings tagged **[High] / [Med] / [Low]**, plus noted **strengths**.

---

## Headline

**The EHR text states "clear wearing-off" for some patients who never wore off —
and the pseudonymised schema describes a richer check-in than the app actually
collects.** Both are correctness defects in trusted outputs. Everything else is
smaller, and the data-normalisation underneath is actually solid.

---

# Part A — EHR-paste text (`buildEhrExport`)

### [High] False "clear wearing-off" on a stable or non-rising goal

In `buildGoalSentence`, wearing-off is detected as:

```js
const clearReport = postPeak.find(r => peak - r.gas >= 2 || r.gas <= initial);
```

The second clause — `r.gas <= initial` — fires whenever any post-peak week sits
at or below the **first** reported week, *even if the patient never rose above
that level*. Worked traces:

- **Stable-good:** patient reports GAS **+1 every week**. `initial=+1`,
  `peak=+1`; every post-peak week has `gas(+1) <= initial(+1)` → **"Clear
  wearing-off from W2."** The patient was stably good and the record says they
  wore off.
- **Flat-at-expected:** GAS **0** throughout → same false "clear wearing-off."

The rising-then-falling case still works correctly via the first clause
(`peak - r.gas >= 2`), so the fix is to gate the baseline-return clause on an
actual rise: `peak - r.gas >= 2 || (peak > initial && r.gas <= initial)`. This
is the one finding I'd block a real-data export on — it puts a wrong clinical
statement into a pasted note.

### [Med] "sustained N weeks" counts across calendar gaps, contradicting its own comment

The doc above `buildGoalSentence` says *"Skipped weeks break the sustained
streak."* The code can't honour that: it loops over `reports` (only weeks that
have a rating), so an **unreported** week is simply absent and never breaks the
streak. Trace: ratings at W2(+1) and W5(+1) with W3–W4 missing → **"sustained 2
weeks,"** implying continuity W2→W5 that the data doesn't support. Either break
on `reports[i].week !== reports[i-1].week + 1`, or correct the comment.
(Notably, the on-screen `VisitChanges` *does* compute gaps correctly — so the
two surfaces disagree about what "missed" means.)

### [Med] Raw NRS printed without its direction

The sentence prints e.g. `Peak GAS +2 / NRS 2/10`. The GAS is direction-
normalised (via `nrs_to_gas`, which flips for *lower-is-better* goals), so `+2`
is unambiguously "best." But the **raw NRS** is printed as-is: for a
lower-is-better goal, `2/10` is good, yet a reader scanning the pasted note sees
"2/10" and reads it as poor. Append the direction, label it, or drop the raw NRS
in favour of the normalised GAS.

### [Med] The EHR text is English-only regardless of app locale

`formatLongDate(…, locale)` localises the **dates**, but every label and the
whole goal sentence ("Treatment", "Injections:", "Peak GAS", "Wearing-off",
"units total", side `L/R/B`, guidance names) is hardcoded English. For a Danish
clinic this is either deliberate (English clinical shorthand) or a gap — but
it's internally inconsistent (dates follow locale, prose doesn't). Decide and
make it consistent.

### [Low] No reconciliation between `totalUnits` and the per-injection sum

`treatment.totalUnits` is printed verbatim and the per-muscle `doseUnits` are
listed separately; nothing checks that they agree. A data-entry divergence
(e.g. "120 units total" but muscles sum to 130) is pasted into the record
silently. A computed-sum check or footnote would catch it.

### [Low] Smaller items

- **Two date lines that should match:** header "Treatment date {cycle.startDate}"
  vs the Treatment block "Date: {treatment.date}". Equal today (cycle is created
  atomically with the treatment); if they ever diverge it reads oddly.
- **Face detection by `posX != null`:** a face mark with a null `posX` would be
  miscategorised as a standard injection. Edge-case data dependency.
- **`switch` helpers without `default`** (`sideLabel`, `guidanceLabel`,
  `modalityLabel`): a future enum value returns `undefined` and prints nothing.
  Add a fallback.
- **Stale comment in `types.ts`:** it claims `injectionSideLabel` is "the single
  source … used by the EHR export," but the export uses its **own** local
  `sideLabel` (L/R/B). Two side-label functions; fix the comment or unify.

### ✅ Strengths (verified, not assumed)

- **Both goal kinds are correctly normalised into the column the export reads.**
  I suspected NRS goals (or GAS goals) might be silently dropped; reading
  `0053_gas_checkin` disproved it. For NRS goals the RPC derives the GAS bucket
  via `nrs_to_gas` and stores `rating_value`; for GAS goals it stores the picked
  level directly as `rating_value` (nrs_value null). The export reads
  `rating_value`, so **both kinds appear, with the right level**. Good.
- **Descriptive-only, as designed.** The sentence reports peaks, onset,
  duration, wearing-off and end-cycle values — no "successful/failed," no
  recommendation. Consistent with the app's scope line.
- **Comments verbatim & chronological**, empty trailing lines stripped — clean
  paste.

---

# Part B — Pseudonymised export (REDCap dictionary)

### [High] The schema defines check-in fields the app does not collect

The `checkin` instrument declares **`ci_pain` (0–10), `ci_stiffness` (0–10),
`ci_spasm_freq`, `ci_daily_care`, `ci_side_effects` (checkbox)**. The app's
weekly check-in (`checkin.ts` / `checkin/page.tsx`) collects **only**: per-goal
ratings (NRS 0–10 or GAS −2…+2), training days, and one free-text comment.
**None** of those five symptom fields exists anywhere in the app. A push built
to this dictionary leaves them permanently blank, and an analyst reading the
dictionary expects symptom data the app never gathers. Reconcile before any
push: drop them from the dictionary, or add them to the check-in (the bigger
decision).

### [Med] The one free text the check-in *does* collect has no home — and that's undocumented

There's no `ci_comment` field. Omitting the patient's free-text comment from a
pseudonymised export is a *defensible* privacy choice (free text is where
incidental identifiers hide) — but right now it's **silent**, not a documented
decision, and it means the only qualitative datum is dropped from study export.
Make it an explicit, recorded choice.

### [Med] Inconsistent free-text PII handling

The DRAFT dictionary flagged `tx_notes` as a possible-identifier risk, and the
final dictionary **drops `tx_notes`** — good, the concern was acted on. But
`goal_patient_text` and `goal_smart_text` (free-text `notes` fields) **remain
exported**, with no `Identifier?` flag and no review note, despite the identical
risk ("return to work at <employer>", a relative's name in a goal). Treat free
text consistently: flag/scrub all of it, or document why goal text is in scope.

### [Med] Exact dates + birth_year + diagnosis are quasi-identifiers

`cycle_start_date`, `tx_date` and `ci_date` are exported as full `date_ymd`.
Combined with `birth_year` and the (study-team-entered) `diagnosis`, that is
re-identifying for rare indications. The app already has a relative-time concept
(weeks-since-injection); a DPO call on whether the analytic dataset needs
absolute dates, or could use relative timing, is worth having before a push.

### [Med] Guidance is modelled at the wrong grain

`m_guidance` sits on the per-**muscle** instrument, but in the app guidance is a
single per-**session** value (`treatment.guidance`, one per treatment). A push
would either duplicate the session value onto every muscle row or fail to map
it. Move guidance to the `treatment` instrument to match the source.

### [Low] One-session-per-cycle is baked into the link keys

Muscle/treatment rows link to the cycle via `cycle_index`, assuming exactly one
session per cycle. True today (1:1), but fragile if multi-session or
multi-modality (WP4) cycles arrive. Documented in the dictionary; just flag.

### ✅ Strengths

- **Coding matches the app's enums** where the app *does* feed the schema:
  side (L/R/Bilateral), guidance (all 7 values), goal_kind (NRS/GAS), goal
  outcome (Achieved / Partial / No longer suitable), `gr_nrs_value` vs
  `gr_gas_value` split by goal kind. No miscoded option lists found.
- **Pseudonymisation philosophy is sound and explicit:** `record_id` is an
  externally-held study ID (not the app UUID, not a name); only `birth_year` is
  pushed (no full DOB), ethics-gated; sex/diagnosis are study-team-entered, not
  app-pushed; and the named path (EHR text, "nothing sent anywhere") is cleanly
  separated from the pseudonymised path.

---

## Punch list

| # | Fix | Where | Severity | Effort |
|---|-----|-------|----------|--------|
| 1 | Gate baseline-return wearing-off on an actual rise (`peak > initial`) | `ehrExport.ts` `buildGoalSentence` | **High** | Small |
| 2 | Reconcile check-in fields the dictionary defines but the app doesn't collect | `redcap/*.csv` (or check-in) | **High** | Decision |
| 3 | Fix "sustained" to break on calendar gaps (or fix the comment) | `ehrExport.ts` | Med | Small |
| 4 | Annotate or normalise the raw NRS with its direction | `ehrExport.ts` | Med | Small |
| 5 | Decide EHR-text language (locale vs deliberate English) | `ehrExport.ts` | Med | Decision/medium |
| 6 | Treat goal free-text PII like `tx_notes` (flag/scrub or document) | `redcap/*.csv` | Med | Decision |
| 7 | DPO call: exact dates + birth_year + diagnosis | `redcap/*.csv` | Med | Decision |
| 8 | Move `m_guidance` to the `treatment` (session) instrument | `redcap/*.csv` | Med | Small |
| 9 | Document the deliberate omission of the check-in comment | `redcap/*.csv` | Med | Doc |
| 10 | Reconcile `totalUnits` vs per-injection sum | `ehrExport.ts` | Low | Small |
| 11 | `default` cases in label switches; fix stale `types.ts` comment | `ehrExport.ts` / `types.ts` | Low | Small |

**Net read.** The data layer underneath these outputs is trustworthy — the
NRS/GAS normalisation is correct and the named/pseudonymised split is principled.
The defects are in the **derived prose** (the wearing-off rule is the one to fix
before any real-data export) and in the **dictionary drifting ahead of the app**
(symptom fields that don't exist). #1 and #3 are small code changes; the
REDCap items are mostly decisions to settle with the study team / DPO before the
push is built — which is the right time to settle them, since the push isn't
built yet.
