'use client';

import { useState } from 'react';

interface WeekRating {
  weekNumber: number;
  value: -2 | -1 | 0 | 1 | 2 | null;
  /** Raw NRS value (0-10) reported by the patient. */
  nrs: number | null;
  reported: boolean;
  comment?: string;
}

interface GoalProgressViewProps {
  goalText: string;
  /** Current week number since treatment (1-indexed). Drives the x-axis size. */
  currentWeek: number;
  ratings: WeekRating[];
}

/**
 * Single chart per goal, with five colored bands behind the data.
 * The x-axis grows with the cycle: it shows weeks 1 through max(currentWeek, latest reported week).
 * No fixed cycle length; the chart extends as time passes.
 *
 *   +2 / +1  →  sage (soft → medium): "as expected or better"
 *      0     →  cream:                "expected"
 *   −1 / −2  →  amber (soft → medium): "below expected"
 *
 * Reported weeks are filled sage dots connected by a line. Skipped
 * weeks break the line (so it doesn't draw a misleading slope through
 * a gap) and show a small grey ring at y=0 as an explicit "missing
 * data" marker.
 *
 * Y-axis labels (−2 / −1 / 0 / +1 / +2) sit on the left. X-axis week
 * labels appear at week 1, then every ~3 weeks, with the final week
 * always included.
 *
 * Tapping a reported dot shows the rating + any patient comment in a
 * caption below the chart. Weeks with a comment show a small speech
 * bubble marker above the dot.
 */
