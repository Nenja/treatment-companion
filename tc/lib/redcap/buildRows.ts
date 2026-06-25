// Pure REDCap row/CSV builder — NO 'use client', no browser/React deps, so it
// is safe to import from both the client download hook and server-side sync.

// ---------------------------------------------------------------------------
// REDCap import CSV builder.
//
// Calls export_research_dataset() (0106), then flattens each consented
// patient into REDCap rows: one non-repeating `enrolment` row plus one row
// per instance of each repeating instrument. Raw app values are mapped to the
// dictionary's numeric codes here (this is the single source of the coding,
// mirroring redcap/treatment_companion_datadictionary.csv).
//
// Output is a REDCap-import CSV: record_id, redcap_repeat_instrument,
// redcap_repeat_instance, then every field. The side-effects checkbox is
// emitted as ci_side_effects___1..___5 (1/0), per REDCap's import format.
// ---------------------------------------------------------------------------

const mk =
  (m: Record<string, number>) =>
  (v: string | null | undefined): string =>
    v == null || m[v] == null ? '' : String(m[v]);

const SEX = mk({ female: 1, male: 2, other: 3, preferNotToSay: 4 });
const ETIOLOGY = mk({
  stroke: 1, tbi: 2, cerebralPalsy: 3, multipleSclerosis: 4,
  spinalCordInjury: 5, hereditarySpasticParaplegia: 6, anoxic: 7, other: 8
});
const SIDE = mk({ left: 1, right: 2, bilateral: 3 });
const AMBULATION = mk({ independent: 1, withAid: 2, wheelchair: 3, nonAmbulant: 4 });
const CYCLE_STATUS = mk({ active: 1, completed: 2 });
const MODALITY = mk({ botulinum_toxin: 1, baclofen_pump: 2, surgery: 3, other: 4 });
const GUIDANCE = mk({
  emg: 1, ultrasound: 2, usEmg: 3, electricalStimulation: 4,
  anatomicalLandmarks: 5, none: 6, other: 7
});
const GOAL_KIND = mk({ nrs: 1, gas: 2 });
const NRS_DIR = mk({ higherIsBetter: 1, lowerIsBetter: 2 });
const GOAL_STATUS = mk({ active: 1, archived: 2, combined: 3 });
const GOAL_OUTCOME = mk({ achieved: 1, partial: 2, noLongerSuitable: 3 });
const SUBMITTER = mk({ self: 1, caregiver: 2 });
const SPASM = mk({ none: 1, occasional: 2, daily: 3, severalDaily: 4 });
const DAILY_CARE = mk({ harder: 1, unchanged: 2, easier: 3, muchEasier: 4, notRelevant: 5 });
const RATING_LABEL = mk({
  muchWorseThanExpected: 1, aLittleWorseThanExpected: 2, asExpected: 3,
  betterThanExpected: 4, muchBetterThanExpected: 5, notSure: 6
});
const SIDE_EFFECT_CODE: Record<string, number> = {
  weakness: 1, falls: 2, swallowing: 3, fluLike: 4, other: 5
};

// GAS −2..+2 maps to dictionary codes 1..5.
const gas = (v: number | null | undefined): string => (v == null ? '' : String(v + 3));
const yesno = (v: boolean | null | undefined): string => (v == null ? '' : v ? '1' : '0');
const ymd = (v: string | null | undefined): string => (v == null ? '' : String(v).slice(0, 10));
const num = (v: number | null | undefined): string => (v == null ? '' : String(v));
const txt = (v: string | null | undefined): string => (v == null ? '' : String(v));

const SIDE_EFFECT_COLS = [1, 2, 3, 4, 5].map((n) => `ci_side_effects___${n}`);

