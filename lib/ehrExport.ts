import type { GuidanceMethod, InjectionSide } from './types';
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
      const sentence = buildGoalSentence(goal.id, checkins);
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
function buildGoalSentence(goalId: string, checkins: ExportCheckin[]): string {
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

  // GAS ≥0 onset + sustained
  let zeroPlusClause = 'Did not reach GAS ≥0 this cycle.';
  const firstZeroPlusIdx = reports.findIndex((r) => r.gas >= 0);
  if (firstZeroPlusIdx !== -1) {
    const firstWeek = reports[firstZeroPlusIdx].week;
    let sustained = 0;
    for (let i = firstZeroPlusIdx; i < reports.length; i++) {
      if (reports[i].gas < 0) break;
      sustained++;
    }
    zeroPlusClause = `GAS ≥0 from W${firstWeek}, sustained ${sustained} week${
      sustained === 1 ? '' : 's'
    }.`;
  }

  // Wearing-off detection (uses reports AFTER the peak week)
  const postPeak = reports.filter((r) => r.week > peakReport.week);
  let wearingOff = 'Wearing-off: none.';
  const clearReport = postPeak.find(
    (r) => peak - r.gas >= 2 || r.gas <= initial
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

  return [peakStr, zeroPlusClause, wearingOff, endStr].join(' ');
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
  }
}

function formatSigned(v: number): string {
  if (v > 0) return `+${v}`;
  return String(v);
}