export function GoalProgressView({
  goalText,
  currentWeek,
  ratings
}: GoalProgressViewProps) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // Total weeks shown: max of current week and latest reported week,
  // with a minimum of 4 so the chart doesn't look squashed at the start.
  const latestReported = ratings.reduce(
    (m, r) => Math.max(m, r.weekNumber),
    0
  );
  const totalWeeks = Math.max(currentWeek, latestReported, 4);

  // Week-indexed lookup. Each slot is either a known rating or null.
  const byWeek: (WeekRating | null)[] = Array.from(
    { length: totalWeeks },
    (_, i) => ratings.find((r) => r.weekNumber === i + 1) ?? null
  );

  const reportedCount = ratings.filter((r) => r.reported).length;
  const selected = selectedWeek !== null ? byWeek[selectedWeek - 1] : null;

  // SVG layout. Width is set by the parent; viewBox handles scaling.
  const width = 360;
  const height = 160;
  const padLeft = 26; // room for y-axis labels
  const padRight = 8;
  const padTop = 8;
  const padBottom = 22; // room for x-axis labels

  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  // x position for a 1-indexed week.
  const xFor = (week: number) => {
    if (totalWeeks <= 1) return padLeft + innerWidth / 2;
    return padLeft + ((week - 1) / (totalWeeks - 1)) * innerWidth;
  };
  // y position for a rating value (-2..+2). +2 is at the top.
  const yFor = (value: number) => {
    // Map -2..+2 to 0..1 with +2 at top (so flipped).
    const t = (value + 2) / 4;
    return padTop + (1 - t) * innerHeight;
  };

  // Each rating value occupies a horizontal band of height innerHeight/5
  // centred on yFor(value). The band edges sit at midpoints.
  const bandTop = (value: number) => yFor(value) - innerHeight / 10;
  const bandBottom = (value: number) => yFor(value) + innerHeight / 10;

  // Build x-axis tick week numbers: 1, every 3rd, plus totalWeeks.
  const xTicks = new Set<number>();
  xTicks.add(1);
  for (let w = 4; w < totalWeeks; w += 3) xTicks.add(w);
  xTicks.add(totalWeeks);
  const xTickArray = Array.from(xTicks).sort((a, b) => a - b);

  // Build line segments — only between consecutive REPORTED weeks.
  // Gaps (skipped weeks) break the line.
  const segments: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let i = 0; i < byWeek.length - 1; i++) {
    const a = byWeek[i];
    const b = byWeek[i + 1];
    if (
      a?.reported &&
      typeof a.value === 'number' &&
      b?.reported &&
      typeof b.value === 'number'
    ) {
      segments.push({
        x1: xFor(i + 1),
        y1: yFor(a.value),
        x2: xFor(i + 2),
        y2: yFor(b.value)
      });
    }
  }

  return (
    <article className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <p className="font-display text-[16px] leading-snug text-ink">
        {goalText}
      </p>
      <p className="mt-0.5 text-[14px] text-ink-muted">
        {reportedCount} of {currentWeek} weeks reported
      </p>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 block w-full"
        role="img"
        aria-label={`Weekly ratings chart for: ${goalText}`}
      >
        {/* Background bands — muted directional colors */}
        <rect
          x={padLeft}
          y={bandTop(2)}
          width={innerWidth}
          height={bandBottom(2) - bandTop(2)}
          fill="var(--color-sage-soft)"
          opacity={0.6}
        />
        <rect
          x={padLeft}
          y={bandTop(1)}
          width={innerWidth}
          height={bandBottom(1) - bandTop(1)}
          fill="var(--color-sage-soft)"
          opacity={0.35}
        />
        <rect
          x={padLeft}
          y={bandTop(0)}
          width={innerWidth}
          height={bandBottom(0) - bandTop(0)}
          fill="var(--color-cream)"
        />
        <rect
          x={padLeft}
          y={bandTop(-1)}
          width={innerWidth}
          height={bandBottom(-1) - bandTop(-1)}
          fill="var(--color-amber-soft)"
          opacity={0.35}
        />
        <rect
          x={padLeft}
          y={bandTop(-2)}
          width={innerWidth}
          height={bandBottom(-2) - bandTop(-2)}
          fill="var(--color-amber-soft)"
          opacity={0.6}
        />

        {/* Y-axis labels */}
        {[2, 1, 0, -1, -2].map((v) => (
          <text
            key={v}
            x={padLeft - 6}
            y={yFor(v)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-ink-muted"
            fontSize={10}
          >
            {v > 0 ? `+${v}` : `${v}`}
          </text>
        ))}

        {/* X-axis labels */}
        {xTickArray.map((w) => (
          <text
            key={w}
            x={xFor(w)}
            y={height - 6}
            textAnchor="middle"
            className="fill-ink-muted"
            fontSize={10}
          >
            {w}
          </text>
        ))}

        {/* Current-week marker */}
        {currentWeek >= 1 && currentWeek <= totalWeeks && (
          <line
            x1={xFor(currentWeek)}
            x2={xFor(currentWeek)}
            y1={padTop}
            y2={padTop + innerHeight}
            stroke="var(--color-sage)"
            strokeWidth={1}
            opacity={0.5}
          />
        )}

        {/* Line segments between consecutive reported weeks */}
        {segments.map((s, i) => (
          <line
            key={i}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="var(--color-sage-deep)"
            strokeWidth={1.75}
            strokeLinecap="round"
          />
        ))}

        {/* Markers per week: filled dot for reported, hollow ring at y=0
            for missing. Wrapped in a transparent rect so a wider tap
            target catches mobile taps even when the visible mark is
            small. */}
        {byWeek.map((entry, i) => {
          const week = i + 1;
          const isCurrent = week === currentWeek;
          const isSelected = week === selectedWeek;
          const x = xFor(week);

          // Past-or-current weeks with no rating → missing marker at y=0.
          const showMissing =
            !entry?.reported && week <= currentWeek;
          // Future weeks: nothing rendered (the band shows context enough).
          if (!entry?.reported && !showMissing) {
            return (
              <rect
                key={week}
                x={x - 12}
                y={padTop}
                width={24}
                height={innerHeight}
                fill="transparent"
                onClick={() =>
                  setSelectedWeek((p) => (p === week ? null : week))
                }
                style={{ cursor: 'pointer' }}
              />
            );
          }

          return (
            <g key={week}>
              {/* Larger transparent target for tapping */}
              <rect
                x={x - 12}
                y={padTop}
                width={24}
                height={innerHeight}
                fill="transparent"
                onClick={() =>
                  setSelectedWeek((p) => (p === week ? null : week))
                }
                style={{ cursor: 'pointer' }}
              />
              {entry?.reported && typeof entry.value === 'number' ? (
                <>
                  <circle
                    cx={x}
                    cy={yFor(entry.value)}
                    r={isSelected ? 5 : isCurrent ? 4.5 : 4}
                    fill="var(--color-sage-deep)"
                    stroke={
                      isSelected
                        ? 'var(--color-ink)'
                        : isCurrent
                        ? 'var(--color-sage)'
                        : 'var(--color-cream-soft)'
                    }
                    strokeWidth={isSelected ? 2 : 1.5}
                  />
                  {/* Speech bubble icon for weeks with a patient comment.
                      Positioned up-and-right of the dot, drawn as a
                      small rounded rect with a tail. Subtle ink colour
                      so it reads as an annotation, not data. */}
                  {entry.comment && (
                    <g
                      transform={`translate(${x + 5}, ${yFor(entry.value) - 11})`}
                      style={{ pointerEvents: 'none' }}
                    >
                      <rect
                        x={0}
                        y={0}
                        width={9}
                        height={6}
                        rx={1.5}
                        ry={1.5}
                        fill="var(--color-cream-soft)"
                        stroke="var(--color-ink-soft)"
                        strokeWidth={0.7}
                      />
                      <path
                        d="M 2 6 L 1.5 7.5 L 3.5 6 Z"
                        fill="var(--color-cream-soft)"
                        stroke="var(--color-ink-soft)"
                        strokeWidth={0.7}
                        strokeLinejoin="round"
                      />
                    </g>
                  )}
                </>
              ) : (
                <circle
                  cx={x}
                  cy={yFor(0)}
                  r={4}
                  fill="none"
                  stroke={
                    isSelected
                      ? 'var(--color-ink)'
                      : 'var(--color-stone)'
                  }
                  strokeWidth={isSelected ? 2 : 1.5}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Caption: shows NRS value + derived GAS + any patient comment for
          the selected week, or a gentle hint when nothing is selected. */}
      <div className="mt-2 min-h-[20px] space-y-1 text-[14px]">
        {selected && selected.reported ? (
          <>
            <p className="text-ink-soft">
              Week {selected.weekNumber}:{' '}
              {typeof selected.nrs === 'number' ? (
                <>
                  <span className="font-semibold text-ink">
                    NRS {selected.nrs}/10
                  </span>
                  {selected.value !== null && (
                    <span className="text-ink-muted">
                      {' '}
                      · GAS {formatGas(selected.value)}
                    </span>
                  )}
                </>
              ) : (
                formatGas(selected.value)
              )}
            </p>
            {selected.comment && (
              <p className="rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1.5 text-[14px] leading-relaxed text-ink">
                <span className="text-ink-muted">Patient note: </span>
                {selected.comment}
              </p>
            )}
          </>
        ) : selectedWeek !== null && !selected?.reported ? (
          <p className="text-ink-soft">
            Week {selectedWeek}: not reported
          </p>
        ) : (
          <p className="text-ink-soft">Tap a point for details.</p>
        )}
      </div>
    </article>
  );
}

function formatGas(v: -2 | -1 | 0 | 1 | 2 | null): string {
  if (v === null) return '—';
  if (v === 0) return '0';
  return v > 0 ? `+${v}` : String(v);
}
