'use client';

import type { CycleTrendPoint } from '@/lib/supabase/patientTrend';
import { formatMonthYear } from '@/lib/dates';

/**
 * Dose-per-cycle chart for the history page: a bar per cycle, height =
 * total units. Hand-built SVG, matching the app's existing
 * GoalProgressView approach (the main app does not bundle a charting
 * library). All colours come from CSS variables, so it follows the
 * active palette and day/night mode.
 *
 * Cycles are labelled with their treatment month (e.g. "Jan 2025").
 * Cycles with no recorded treatment (totalUnits null) are drawn as a
 * gap — the bar is omitted and a muted "—" sits on the axis.
 *
 * The former "outcome per cycle" connected line was removed: averaging
 * GAS across a cycle's goals and joining the result across cycles is
 * misleading, because goals are living and differ each cycle (a harder
 * replacement goal scoring lower reads as regression when it is
 * progress). Per-cycle goal outcomes are shown instead by
 * CycleGoalsBreakdown (see below).
 */

const W = 320;
const H = 158;
const PAD_L = 34;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 30;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/**
 * X position for a cycle at `index` of `count`. Positions sit inside
 * an INSET band — half of `slotWidth` is kept clear at each end — so a
 * bar or marker centred on the first or last position still has its
 * full width inside the plot, never overlapping the Y axis or running
 * off the right edge.
 */
function cycleX(index: number, count: number, slotWidth: number): number {
  const inset = slotWidth / 2;
  const usable = PLOT_W - slotWidth; // band between the two insets
  if (count === 1) return PAD_L + PLOT_W / 2;
  return PAD_L + inset + (index / (count - 1)) * usable;
}

export function DosePerCycleChart({
  cycles,
  unitsLabel,
  locale
}: {
  cycles: CycleTrendPoint[];
  unitsLabel: string;
  locale: string;
}) {
  const doses = cycles
    .map((c) => c.totalUnits)
    .filter((u): u is number => u !== null);
  const maxDose = doses.length > 0 ? Math.max(...doses) : 100;
  // Round the axis top up to a tidy number.
  const axisTop = Math.ceil(maxDose / 100) * 100 || 100;

  // Each cycle gets an equal slot; the bar fills part of it. The slot
  // width is also what cycleX insets by, so bars never overflow.
  const slotWidth = PLOT_W / Math.max(cycles.length, 1);
  const barWidth = Math.min(34, slotWidth * 0.55);

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-[13px] font-semibold text-ink-soft">
        {unitsLabel}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={unitsLabel}
      >
        {/* Y axis line */}
        <line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={PAD_T + PLOT_H}
          stroke="var(--color-stone)"
          strokeWidth="1"
        />
        {/* Y axis: 0 and top labels */}
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

        {cycles.map((c, i) => {
          const cx = cycleX(i, cycles.length, slotWidth);
          const dateLabel = formatMonthYear(c.startDate, locale);
          if (c.totalUnits === null) {
            return (
              <g key={c.cycleId}>
                <text
                  x={cx}
                  y={PAD_T + PLOT_H / 2}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--color-ink-muted)"
                >
                  —
                </text>
                <text
                  x={cx}
                  y={PAD_T + PLOT_H + 16}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--color-ink-muted)"
                >
                  {dateLabel}
                </text>
              </g>
            );
          }
          const barH = (c.totalUnits / axisTop) * PLOT_H;
          const barY = PAD_T + PLOT_H - barH;
          return (
            <g key={c.cycleId}>
              <rect
                x={cx - barWidth / 2}
                y={barY}
                width={barWidth}
                height={barH}
                rx="3"
                fill="var(--color-sage-deep)"
              />
              {/* Dose value above the bar */}
              <text
                x={cx}
                y={barY - 4}
                textAnchor="middle"
                fontSize="9"
                fontWeight="600"
                fill="var(--color-ink-soft)"
              >
                {c.totalUnits}
              </text>
              {/* Date label on the axis */}
              <text
                x={cx}
                y={PAD_T + PLOT_H + 16}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-ink-muted)"
              >
                {dateLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

/**
 * Per-cycle goal outcomes — the honest replacement for the old
 * connected "outcome per cycle" line. For each cycle it lists the
 * goals and how each ended: achieved, partially achieved, or no longer
 * suitable (for retired goals), or "ongoing" for goals still active.
 * This shows the *climb* (achieved goals giving way to harder ones)
 * and course-corrections, without implying a false GAS trajectory
 * across goals that are not the same from cycle to cycle.
 *
 * Labels are passed in (localised by the caller).
 */
export function CycleGoalsBreakdown({
  cycles,
  locale,
  labels
}: {
  cycles: CycleTrendPoint[];
  locale: string;
  labels: {
    achieved: string;
    partial: string;
    noLongerSuitable: string;
    ongoing: string;
    retired: string;
    noGoals: string;
    gasTag: string;
    nrsTag: string;
  };
}) {
  const outcomeChip = (
    outcome: 'achieved' | 'partial' | 'noLongerSuitable' | null,
    status: string
  ): { text: string; className: string } => {
    if (status === 'active') {
      return { text: labels.ongoing, className: 'bg-stone text-ink-soft' };
    }
    switch (outcome) {
      case 'achieved':
        return { text: labels.achieved, className: 'bg-sage-soft text-sage-deep' };
      case 'partial':
        return { text: labels.partial, className: 'bg-amber-soft text-amber-deep' };
      case 'noLongerSuitable':
        return {
          text: labels.noLongerSuitable,
          className: 'bg-stone text-ink-soft'
        };
      default:
        // archived/combined without a recorded outcome (data from
        // before outcomes were captured) — say "retired", not
        // "ongoing", since the goal is no longer active.
        return { text: labels.retired, className: 'bg-stone text-ink-soft' };
    }
  };

  return (
    <div className="space-y-4">
      {cycles.map((c) => (
        <div key={c.cycleId}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink">
              {formatMonthYear(c.startDate, locale)}
            </h3>
          </div>
          {c.goals.length === 0 ? (
            <p className="mt-1 text-[13px] text-ink-muted">{labels.noGoals}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {c.goals.map((g) => {
                const chip = outcomeChip(
                  g.outcome,
                  g.status
                );
                return (
                  <li
                    key={g.id}
                    className="flex items-start justify-between gap-3 rounded-[var(--radius-button)] border border-stone/70 bg-cream px-3 py-2"
                  >
                    <span className="min-w-0 text-[13px] leading-snug text-ink">
                      {g.patientFacingText}
                      <span className="ml-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                        {g.kind === 'gas' ? labels.gasTag : labels.nrsTag}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-[var(--radius-button)] px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}
                    >
                      {chip.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
