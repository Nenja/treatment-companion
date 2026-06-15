# REDCap data dictionary — reconciliation against the app

**File:** `treatment_companion_datadictionary.csv` (86 fields, 12 instruments)
Built from the repo's 84-field dictionary, validated field-by-field against the
app's actual enums and data model. Import-legal (variable names, first field
`record_id`, choice format all checked).

## What was validated — and matches the app exactly
Every coded field's choices/order were checked against the app's enum
definitions and line up:
- **diagnosis** = the 8 `Etiology` values (stroke, tbi, cerebralPalsy,
  multipleSclerosis, spinalCordInjury, hereditarySpasticParaplegia, anoxic, other)
- **cycle_modality** = `TreatmentModality` (4); **m_guidance** = `GuidanceMethod` (7);
  **m_side** = `InjectionSide` (3); **cycle_status** = active/completed
- **ci_spasm_freq** = `SpasmFrequency` (4); **ci_daily_care** = `DailyCare` (5);
  **ci_side_effects** = `SideEffect` (5); **gr_label** = `RatingLabel` (6)
- **goal_kind** (2), **goal_nrs_direction** = `NrsDirection` (2),
  **goal_status** = `ApprovedGoalStatus` (active/archived/combined),
  **goal_outcome** = `GoalOutcome` (achieved/partial/noLongerSuitable)
- **gr_gas_value / pgr_gas_value / gr_clinic_video_gas** = the −2..+2 → 1..5 scale
- **ci_submitter** = patient/caregiver; medication fields (`med_current`,
  `med_previous`) are backed by the app (`currentMed`/`previousMed`).

## What I changed (3 items)
1. **sex → 4 codes.** The dictionary had 3 (`Other / prefer not to say` merged);
   the app stores 4 distinct values (`female | male | other | preferNotToSay`).
   Split to `1 Female | 2 Male | 3 Other | 4 Prefer not to say` so the export
   round-trips. *(If you prefer to merge Other + Prefer-not-to-say for small-n
   privacy, revert to 3 codes and map both app values to 3.)*
2. **Added `affected_side`** (1 Left | 2 Right | 3 Bilateral) — app captures
   `patient_info.affected_side`; was missing from the dictionary.
3. **Added `ambulation`** (1 Independent | 2 With aid | 3 Wheelchair |
   4 Non-ambulant) — app captures `patient_info.ambulation_status`; was missing.
   *(Both additions are clearly flagged in their Field Note; drop them if they're
   out of study scope.)*

Also: a short **REVIEW (PII)** tag was added to the 17 free-text (`notes`)
fields, so whoever imports/reviews in REDCap sees the flag per field.

## Open decisions for the study team / DPO (not mine to make)
- **PII in free text.** 17 free-text fields (notes, comments, anchors, SMART
  text, medication, diagnosis detail) can carry incidental identifiers. The
  app export is pseudonymised, but you must decide per field whether to set
  REDCap's **Identifier?** flag (excludes them from de-identified exports) or
  to drop them from the export entirely. None are flagged Identifier yet.
- **Dates as quasi-identifiers.** `enrol_date`, cycle/injection/visit dates and
  `birth_year` are quasi-identifiers. Decide whether de-identified exports need
  date-shifting or coarsening. `record_id` is pseudonymous (not the app patient
  id, not a name) and is correctly NOT marked Identifier.
- **sex categories** — split (current) vs merged, as above.
- **Repeating-instrument structure.** muscle / goal / checkin / goal_rating /
  physio_assessment / physio_goal_rating / itb_dose_change are modelled as
  repeating instruments, each carrying its own `*_cycle_index` (and goal/week
  index) because REDCap repeating instruments are flat — there is no true
  foreign key, so the indices are how you re-link rows to a cycle/goal on
  analysis. Confirm these instruments are set "repeating" in the REDCap project.

## Next step (separate from this file)
This dictionary is the **target schema**. The app's pseudonymised CSV export
that populates it is **not built yet**. Once you've signed off the dictionary
(especially the PII/Identifier decisions), the follow-on task is building that
export to emit exactly these variable names and codings.
