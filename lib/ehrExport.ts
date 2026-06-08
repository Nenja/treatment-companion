import type { GuidanceMethod, InjectionSide, TreatmentModality } from './types';
import { formatLongDate } from './dates';

// ---------------------------------------------------------------------------
// EHR-paste export builder.
//
// Returns a plain-text block the clinician can paste into a hospital
// notes field. Output is purely descriptive — no outcome judgments, no
// "successful" / "failed", no recommendations. The clinician edits it
// in a textarea before copying.
//
// LOCALISED: every label and sentence fragment comes from the `ehrExport`
// message namespace via the `t` translator passed in by the (client) call
// site, so the note follows the app locale rather than being English-only.
// Dates are localised via formatLongDate(locale). The builder itself stays
// a pure, framework-free function (testable, usable from any call site) —
// the caller owns the translator.
//
// Inputs use small purpose-built shapes (defined below) rather than the
// full entity types, so call sites pass only the fields the export
// consumes.
// ---------------------------------------------------------------------------

/** Minimal translator shape: next-intl's `useTranslations(...)` return value
 *  is structurally compatible (the caller casts to this). */
export type ExportTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string;

export interface ExportPatient {
  displayName: string;
}

export interface ExportCycle {
  cycleNumber: number;
  startDate: string;
  /** Treatment modality. Omitted / botulinum_toxin renders nothing extra,
   *  so existing BoNT exports are unchanged; a non-default modality adds a
   *  short label line (WP4 readiness). */
  modality?: TreatmentModality;
}

