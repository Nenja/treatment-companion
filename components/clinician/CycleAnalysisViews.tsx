'use client';

import { useState } from 'react';
import type {
  CycleAnalysis,
  MuscleDoseTrend
} from '@/lib/supabase/patientCycleAnalysis';

/**
 * Three displays for the deeper longitudinal analysis:
 *   - BenefitDurationTable: per-cycle peak rating + how long benefit
 *     lasted before fading.
 *   - MuscleDoseChart: a small multi-line chart of dose per muscle
 *     across cycles (recurring muscles only).
 *   - RetreatmentTimingTable: re-treatment interval shown against the
 *     week benefit faded — was the next treatment timed well.
 *
 * Tables rather than charts where the data is a handful of per-cycle
 * facts: a 3-cycle "curve" is harder to read than three labelled
 * rows. The per-muscle dose IS a chart because it is genuinely
 * several series over time.
 */

// ---- 1. Benefit duration --------------------------------------------------

export function BenefitDurationTable({
  cycles,
  labels
}: {
  cycles: CycleAnalysis[];
  labels: {
    cycle: string;
    peak: string;
    duration: string;
    weeks: string;
    held: string;
    noData: string;
  };
}) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-stone text-left text-ink-muted">
          <th className="py-1.5 font-semibold">{labels.cycle}</th>
          <th className="py-1.5 font-semibold">{labels.peak}</th>
          <th className="py-1.5 text-right font-semibold">
            {labels.duration}
          </th>
        </tr>
      </thead>
      <tbody>
        {cycles.map((c) => (
          <tr key={c.cycleId} className="border-b border-stone/60">
            <td className="py-2 text-ink">
              {labels.cycle} {c.cycleNumber}
            </td>
            <td className="py-2 text-ink-soft">
              {c.peakGas === null
                ? labels.noData
                : c.peakGas > 0
                  ? `+${c.peakGas}`
                  : `${c.peakGas}`}
            </td>
            <td className="py-2 text-right text-ink-soft">
              {c.peakGas === null
                ? labels.noData
                : c.benefitHeld
                  ? labels.held
                  : `${c.fadeWeek} ${labels.weeks}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ---- 2. Per-muscle dose chart ---------------------------------------------

const W = 320;
const H = 170;
const PAD_L = 36;
const PAD_R = 10;
const PAD_T = 12;
const PAD_B = 40;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

// A small set of distinguishable line colours, drawn from the theme
// where possible so the chart still respects the palette.
const SERIES_COLORS = [
  'var(--color-sage-deep)',
  'var(--color-amber-deep)',
  'var(--color-focus)',
  'var(--color-ink-soft)',
  'var(--color-sage)'
];

export function MuscleDoseChart({
  trends,
  cycleLabel,
  emptyLabel,
  allHiddenLabel
}: {
  trends: MuscleDoseTrend[];
  cycleLabel: string;
  emptyLabel: string;
  /** Shown when the physician has toggled every muscle off. */
  allHiddenLabel: string;
}) {
  // Muscles the physician has toggled OFF. Empty = all shown.
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const toggle = (muscle: string) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(muscle)) next.delete(muscle);
      else next.add(muscle);
      return next;
    });
  };

  if (trends.length === 0) {
    return <p className="text-[13px] text-ink-muted">{emptyLabel}</p>;
  }

  // Colour is fixed by each muscle's ORIGINAL index, so a muscle keeps
  // its colour no matter which others are toggled.
  const colorFor = (muscle: string): string => {
    const idx = trends.findIndex((t) => t.muscle === muscle);
    return SERIES_COLORS[idx % SERIES_COLORS.length];
  };

  const visibleTrends = trends.filter((t) => !hidden.has(t.muscle));

  // X axis spans all cycles across ALL trends (so the axis doesn't
  // jump around as muscles are toggled). Y axis scales to the VISIBLE
  // muscles, so hiding a high-dose line usefully rescales the rest.
  const allCycleNums = Array.from(
    new Set(trends.flatMap((t) => t.points.map((p) => p.cycleNumber)))
  ).sort((a, b) => a - b);
  const minCycle = allCycleNums[0];
  const maxCycle = allCycleNums[allCycleNums.length - 1];
  const visibleDoses = visibleTrends.flatMap((t) =>
    t.points.map((p) => p.doseUnits)
  );
  const maxDose = visibleDoses.length > 0 ? Math.max(...visibleDoses) : 50;
  const axisTop = Math.ceil(maxDose / 50) * 50 || 50;

  const xFor = (cycleNum: number): number => {
    if (maxCycle === minCycle) return PAD_L + PLOT_W / 2;
    return (
      PAD_L + ((cycleNum - minCycle) / (maxCycle - minCycle)) * PLOT_W
    );
  };
  const yFor = (dose: number): number =>
    PAD_T + PLOT_H - (dose / axisTop) * PLOT_H;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Dose per muscle across cycles"
      >
        {/* Y axis */}
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={PAD_T + PLOT_H}
          stroke="var(--color-stone)"
          strokeWidth="1"
        />
        <text
          x={PAD_L - 5}
          y={PAD_T + PLOT_H + 3}
          textAnchor="end"
          fontSize="9"
          fill="var(--color-ink-muted)"
        >
          0
        </text>
        <text
          x={PAD_L - 5}
          y={PAD_T + 4}
          textAnchor="end"
          fontSize="9"
          fill="var(--color-ink-muted)"
        >
          {axisTop}
        </text>

        {/* X axis cycle labels */}
        {allCycleNums.map((cn) => (
          <text
            key={cn}
            x={xFor(cn)}
            y={PAD_T + PLOT_H + 14}
            textAnchor="middle"
            fontSize="9"
            fill="var(--color-ink-muted)"
          >
            {cycleLabel} {cn}
          </text>
        ))}

        {/* One line per VISIBLE muscle */}
        {visibleTrends.map((t) => {
          const color = colorFor(t.muscle);
          return (
            <g key={t.muscle}>
              <polyline
                points={t.points
                  .map((p) => `${xFor(p.cycleNumber)},${yFor(p.doseUnits)}`)
                  .join(' ')}
                fill="none"
                stroke={color}
                strokeWidth="2"
              />
              {t.points.map((p) => (
                <circle
                  key={p.cycleNumber}
                  cx={xFor(p.cycleNumber)}
                  cy={yFor(p.doseUnits)}
                  r="3"
                  fill={color}
                />
              ))}
            </g>
          );
        })}

        {/* All muscles toggled off — gentle hint inside the plot. */}
        {visibleTrends.length === 0 && (
          <text
            x={PAD_L + PLOT_W / 2}
            y={PAD_T + PLOT_H / 2}
            textAnchor="middle"
            fontSize="10"
            fill="var(--color-ink-muted)"
          >
            {allHiddenLabel}
          </text>
        )}
      </svg>

      {/* Legend — each muscle is a toggle button. Tapping shows/hides
          its line. A hidden muscle dims and strikes through. */}
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {trends.map((t) => {
          const isHidden = hidden.has(t.muscle);
          return (
            <li key={t.muscle}>
              <button
                type="button"
                onClick={() => toggle(t.muscle)}
                aria-pressed={!isHidden}
                className={`flex min-h-8 items-center gap-1.5 rounded-[var(--radius-button)] border px-2 py-1 ${
                  isHidden
                    ? 'border-stone bg-cream'
                    : 'border-sage/40 bg-sage-soft'
                }`}
              >
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{
                    background: isHidden
                      ? 'var(--color-stone)'
                      : colorFor(t.muscle)
                  }}
                />
                <span
                  className={`text-[12px] ${
                    isHidden
                      ? 'text-ink-muted line-through'
                      : 'font-semibold text-ink-soft'
                  }`}
                >
                  {t.muscle}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- 3. Re-treatment timing -----------------------------------------------

export function RetreatmentTimingTable({
  cycles,
  labels
}: {
  cycles: CycleAnalysis[];
  labels: {
    cycle: string;
    interval: string;
    fadeVsRetreat: string;
    weeks: string;
    held: string;
    noNext: string;
    faded: string;
    onTime: string;
    late: string;
  };
}) {
  return (
    <table className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-stone text-left text-ink-muted">
          <th className="py-1.5 font-semibold">{labels.cycle}</th>
          <th className="py-1.5 font-semibold">{labels.interval}</th>
          <th className="py-1.5 text-right font-semibold">
            {labels.fadeVsRetreat}
          </th>
        </tr>
      </thead>
      <tbody>
        {cycles.map((c) => {
          // Only cycles that have a NEXT treatment have an interval.
          const hasNext = c.weeksToNextTreatment !== null;
          // Timing verdict: if benefit faded and the next treatment
          // came well after the fade week, re-treatment was late.
          let verdict = '';
          if (hasNext) {
            if (c.benefitHeld) {
              verdict = labels.onTime;
            } else if (c.fadeWeek !== null) {
              const gap =
                (c.weeksToNextTreatment as number) - c.fadeWeek;
              // 3+ weeks between benefit fading and re-treatment is
              // a meaningful "gap with no benefit".
              verdict =
                gap >= 3
                  ? `${labels.late} (${labels.faded} ${labels.weeks} ${c.fadeWeek})`
                  : labels.onTime;
            }
          }
          return (
            <tr key={c.cycleId} className="border-b border-stone/60">
              <td className="py-2 text-ink">
                {labels.cycle} {c.cycleNumber}
              </td>
              <td className="py-2 text-ink-soft">
                {hasNext
                  ? `${c.weeksToNextTreatment} ${labels.weeks}`
                  : labels.noNext}
              </td>
              <td className="py-2 text-right text-ink-soft">
                {hasNext ? verdict : '—'}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
