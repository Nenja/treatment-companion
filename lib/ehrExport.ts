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
// Inputs use small purpose-built shapes (defined below) rather than the
// full entity types. That way both prototype call sites and Supabase
// call sites can pass only the fields the export actually consumes,
// without having to fabricate values for fields the export doesn't use.
// ---------------------------------------------------------------------------

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
}

export function buildEhrExport({
  patient,
  cycle,
  treatment,
  goals,
  checkins,
  locale
}: BuildExportArgs): string {
  const lines: string[] = [];

  // Header ----------------------------------------------------------------
  lines.push(`Treatment companion summary — ${patient.displayName}`);
  lines.push(
    `Cycle ${cycle.cycleNumber} · Treatment date ${formatLongDate(cycle.startDate, locale)}`
  );
  if (cycle.modality && cycle.modality !== 'botulinum_toxin') {
    const modalityLabel: Record<TreatmentModality, string> = {
      botulinum_toxin: 'Botulinum toxin',
      baclofen_pump: 'Baclofen pump',
      surgery: 'Surgery',
      other: 'Other'
    };
    lines.push(`Treatment modality: ${modalityLabel[cycle.modality]}`);
  }
  lines.push('');

  // Treatment session -----------------------------------------------------
  if (treatment) {
    lines.push('Treatment');
    const headerParts = [
      `Date: ${formatLongDate(treatment.date, locale)}`,
      treatment.drugProduct,
      `${treatment.totalUnits} units total`
    ];
    if (treatment.dilution) headerParts.push(`Dilution: ${treatment.dilution}`);
    headerParts.push(`Guidance: ${guidanceLabel(treatment.guidance)}`);
    lines.push(headerParts.join(' · '));
    const standardInjections = treatment.injections.filter((i) => !i.isFace);
    const faceInjections = treatment.injections.filter((i) => i.isFace);
    const renderInjection = (inj: ExportInjection): string => {
      const noteSuffix = inj.note ? ` — ${inj.note}` : '';
      return `- ${inj.muscle} (${sideLabel(inj.side)}) — ${inj.doseUnits} units${noteSuffix}`;
    };
    if (standardInjections.length > 0) {
      lines.push('Injections:');
      for (const inj of standardInjections) lines.push(renderInjection(inj));
    }
    if (faceInjections.length > 0) {
      lines.push('Face injections:');
      for (const inj of faceInjections) lines.push(renderInjection(inj));
    }
    if (treatment.notes) {
      lines.push(`Notes: ${treatment.notes}`);
    }
    // Reconciliation: the recorded total is printed verbatim above. If the
    // per-injection doses don't add up to it, surface the discrepancy rather
    // than letting an internally-inconsistent figure go silently into the
    // record. Only when there is at least one injection to sum.
    if (treatment.injections.length > 0) {
      const injSum = treatment.injections.reduce(
        (s, i) => s + i.doseUnits,
        0
      );
      if (injSum !== treatment.totalUnits) {
        lines.push(
          `Note: listed injections sum to ${injSum} units (recorded total ${treatment.totalUnits}).`
        );
      }
    }
    lines.push('');
  } else {
    lines.push('Treatment: not recorded.');
    lines.push('');
  }

  // Goals + reported ratings ----------------------------------------------
  if (goals.length > 0) {
    lines.push('Goals this cycle:');
    for (const goal of goals) {
      lines.push(`- ${goal.patientFacingText}`);
      const sentence = buildGoalSentence(goal, checkins);
      lines.push(`  ${sentence}`);
    }
    lines.push('');
  }

  // Patient comments (verbatim, chronological) ----------------------------
  const comments = checkins
    .filter((c) => c.comment?.trim())
    .sort((a, b) => a.weekNumber - b.weekNumber);
  if (comments.length > 0) {
    lines.push('Patient comments:');
    for (const c of comments) {
      lines.push(`Week ${c.weekNumber}: ${c.comment!.trim()}`);
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
 * Pattern:
 *   "Peak GAS [x] / NRS [n]/10 (W[x]). GAS ≥0 from W[x], sustained [n] weeks.
 *    Wearing-off [none / possible from W[x] / clear from W[x]].
 *    End-cycle GAS [x] / NRS [n]/10 (W[x])."
 *
 * Wearing-off detection (on GAS):
 *   - "possible from W[x]" if any post-peak rating drops by ≥1 from
 *     the peak GAS value;
 *   - "clear from W[x]" if any post-peak rating drops by ≥2 from peak,
 *     OR returns to the patient's initial (first) GAS;
 *   - "none" otherwise.
 *
 * "Sustained" counts CONSECUTIVE reported weeks at GAS ≥0 from the
 * first such week. Skipped weeks break the sustained streak.
 */
function buildGoalSentence(
  goal: ExportGoal,
  checkins: ExportCheckin[]
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
    return 'No ratings reported this cycle.';
  }

  const peak = reports.reduce((m, r) => Math.max(m, r.gas), -Infinity);
  const peakReport = reports.find((r) => r.gas === peak)!;
  const initial = reports[0].gas;

  // GAS ≥0 onset + sustained.
  // "Sustained" counts CONSECUTIVE CALENDAR weeks at GAS ≥0 from the
  // first such week. A break in GAS (a reported week <0) ends the
  // streak; so does a SKIPPED week (a gap in week numbers), because an
  // unreported week is not evidence of a sustained effect. We therefore
  // step through the reports from the first ≥0 week and stop as soon as
  // either the GAS dips below 0 or the week number is not exactly one
  // more than the previous counted week.
  let zeroPlusClause = 'Did not reach GAS ≥0 this cycle.';
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
    zeroPlusClause = `GAS ≥0 from W${firstWeek}, sustained ${sustained} week${
      sustained === 1 ? '' : 's'
    }.`;
  }

  // Wearing-off detection (uses reports AFTER the peak week).
  //
  // Two ways a post-peak week counts as "clear" wearing-off:
  //   (a) it drops ≥2 GAS below the peak; or
  //   (b) it returns to or below the patient's initial level — but ONLY
  //       if the patient actually rose above that initial level first
  //       (peak > initial). Without the `peak > initial` guard a stable
  //       or flat series (e.g. +1 every week, initial = peak = +1) would
  //       wrongly report "clear wearing-off", because every week is
  //       trivially ≤ initial. The guard restricts (b) to genuine
  //       return-to-baseline after a rise.
  const postPeak = reports.filter((r) => r.week > peakReport.week);
  let wearingOff = 'Wearing-off: none.';
  const clearReport = postPeak.find(
    (r) => peak - r.gas >= 2 || (peak > initial && r.gas <= initial)
  );
  if (clearReport) {
    wearingOff = `Clear wearing-off from W${clearReport.week}.`;
  } else {
    const possibleReport = postPeak.find((r) => peak - r.gas >= 1);
    if (possibleReport) {
      wearingOff = `Possible wearing-off from W${possibleReport.week}.`;
    }
  }

  const endCycle = reports[reports.length - 1];

  const peakStr =
    peakReport.nrs !== null
      ? `Peak GAS ${formatSigned(peak)} / NRS ${peakReport.nrs}/10 (W${peakReport.week}).`
      : `Peak GAS ${formatSigned(peak)} (W${peakReport.week}).`;
  const endStr =
    endCycle.nrs !== null
      ? `End-cycle GAS ${formatSigned(endCycle.gas)} / NRS ${endCycle.nrs}/10 (W${endCycle.week}).`
      : `End-cycle GAS ${formatSigned(endCycle.gas)} (W${endCycle.week}).`;

  // On a lower-is-better NRS goal, a low raw NRS (e.g. 2/10) is a GOOD
  // result. The GAS values above are already direction-normalised, but
  // the raw NRS printed alongside them is not — so annotate it once to
  // prevent a misread. Higher-is-better is the intuitive default and
  // needs no note.
  const dirNote =
    goal.kind === 'nrs' && goal.nrsDirection === 'lowerIsBetter'
      ? ' (NRS: lower is better.)'
      : '';

  return [peakStr, zeroPlusClause, wearingOff, endStr].join(' ') + dirNote;
}

// --- Helpers ------------------------------------------------------------

function sideLabel(side: InjectionSide): string {
  switch (side) {
    case 'left':
      return 'L';
    case 'right':
      return 'R';
    case 'bilateral':
      return 'B';
    default:
      return String(side);
  }
}

function guidanceLabel(g: GuidanceMethod): string {
  switch (g) {
    case 'emg':
      return 'EMG';
    case 'ultrasound':
      return 'ultrasound';
    case 'usEmg':
      return 'ultrasound + EMG';
    case 'electricalStimulation':
      return 'electrical stimulation';
    case 'anatomicalLandmarks':
      return 'anatomical landmarks';
    case 'none':
      return 'no guidance';
    case 'other':
      return 'other guidance';
    default:
      return String(g);
  }
}

function formatSigned(v: number): string {
  if (v > 0) return `+${v}`;
  return String(v);
}