export const COLUMNS: string[] = [
  'record_id', 'redcap_repeat_instrument', 'redcap_repeat_instance',
  // enrolment
  'research_consent', 'research_consent_date', 'birth_year', 'sex', 'diagnosis',
  'diagnosis_detail', 'med_current', 'med_previous', 'affected_side', 'ambulation', 'enrol_date',
  // treatment_cycle
  'cycle_index', 'cycle_start_date', 'cycle_status', 'cycle_modality',
  // treatment
  'tx_cycle_index', 'tx_date', 'tx_drug_product', 'tx_total_units', 'tx_dilution',
  // muscle
  'm_cycle_index', 'm_muscle', 'm_side', 'm_dose_units', 'm_guidance',
  // goal
  'goal_index', 'goal_cycle_index', 'goal_lineage_id', 'goal_version', 'goal_kind',
  'goal_patient_text', 'goal_smart_text', 'goal_nrs_direction', 'goal_nrs_cut_lowlow',
  'goal_nrs_cut_low', 'goal_nrs_cut_zero', 'goal_nrs_cut_high', 'goal_nrs_baseline',
  'goal_anchor_m2', 'goal_anchor_m1', 'goal_anchor_0', 'goal_anchor_p1', 'goal_anchor_p2',
  'goal_status', 'goal_outcome',
  // checkin
  'ci_week', 'ci_cycle_index', 'ci_date', 'ci_submitter', 'ci_pain', 'ci_stiffness',
  'ci_spasm_freq', 'ci_daily_care', ...SIDE_EFFECT_COLS, 'ci_side_effect_other',
  'ci_training_days_home', 'ci_training_days_therapist',
  // goal_rating
  'gr_goal_index', 'gr_week', 'gr_cycle_index', 'gr_nrs_value', 'gr_gas_value', 'gr_label',
  'gr_clinic_video_gas', 'gr_clinic_video_nrs',
  // physio_assessment
  'pa_cycle_index', 'pa_date',
  // physio_goal_rating
  'pgr_cycle_index', 'pgr_assessment_date', 'pgr_goal_index', 'pgr_nrs_value', 'pgr_gas_value',
  'pgr_working_on', 'pgr_needs_adjustment',
  // itb
  'itb_started_on', 'itb_ended_on',
  // itb_dose_change
  'idc_started_on', 'idc_changed_on', 'idc_dose_mcg_day',
  // questionnaire_item (generic long-format repeating instrument: one row per
  // item answer, so any admin-authored questionnaire fits a fixed dictionary)
  'q_key', 'q_version', 'q_lang', 'q_submitted', 'q_week', 'q_cycle_index',
  'q_filled_by', 'q_item_key', 'q_value', 'q_value_num'
];

export type Row = Record<string, string>;
/* eslint-disable @typescript-eslint/no-explicit-any */