export interface ExportInjection {
  muscle: string;
  side: InjectionSide;
  doseUnits: number;
  note?: string;
  /** True when this injection is a face mark (located on the face map),
   *  so the export can list it under a separate "Face injections" group. */
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

export interface ExportGoal {
  id: string;
  patientFacingText: string;
  /** Goal kind + (for NRS goals) which end of the 0–10 scale is good.
   *  Lets the summary annotate an otherwise-ambiguous raw NRS value —
   *  e.g. on a lower-is-better goal "NRS 2/10" is a GOOD result, which
   *  a reader scanning the note would otherwise misread. */
  kind?: 'nrs' | 'gas';
  nrsDirection?: 'higherIsBetter' | 'lowerIsBetter';
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
  patient: ExportPatient;
  cycle: ExportCycle;
  treatment?: ExportTreatment;
  goals: ExportGoal[];
  checkins: ExportCheckin[];
  locale: string;
  /** Translator scoped to the `ehrExport` namespace. */
  t: ExportTranslator;
}

export function buildEhrExport({
  patient,
  cycle,
  treatment,
  goals,
  checkins,
  locale,
  t
}: BuildExportArgs): string {
  const lines: string[] = [];

  // Header ----------------------------------------------------------------
  lines.push(t('summaryTitle', { name: patient.displayName }));
  lines.push(
    t('cycleLine', {
      cycle: cycle.cycleNumber,
      date: formatLongDate(cycle.startDate, locale)
    })
  );
  if (cycle.modality && cycle.modality !== 'botulinum_toxin') {
    lines.push(
      t('modalityLine', { modality: modalityLabel(cycle.modality, t) })
    );
  }
  lines.push('');

  // Treatment session -----------------------------------------------------
  if (treatment) {
    lines.push(t('treatmentHeading'));
    const headerParts = [
      t('treatmentDate', { date: formatLongDate(treatment.date, locale) }),
      treatment.drugProduct,
      t('unitsTotal', { units: treatment.totalUnits })
    ];
    if (treatment.dilution)
      headerParts.push(t('dilution', { dilution: treatment.dilution }));
    headerParts.push(t('guidance', { guidance: guidanceLabel(treatment.guidance, t) }));
    lines.push(headerParts.join(' · '));
    const standardInjections = treatment.injections.filter((i) => !i.isFace);
    const faceInjections = treatment.injections.filter((i) => i.isFace);
    const renderInjection = (inj: ExportInjection): string =>
      t('injectionLine', {
        muscle: inj.muscle,
        side: sideLabel(inj.side, t),
        units: inj.doseUnits,
        // Note suffix is punctuation + free text, locale-neutral.
        note: inj.note ? ` — ${inj.note}` : ''
      });
    if (standardInjections.length > 0) {
      lines.push(t('injectionsHeading'));
      for (const inj of standardInjections) lines.push(renderInjection(inj));
    }
    if (faceInjections.length > 0) {
      lines.push(t('faceInjectionsHeading'));
      for (const inj of faceInjections) lines.push(renderInjection(inj));
    }
    if (treatment.notes) {
      lines.push(t('notes', { notes: treatment.notes }));
    }
    // Reconciliation: the recorded total is printed verbatim above. If the
    // per-injection doses don't add up to it, surface the discrepancy rather
    // than letting an internally-inconsistent figure go silently into the
    // record. Only when there is at least one injection to sum.
    if (treatment.injections.length > 0) {
      const injSum = treatment.injections.reduce((s, i) => s + i.doseUnits, 0);
      if (injSum !== treatment.totalUnits) {
        lines.push(
          t('reconciliation', { sum: injSum, total: treatment.totalUnits })
        );
      }
    }
    lines.push('');
  } else {
    lines.push(t('treatmentNotRecorded'));
    lines.push('');
  }

  // Goals + reported ratings ----------------------------------------------
  if (goals.length > 0) {
    lines.push(t('goalsHeading'));
    for (const goal of goals) {
      lines.push(`- ${goal.patientFacingText}`);
      const sentence = buildGoalSentence(goal, checkins, t);
      lines.push(`  ${sentence}`);
    }
    lines.push('');
  }

  // Patient comments (verbatim, chronological) ----------------------------
  const comments = checkins
    .filter((c) => c.comment?.trim())
    .sort((a, b) => a.weekNumber - b.weekNumber);
  if (comments.length > 0) {
    lines.push(t('commentsHeading'));
    for (const c of comments) {
      lines.push(
        t('commentLine', { week: c.weekNumber, comment: c.comment!.trim() })
      );
    }
    lines.push('');
  }

  // Strip trailing blank line for clean copy.
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
}

/**
 * Builds the one-line summary sentence for a goal across a cycle.
 *
 * Pattern (localised):
 *   "Peak GAS [x] / NRS [n]/10 (W[x]). GAS ≥0 from W[x], sustained [n] weeks.
 *    Wearing-off [none / possible from W[x] / clear from W[x]].
 *    End-cycle GAS [x] / NRS [n]/10 (W[x]).  [(NRS: lower is better.)]"
 *
 * Wearing-off detection (on GAS):
 *   - "possible from W[x]" if any post-peak rating drops by ≥1 from peak;
 *   - "clear from W[x]" if any post-peak rating drops by ≥2 from peak, OR
 *     returns to/below the initial GAS *and the patient rose above it first*
 *     (peak > initial) — so a stable/flat-good series isn't reported as
 *     wearing off;
 *   - "none" otherwise.
 *
 * "Sustained" counts CONSECUTIVE CALENDAR weeks at GAS ≥0 from the first
 * such week; a GAS dip <0 OR a skipped week (a gap in week numbers) ends
 * the streak.
 */
function buildGoalSentence(
  goal: ExportGoal,
  checkins: ExportCheckin[],
  t: ExportTranslator
): string {
  const goalId = goal.id;
  const reports = checkins
    .flatMap((c) => {
      const r = c.ratings.find((rr) => rr.approvedGoalId === goalId);
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

  if (reports.length === 0) {
    return t('noRatings');
  }

  const peak = reports.reduce((m, r) => Math.max(m, r.gas), -Infinity);
  const peakReport = reports.find((r) => r.gas === peak)!;
  const initial = reports[0].gas;

  // GAS ≥0 onset + sustained (consecutive calendar weeks).
  let zeroPlusClause = t('notReachedZero');
  const firstZeroPlusIdx = reports.findIndex((r) => r.gas >= 0);
  if (firstZeroPlusIdx !== -1) {
    const firstWeek = reports[firstZeroPlusIdx].week;
    let sustained = 0;
    let prevWeek: number | null = null;
    for (let i = firstZeroPlusIdx; i < reports.length; i++) {
      if (reports[i].gas < 0) break;
      if (prevWeek !== null && reports[i].week !== prevWeek + 1) break;
      sustained++;
      prevWeek = reports[i].week;
    }
    zeroPlusClause = t('reachedZero', { week: firstWeek, count: sustained });
  }

  // Wearing-off detection (post-peak weeks); the return-to-baseline clause
  // is gated on an actual rise (peak > initial).
  const postPeak = reports.filter((r) => r.week > peakReport.week);
  let wearingOff = t('wearingNone');
  const clearReport = postPeak.find(
    (r) => peak - r.gas >= 2 || (peak > initial && r.gas <= initial)
  );
  if (clearReport) {
    wearingOff = t('wearingClear', { week: clearReport.week });
  } else {
    const possibleReport = postPeak.find((r) => peak - r.gas >= 1);
    if (possibleReport) {
      wearingOff = t('wearingPossible', { week: possibleReport.week });
    }
  }

  const endCycle = reports[reports.length - 1];

  const peakStr =
    peakReport.nrs !== null
      ? t('peakWithNrs', {
          gas: formatSigned(peak),
          nrs: peakReport.nrs,
          week: peakReport.week
        })
      : t('peakNoNrs', { gas: formatSigned(peak), week: peakReport.week });
  const endStr =
    endCycle.nrs !== null
      ? t('endWithNrs', {
          gas: formatSigned(endCycle.gas),
          nrs: endCycle.nrs,
          week: endCycle.week
        })
      : t('endNoNrs', { gas: formatSigned(endCycle.gas), week: endCycle.week });

  // On a lower-is-better NRS goal, a low raw NRS is GOOD; the GAS values are
  // already direction-normalised but the raw NRS is not, so annotate once.
  const dirNote =
    goal.kind === 'nrs' && goal.nrsDirection === 'lowerIsBetter'
      ? ' ' + t('nrsLowerBetterNote')
      : '';

  return [peakStr, zeroPlusClause, wearingOff, endStr].join(' ') + dirNote;
}

// --- Helpers ------------------------------------------------------------

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

function formatSigned(v: number): string {
  if (v > 0) return `+${v}`;
  return String(v);
}
