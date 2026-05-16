import type {
  ApprovedGoal,
  Patient,
  TreatmentCycle,
  TreatmentSession,
  WeeklyCheckin,
  GuidanceMethod,
  InjectionSide
} from './types';
import { formatLongDate } from './dates';

// ---------------------------------------------------------------------------
// EHR-paste export builder.
//
// Returns a plain-text block the clinician can paste into a hospital
// notes field. Output is purely descriptive — no outcome judgments, no
// "successful" / "failed", no recommendations. The clinician edits it
// in a textarea before copying.
// ---------------------------------------------------------------------------

interface BuildExportArgs {
  patient: Patient;
  cycle: TreatmentCycle;
  treatment?: TreatmentSession;
  goals: ApprovedGoal[];
  checkins: WeeklyCheckin[];
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
    `Cycle ${cycle.cycleNumber} · Length ${cycle.lengthWeeks ?? 12} weeks · Review ${formatLongDate(cycle.reviewDate, locale)}`
  );
  lines.push('');

  // Treatment session -----------------------------------------------------
  if (treatment) {
    lines.push('Treatment');
    lines.push('Treatment');
    const headerParts = [
      `Date: ${formatLongDate(treatment.date, locale)}`,
      treatment.drugProduct,
      `${treatment.totalUnits} units total`
    ];
    if (treatment.dilution) headerParts.push(`Dilution: ${treatment.dilution}`);
    lines.push(headerParts.join(' · '));
    if (treatment.injections.length > 0) {
      lines.push('Injections:');
      for (const inj of treatment.injections) {
        lines.push(
          `- ${inj.muscle} (${sideLabel(inj.side)}) — ${inj.doseUnits} units, ${guidanceLabel(inj.guidance)}`
        );
      }
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
      const goalRatings = checkins
        .flatMap((c) => {
          const r = c.ratings.find((rr) => rr.approvedGoalId === goal.id);
          if (!r || typeof r.ratingValue !== 'number') return [];
          return [{ week: c.weekNumber, value: r.ratingValue }];
        })
        .sort((a, b) => a.week - b.week);

      if (goalRatings.length === 0) {
        lines.push('  Patient reported: no ratings yet this cycle.');
      } else {
        const weeks = goalRatings.map((r) => r.week);
        const values = goalRatings.map((r) => r.value);
        const minV = Math.min(...values);
        const maxV = Math.max(...values);
        const mode = mostFrequent(values);
        const weekList = formatWeekRanges(weeks);
        lines.push(
          `  Patient reported: weeks ${weekList} (${goalRatings.length} of ${cycle.lengthWeeks ?? 12}). Range: ${formatSigned(minV)} to ${formatSigned(maxV)}.`
        );
        lines.push(
          `  Most-reported value: ${formatSigned(mode)}${mode === 0 ? ' (as expected)' : ''}.`
        );
      }
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

function mostFrequent(values: number[]): number {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [v, c] of counts) {
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Collapse a sorted array of week numbers into ranges where possible.
 * [1,2,3,5,6] → "1-3, 5-6". Used in the export header.
 */
function formatWeekRanges(weeks: number[]): string {
  if (weeks.length === 0) return '';
  const sorted = [...weeks].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    if (w === prev + 1) {
      prev = w;
      continue;
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = w;
    prev = w;
  }
  ranges.push(start === prev ? `${start}` : `${start}-${prev}`);
  return ranges.join(', ');
}
