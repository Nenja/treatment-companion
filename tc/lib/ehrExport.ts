import type { GuidanceMethod, InjectionSide, TreatmentModality } from './types';
import { formatLongDate } from './dates';

// ---------------------------------------------------------------------------
// EHR-paste export builder.
//
// Returns a plain-text block the clinician pastes into a hospital notes
// field. Two sections only — TREATMENT and GOALS & RESPONSE — because the
// EHR already holds the patient's name, demographics, diagnosis and
// medication; duplicating them is noise. No patient name, no verbatim
// comments. Output stays purely descriptive (no "successful"/"failed",
// no recommendations); the clinician edits it before copying.
//
// The point of the export is the part the EHR does NOT already have: what
// was injected, and how each goal responded. NRS goals are reported as
// baseline -> target plus the best and end-of-cycle values; GAS goals are
// reported in words (the five attainment levels) with the achieved anchor
// description, since a bare "+1" is meaningless to a clinician who can't
// see how that goal's levels were defined. Wearing-off is included on both.
//
// LOCALISED: every label and sentence fragment comes from the `ehrExport`
// message namespace via the `t` translator the (client) call site passes
// in; dates via formatLongDate(locale). The builder itself is a pure,
// framework-free function — the caller owns the translator.
// ---------------------------------------------------------------------------

/** Minimal translator shape: next-intl's `useTranslations(...)` return value
 *  is structurally compatible (the caller casts to this). */
export type ExportTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export interface ExportCycle {
  cycleNumber: number;
  startDate: string;
  /** Treatment modality. Omitted / botulinum_toxin renders the "injected"
   *  header; a non-default modality (pump, surgery) uses a neutral header. */
  modality?: TreatmentModality;
}

export interface ExportInjection {
  muscle: string;
  side: InjectionSide;
  doseUnits: number;
  note?: string;
  /** True when this injection is a face mark, so it lists with a "face:"
   *  prefix rather than among the body muscles. */
  isFace?: boolean;
}

export interface ExportTreatment {
  date: string;
  drugProduct: string;
  totalUnits: number;
  dilution?: string;
  guidance: GuidanceMethod;
  injections: ExportInjection[];
  notes?: string;
}

/** The five GAS anchor descriptions for a goal (free text; any may be ''). */
export interface ExportAnchors {
  minus2: string;
  minus1: string;
  zero: string;
  plus1: string;
  plus2: string;
}

export interface ExportGoal {
  id: string;
  patientFacingText: string;
  kind?: 'nrs' | 'gas';
  nrsDirection?: 'higherIsBetter' | 'lowerIsBetter';
  /** NRS goals: the agreed 0-10 start and target set when the goal was
   *  approved. Null on older goals / GAS goals. */
  nrsBaseline?: number | null;
  nrsTarget?: number | null;
  /** GAS goals: the clinician's per-level outcome descriptions, used to
   *  quote the achieved level concretely. Null on NRS goals. */
  anchors?: ExportAnchors | null;
}

export interface ExportCheckin {
  weekNumber: number;
  comment?: string | null;
  ratings: {
    approvedGoalId: string;
    ratingValue: -2 | -1 | 0 | 1 | 2 | null;
    nrsValue: number | null;
  }[];
}

interface BuildExportArgs {
  cycle: ExportCycle;
  treatment?: ExportTreatment;
  goals: ExportGoal[];
  checkins: ExportCheckin[];
  locale: string;
  /** Translator scoped to the `ehrExport` namespace. */
  t: ExportTranslator;
}