export function patientRows(p: any): Row[] {
  const rid = String(p.record_id ?? '');
  const rows: Row[] = [];
  const base = (instrument: string, instance: number | ''): Row => ({
    record_id: rid,
    redcap_repeat_instrument: instrument,
    redcap_repeat_instance: instance === '' ? '' : String(instance)
  });
  const each = (arr: any[] | null | undefined, fn: (x: any, i: number) => Row) =>
    (arr ?? []).forEach((x, i) => rows.push(fn(x, i)));

  // enrolment (non-repeating)
  rows.push({
    ...base('', ''),
    research_consent: yesno(p.research_consent),
    research_consent_date: ymd(p.research_consent_recorded_at),
    birth_year: num(p.birth_year),
    sex: SEX(p.sex),
    diagnosis: ETIOLOGY(p.etiology),
    diagnosis_detail: txt(p.etiology_detail),
    med_current: txt(p.current_medication),
    med_previous: txt(p.previous_medication),
    affected_side: SIDE(p.affected_side),
    ambulation: AMBULATION(p.ambulation),
    enrol_date: ymd(p.created_at)
  });
  each(p.cycles, (c, i) => ({
    ...base('treatment_cycle', i + 1),
    cycle_index: num(c.cycle_number), cycle_start_date: ymd(c.start_date),
    cycle_status: CYCLE_STATUS(c.status), cycle_modality: MODALITY(c.modality)
  }));
  each(p.sessions, (s, i) => ({
    ...base('treatment', i + 1),
    tx_cycle_index: num(s.cycle_number), tx_date: ymd(s.date), tx_drug_product: txt(s.drug_product),
    tx_total_units: num(s.total_units), tx_dilution: txt(s.dilution)
  }));
  each(p.muscles, (m, i) => ({
    ...base('muscle', i + 1),
    m_cycle_index: num(m.cycle_number), m_muscle: txt(m.muscle), m_side: SIDE(m.side),
    m_dose_units: num(m.dose_units), m_guidance: GUIDANCE(m.guidance)
  }));
  each(p.goals, (g, i) => ({
    ...base('goal', i + 1),
    goal_index: num(g.goal_index), goal_cycle_index: num(g.cycle_number),
    goal_lineage_id: txt(g.lineage_id), goal_version: num(g.version), goal_kind: GOAL_KIND(g.goal_kind),
    goal_patient_text: txt(g.patient_facing_text), goal_smart_text: txt(g.smart_text),
    goal_nrs_direction: NRS_DIR(g.nrs_direction), goal_nrs_cut_lowlow: num(g.nrs_cut_low_low),
    goal_nrs_cut_low: num(g.nrs_cut_low), goal_nrs_cut_zero: num(g.nrs_cut_zero),
    goal_nrs_cut_high: num(g.nrs_cut_high), goal_nrs_baseline: num(g.nrs_baseline_value),
    goal_anchor_m2: txt(g.anchor_minus2), goal_anchor_m1: txt(g.anchor_minus1),
    goal_anchor_0: txt(g.anchor_zero), goal_anchor_p1: txt(g.anchor_plus1), goal_anchor_p2: txt(g.anchor_plus2),
    goal_status: GOAL_STATUS(g.status), goal_outcome: GOAL_OUTCOME(g.goal_outcome)
  }));
  each(p.checkins, (w, i) => {
    const r: Row = {
      ...base('checkin', i + 1),
      ci_week: num(w.week_number), ci_cycle_index: num(w.cycle_number), ci_date: ymd(w.submitted_at),
      ci_submitter: SUBMITTER(w.submitter_label), ci_pain: num(w.pain), ci_stiffness: num(w.stiffness),
      ci_spasm_freq: SPASM(w.spasm_frequency), ci_daily_care: DAILY_CARE(w.daily_care),
      ci_side_effect_other: txt(w.other_side_effect_text),
      ci_training_days_home: num(w.training_days), ci_training_days_therapist: num(w.training_days_therapist)
    };
    const ses: string[] = Array.isArray(w.side_effects) ? w.side_effects : [];
    SIDE_EFFECT_COLS.forEach((col, idx) => {
      r[col] = ses.some((s) => SIDE_EFFECT_CODE[s] === idx + 1) ? '1' : '0';
    });
    return r;
  });
  each(p.goal_ratings, (g, i) => ({
    ...base('goal_rating', i + 1),
    gr_goal_index: num(g.goal_index), gr_week: num(g.week_number), gr_cycle_index: num(g.cycle_number),
    gr_nrs_value: num(g.nrs_value), gr_gas_value: gas(g.rating_value), gr_label: RATING_LABEL(g.rating_label),
    gr_clinic_video_gas: gas(g.clinic_video_rating), gr_clinic_video_nrs: num(g.clinic_video_nrs)
  }));
  each(p.physio, (a, i) => ({
    ...base('physio_assessment', i + 1),
    pa_cycle_index: num(a.cycle_number), pa_date: ymd(a.assessment_date)
  }));
  each(p.physio_ratings, (r0, i) => ({
    ...base('physio_goal_rating', i + 1),
    pgr_cycle_index: num(r0.cycle_number), pgr_assessment_date: ymd(r0.assessment_date),
    pgr_goal_index: num(r0.goal_index), pgr_nrs_value: num(r0.nrs_value), pgr_gas_value: gas(r0.gas_value),
    pgr_working_on: yesno(r0.working_on), pgr_needs_adjustment: yesno(r0.needs_adjustment)
  }));
  each(p.itb, (it, i) => ({
    ...base('itb', i + 1),
    itb_started_on: ymd(it.started_on), itb_ended_on: ymd(it.ended_on)
  }));
  each(p.itb_doses, (d, i) => ({
    ...base('itb_dose_change', i + 1),
    idc_started_on: ymd(d.started_on), idc_changed_on: ymd(d.changed_on),
    idc_dose_mcg_day: num(d.dose_mcg_per_day)
  }));
  return rows;
}

// Generic long-format questionnaire rows: one repeating `questionnaire_item`
// instance per item answer, keyed by record_id (study_code). Raw values — no
// code mapping (admin-authored questionnaires are descriptive/raw).
export function questionnaireRows(records: any): Row[] {
  const out: Row[] = [];
  for (const rec of records ?? []) {
    const rid = String(rec.record_id ?? '');
    (rec.items ?? []).forEach((qi: any, i: number) => {
      out.push({
        record_id: rid,
        redcap_repeat_instrument: 'questionnaire_item',
        redcap_repeat_instance: String(i + 1),
        q_key: txt(qi.q_key),
        q_version: num(qi.q_version),
        q_lang: txt(qi.q_lang),
        q_submitted: ymd(qi.submitted_at),
        q_week: num(qi.week_number),
        q_cycle_index: num(qi.cycle_number),
        q_filled_by: txt(qi.filled_by),
        q_item_key: txt(qi.item_key),
        q_value: txt(qi.value_text),
        q_value_num: num(qi.value_num)
      });
    });
  }
  return out;
}

export const esc = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: Row[]): string {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => esc(r[c] ?? '')).join(','));
  return lines.join('\r\n');
}

// Header line and a single-row line, for chunked server-side imports.
export const csvHeader = (): string => COLUMNS.join(',');
export const csvRowLine = (r: Row): string => COLUMNS.map((c) => esc(r[c] ?? '')).join(',');
