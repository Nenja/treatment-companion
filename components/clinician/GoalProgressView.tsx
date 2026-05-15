'use client';

import { useState } from 'react';
import type { RatingValue } from '@/lib/types';

interface WeekRating {
  weekNumber: number;
  value: Exclude<RatingValue, null> | null;
  reported: boolean;
}

interface GoalProgressViewProps {
  goalText: string;
  totalWeeks: number;
  currentWeek: number;
  ratings: WeekRating[];
}

/**
 * Two visualisations of one goal's check-in history, side by side:
 *
 *   1. Heatmap row — one cell per week of the cycle, colour-coded to the
 *      rating value (muted amber/cream/sage palette, consistent with the
 *      patient-facing scale). Empty cells for not-yet-reached or skipped
 *      weeks. Current week has a thin sage ring.
 *
 *   2. Small line chart — same data plotted -2..+2 vertically, the
 *      "expected" zero line drawn across the middle. Lets the clinician
 *      see trajectory at a glance.
 *
 * Tapping a heatmap cell shows the exact numeric value in a small caption.
 */
export function GoalProgressView({
  goalText,
  totalWeeks,
  currentWeek,
  ratings
}: GoalProgressViewProps) {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  // Build a week-indexed array. Each slot is either a known rating or null.
  const byWeek: (WeekRating | null)[] = Array.from(
    { length: totalWeeks },
    (_, i) => ratings.find((r) => r.weekNumber === i + 1) ?? null
  );

  const reportedCount = ratings.filter((r) => r.reported).length;

  const selectedRating =
    selectedWeek !== null
      ? byWeek[selectedWeek - 1]
      : null;

  return (
    <article className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <p className="font-display text-[16px] leading-snug text-ink">
        {goalText}
      </p>
      <p className="mt-0.5 text-[12px] text-ink-muted">
        {reportedCount} of {currentWeek} weeks reported
      </p>

      {/* Two-panel layout: heatmap on the left, chart on the right.
          On very narrow screens (e.g. mobile clinician on a phone) they
          stack vertically. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px] sm:items-end">
        <Heatmap
          byWeek={byWeek}
          currentWeek={currentWeek}
          selectedWeek={selectedWeek}
          onSelectWeek={(w) =>
            setSelectedWeek((prev) => (prev === w ? null : w))
          }
        />
        <LineChart byWeek={byWeek} currentWeek={currentWeek} />
      </div>

      {/* Caption: shows the numeric value of the selected cell, or a
          gentle hint when nothing is selected. */}
      <p className="mt-2 min-h-[20px] text-[12px] text-ink-soft">
        {selectedRating && selectedRating.reported
          ? `Week ${selectedRating.weekNumber}: ${formatValue(selectedRating.value)}`
          : selectedRating === null && selectedWeek !== null
          ? `Week ${selectedWeek}: not reported`
          : 'Tap a cell for the value.'}
      </p>
    </article>
  );
}

function formatValue(v: Exclude<RatingValue, null> | null): string {
  if (v === null) return '—';
  // Show with explicit sign for non-zero so the direction is obvious.
  if (v === 0) return '0 (as expected)';
  return v > 0 ? `+${v}` : String(v);
}

// --- Heatmap subcomponent -----------------------------------------------

interface HeatmapProps {
  byWeek: (WeekRating | null)[];
  currentWeek: number;
  selectedWeek: number | null;
  onSelectWeek: (w: number) => void;
}

function Heatmap({
  byWeek,
  currentWeek,
  selectedWeek,
  onSelectWeek
}: HeatmapProps) {
  return (
    <div className="flex flex-wrap gap-1" aria-label="Weekly ratings">
      {byWeek.map((entry, i) => {
        const week = i + 1;
        const isCurrent = week === currentWeek;
        const isSelected = week === selectedWeek;
        const isFuture = week > currentWeek;

        const cellColor = entry?.reported
          ? colorForValue(entry.value)
          : isFuture
          ? 'bg-transparent border-stone'
          : 'bg-stone-soft/30 border-stone';

        const ringClass = isSelected
          ? 'ring-2 ring-ink ring-offset-1 ring-offset-cream-soft'
          : isCurrent
          ? 'ring-2 ring-sage ring-offset-1 ring-offset-cream-soft'
          : '';

        return (
          <button
            key={week}
            type="button"
            onClick={() => onSelectWeek(week)}
            aria-label={`Week ${week}${entry?.reported ? `, value ${entry.value}` : ', not reported'}`}
            className={`h-6 w-6 rounded border ${cellColor} ${ringClass}`}
          />
        );
      })}
    </div>
  );
}

function colorForValue(v: Exclude<RatingValue, null> | null): string {
  if (v === null) return 'bg-stone-soft border-stone';
  switch (v) {
    case -2:
      return 'bg-amber-soft border-amber-soft';
    case -1:
      return 'bg-amber-soft/50 border-amber-soft/60';
    case 0:
      return 'bg-cream border-stone';
    case 1:
      return 'bg-sage-soft border-sage-soft';
    case 2:
      return 'bg-sage/70 border-sage';
  }
}

// --- Line chart subcomponent --------------------------------------------

interface LineChartProps {
  byWeek: (WeekRating | null)[];
  currentWeek: number;
}

function LineChart({ byWeek, currentWeek }: LineChartProps) {
  const width = 140;
  const height = 60;
  const padX = 6;
  const padY = 6;
  const totalWeeks = byWeek.length;

  // X coordinate per week (1-indexed).
  const xFor = (week: number) => {
    if (totalWeeks <= 1) return padX;
    return padX + ((week - 1) / (totalWeeks - 1)) * (width - 2 * padX);
  };
  // Y coordinate for rating value (-2..+2). Larger value → higher on chart
  // (lower y in SVG coordinates).
  const yFor = (value: number) => {
    const t = (value + 2) / 4; // 0..1
    return height - padY - t * (height - 2 * padY);
  };

  const points = byWeek
    .map((entry, i) => {
      if (!entry?.reported || entry.value === null) return null;
      return { x: xFor(i + 1), y: yFor(entry.value), week: i + 1 };
    })
    .filter((p): p is { x: number; y: number; week: number } => p !== null);

  // Polyline path through reported points only (skips missing weeks).
  const path =
    points.length > 0
      ? points.map((p) => `${p.x},${p.y}`).join(' ')
      : '';

  const yZero = yFor(0);
  const xCurrent = currentWeek <= totalWeeks ? xFor(currentWeek) : null;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Weekly ratings chart"
      className="block"
    >
      {/* Zero line — "as expected" anchor */}
      <line
        x1={padX}
        x2={width - padX}
        y1={yZero}
        y2={yZero}
        stroke="var(--color-stone)"
        strokeWidth={1}
        strokeDasharray="2 2"
      />
      {/* Current-week marker */}
      {xCurrent !== null && (
        <line
          x1={xCurrent}
          x2={xCurrent}
          y1={padY}
          y2={height - padY}
          stroke="var(--color-sage)"
          strokeWidth={1}
          opacity={0.4}
        />
      )}
      {/* Polyline of reported values */}
      {points.length >= 2 && (
        <polyline
          fill="none"
          stroke="var(--color-sage-deep)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={path}
        />
      )}
      {/* Dots for each reported value */}
      {points.map((p) => (
        <circle
          key={p.week}
          cx={p.x}
          cy={p.y}
          r={2.5}
          fill="var(--color-sage-deep)"
        />
      ))}
    </svg>
  );
}