export function buildEhrExport({
  cycle,
  treatment,
  goals,
  checkins,
  locale,
  t
}: BuildExportArgs): string {
  const lines: string[] = [];

  // Header (one line) -----------------------------------------------------
  const modLabel = modalityLabel(cycle.modality ?? 'botulinum_toxin', t);
  const isBont = !cycle.modality || cycle.modality === 'botulinum_toxin';
  const headerVals = {
    modality: modLabel,
    cycle: cycle.cycleNumber,
    date: formatLongDate(cycle.startDate, locale)
  };
  lines.push(isBont ? t('headerInjected', headerVals) : t('header', headerVals));
  lines.push('');

  // Treatment -------------------------------------------------------------
  if (treatment) {
    const parts = [
      treatment.drugProduct,
      t('unitsTotal', { units: treatment.totalUnits })
    ];
    if (treatment.dilution) parts.push(treatment.dilution);
    parts.push(guidanceLabel(treatment.guidance, t));
    lines.push(parts.join(' · '));

    const renderInjection = (inj: ExportInjection, key: string): string =>
      '  ' +
      t(key, {
        side: sideLabel(inj.side, t),
        muscle: inj.muscle,
        units: inj.doseUnits,
        // Note suffix is punctuation + free text, locale-neutral.
        note: inj.note ? ` (${inj.note})` : ''
      });

    for (const inj of treatment.injections.filter((i) => !i.isFace))
      lines.push(renderInjection(inj, 'injectionLine'));
    for (const inj of treatment.injections.filter((i) => i.isFace))
      lines.push(renderInjection(inj, 'faceInjectionLine'));

    if (treatment.notes) lines.push(t('notes', { notes: treatment.notes }));

    // Reconciliation: if the per-injection doses don't add up to the
    // recorded total, surface it rather than letting an inconsistent figure
    // into the record.
    if (treatment.injections.length > 0) {
      const injSum = treatment.injections.reduce((s, i) => s + i.doseUnits, 0);
      if (injSum !== treatment.totalUnits)
        lines.push(t('reconciliation', { sum: injSum, total: treatment.totalUnits }));
    }
    lines.push('');
  } else {
    lines.push(t('treatmentNotRecorded'));
    lines.push('');
  }

  // Goals & response ------------------------------------------------------
  if (goals.length > 0) {
    lines.push(t('goalsHeading'));
    for (const goal of goals) {
      lines.push(`- ${goal.patientFacingText}`);
      for (const ln of buildGoalLines(goal, checkins, t)) lines.push(`  ${ln}`);
    }
    lines.push('');
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/**
 * Per-goal response lines (1–2 lines, already un-indented).
 *
 * NRS goal:
 *   "Baseline NRS 8 → target NRS 4  (0–10, 10 = worst)"
 *   "Best NRS 3 (wk7) · wearing off from wk10 · end of cycle NRS 5 (wk12)"
 * GAS goal:
 *   "Best (wk6): better than expected — \"<anchor>\""
 *   "End of cycle (wk12): as expected · wearing off from wk10"
 *
 * Wearing-off, peak and end are computed on the direction-normalised GAS
 * value (higher GAS is always better), so the same logic serves both goal
 * kinds; NRS goals additionally report their raw 0–10 best/end.
 */
function buildGoalLines(
  goal: ExportGoal,
  checkins: ExportCheckin[],
  t: ExportTranslator
): string[] {
  const reports = checkins
    .flatMap((c) => {
      const r = c.ratings.find((rr) => rr.approvedGoalId === goal.id);
      if (!r || typeof r.ratingValue !== 'number') return [];
      return [
        {
          week: c.weekNumber,
          gas: r.ratingValue as number,
          nrs: typeof r.nrsValue === 'number' ? r.nrsValue : null
        }
      ];
    })
    .sort((a, b) => a.week - b.week);

  if (reports.length === 0) return [t('noRatings')];

  const peak = reports.reduce((m, r) => Math.max(m, r.gas), -Infinity);
  const peakReport = reports.find((r) => r.gas === peak)!;
  const initial = reports[0].gas;
  const endReport = reports[reports.length - 1];

  // Wearing-off (post-peak): "clear" on a ≥2 drop from peak, or a return to/
  // below the starting level after an actual rise; otherwise "possible" on a
  // ≥1 drop. The clause week is the first qualifying week.
  const postPeak = reports.filter((r) => r.week > peakReport.week);
  const clear = postPeak.find(
    (r) => peak - r.gas >= 2 || (peak > initial && r.gas <= initial)
  );
  const possible = postPeak.find((r) => peak - r.gas >= 1);
  const wearWeek = clear ? clear.week : possible ? possible.week : null;
  const wearing =
    wearWeek != null
      ? t('wearingOffFrom', { week: wearWeek })
      : t('benefitSustained');

  // NRS goal: report the raw 0–10 trajectory (best by direction + end).
  if (goal.kind === 'nrs') {
    const nrsReports = reports.filter((r) => r.nrs != null);
    if (nrsReports.length > 0) {
      const lower = goal.nrsDirection === 'lowerIsBetter';
      const best = nrsReports.reduce((m, r) =>
        lower ? (r.nrs! < m.nrs! ? r : m) : r.nrs! > m.nrs! ? r : m
      );
      const end = nrsReports[nrsReports.length - 1];
      const out: string[] = [];
      if (goal.nrsBaseline != null && goal.nrsTarget != null) {
        out.push(
          t('nrsBaselineTarget', {
            baseline: goal.nrsBaseline,
            target: goal.nrsTarget,
            scale: lower ? t('nrsScaleWorst') : t('nrsScaleBest')
          })
        );
      }
      out.push(
        t('nrsBestEnd', {
          best: best.nrs!,
          bestWeek: best.week,
          wearing,
          end: end.nrs!,
          endWeek: end.week
        })
      );
      return out;
    }
    // NRS goal with no raw values recorded — fall through to the GAS form.
  }

  // GAS goal (or NRS fallback): attainment levels in words + achieved anchor.
  const anchorText = goal.anchors ? anchorFor(peak, goal.anchors) : '';
  const anchor = anchorText ? ` — "${anchorText}"` : '';
  return [
    t('gasPeakLine', {
      week: peakReport.week,
      level: gasLevelLabel(peak, t),
      anchor
    }),
    t('gasEndLine', {
      week: endReport.week,
      level: gasLevelLabel(endReport.gas, t),
      wearing
    })
  ];
}

// --- Helpers ------------------------------------------------------------

function gasLevelLabel(v: number, t: ExportTranslator): string {
  switch (v) {
    case 2:
      return t('gasLevelMuchBetter');
    case 1:
      return t('gasLevelBetter');
    case 0:
      return t('gasLevelAsExpected');
    case -1:
      return t('gasLevelWorse');
    default:
      return t('gasLevelMuchWorse');
  }
}

function anchorFor(v: number, a: ExportAnchors): string {
  switch (v) {
    case 2:
      return (a.plus2 || '').trim();
    case 1:
      return (a.plus1 || '').trim();
    case 0:
      return (a.zero || '').trim();
    case -1:
      return (a.minus1 || '').trim();
    default:
      return (a.minus2 || '').trim();
  }
}

function sideLabel(side: InjectionSide, t: ExportTranslator): string {
  switch (side) {
    case 'left':
      return t('side_left');
    case 'right':
      return t('side_right');
    case 'bilateral':
      return t('side_bilateral');
    default:
      return String(side);
  }
}

function guidanceLabel(g: GuidanceMethod, t: ExportTranslator): string {
  switch (g) {
    case 'emg':
      return t('guidance_emg');
    case 'ultrasound':
      return t('guidance_ultrasound');
    case 'usEmg':
      return t('guidance_usEmg');
    case 'electricalStimulation':
      return t('guidance_electricalStimulation');
    case 'anatomicalLandmarks':
      return t('guidance_anatomicalLandmarks');
    case 'none':
      return t('guidance_none');
    case 'other':
      return t('guidance_other');
    default:
      return String(g);
  }
}

function modalityLabel(m: TreatmentModality, t: ExportTranslator): string {
  switch (m) {
    case 'botulinum_toxin':
      return t('modality_botulinum_toxin');
    case 'baclofen_pump':
      return t('modality_baclofen_pump');
    case 'surgery':
      return t('modality_surgery');
    case 'other':
      return t('modality_other');
    default:
      return String(m);
  }
}
