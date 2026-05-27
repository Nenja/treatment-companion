'use client';

import type { CycleTrendPoint } from '@/lib/supabase/patientTrend';

/**
 * Two small charts for the longitudinal trend page:
 *   - Dose per cycle: a bar per cycle, height = total units.
 *   - Outcome per cycle: a point per cycle on a -2..+2 GAS axis,
 *     connected, so the trajectory across cycles is visible.
 *
 * Hand-built SVG, matching the app's existing GoalProgressView
 * approach (the main app does not bundle a charting library). All
 * colours come from CSS variables, so the charts follow the active
 * palette and day/night mode.
 *
 * Cycles with no recorded treatment (totalUnits null) or no completed
 * check-ins (finalGas null) are drawn as gaps — the bar/point is
 * simply omitted for that cycle, and a muted "—" label sits on the
 * axis so the cycle is still accounted for.
 */

const W = 320;
const H = 150;
const PAD_L = 34;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 26;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

function cycleX(index: number, count: number): number {
  if (count === 1) return PAD_L + PLOT_W / 2;
  return PAD_L + (index / (count - 1)) * PLOT_W;
}

export function DosePerCycleChart({
  cycles,
  unitsLabel,
  cycleLabel
}: {
  cycles: CycleTrendPoint[];
  unitsLabel: string;
  cycleLabel: string;
}) {
  const doses = cycles
    .map((c) => c.totalUnits)
    .filter((u): u is number => u !== null);
  const maxDose = doses.length > 0 ? Math.max(...doses) : 100;
  // Round the axis top up to a tidy number.
  const axisTop = Math.ceil(maxDose / 100) * 100 || 100;

  const barWidth = Math.min(
    34,
    (PLOT_W / Math.max(cycles.length, 1)) * 0.55
  );

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
          const cx = cycleX(i, cycles.length);
          if (c.totalUnits === null) {
            return (
              <text
                key={c.cycleId}
                x={cx}
                y={PAD_T + PLOT_H + 16}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-ink-muted)"
              >
                —
              </text>
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
              {/* Cycle label on the axis */}
              <text
                x={cx}
                y={PAD_T + PLOT_H + 16}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-ink-muted)"
              >
                {cycleLabel} {c.cycleNumber}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function OutcomePerCycleChart({
  cycles,
  outcomeLabel,
  cycleLabel
}: {
  cycles: CycleTrendPoint[];
  outcomeLabel: string;
  cycleLabel: string;
}) {
  // GAS axis runs -2 (bottom) to +2 (top).
  const gasToY = (gas: number): number => {
    const t = (gas + 2) / 4; // 0..1
    return PAD_T + PLOT_H - t * PLOT_H;
  };

  // Points that actually have an outcome, in cycle order.
  const points = cycles
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.finalGas !== null);

  return (
    <figure className="m-0">
      <figcaption className="mb-1 text-[13px] font-semibold text-ink-soft">
        {outcomeLabel}
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={outcomeLabel}
      >
        {/* Gridlines + labels at -2, 0, +2 */}
        {[2, 1, 0, -1, -2].map((g) => {
          const y = gasToY(g);
          const isZero = g === 0;
          return (
            <g key={g}>
              <line
                x1={PAD_L}
                y1={y}
                x2={PAD_L + PLOT_W}
                y2={y}
                stroke="var(--color-stone)"
                strokeWidth={isZero ? 1.5 : 0.75}
                strokeDasharray={isZero ? undefined : '2 3'}
              />
              <text
                x={PAD_L - 5}
                y={y + 3}
                textAnchor="end"
                fontSize="9"
                fill="var(--color-ink-muted)"
              >
                {g > 0 ? `+${g}` : g}
              </text>
            </g>
          );
        })}

        {/* Connecting line between consecutive available points */}
        {points.length > 1 && (
          <polyline
            points={points
              .map(
                ({ c, i }) =>
                  `${cycleX(i, cycles.length)},${gasToY(c.finalGas as number)}`
              )
              .join(' ')}
            fill="none"
            stroke="var(--color-sage-deep)"
            strokeWidth="2"
          />
        )}

        {/* Cycle markers + axis labels */}
        {cycles.map((c, i) => {
          const cx = cycleX(i, cycles.length);
          return (
            <g key={c.cycleId}>
              {c.finalGas !== null ? (
                <circle
                  cx={cx}
                  cy={gasToY(c.finalGas)}
                  r="4"
                  fill="var(--color-sage-deep)"
                  stroke="var(--color-cream)"
                  strokeWidth="1.5"
                />
              ) : (
                <text
                  x={cx}
                  y={PAD_T + PLOT_H / 2}
                  textAnchor="middle"
                  fontSize="9"
                  fill="var(--color-ink-muted)"
                >
                  —
                </text>
              )}
              <text
                x={cx}
                y={PAD_T + PLOT_H + 16}
                textAnchor="middle"
                fontSize="9"
                fill="var(--color-ink-muted)"
              >
                {cycleLabel} {c.cycleNumber}
              </text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
