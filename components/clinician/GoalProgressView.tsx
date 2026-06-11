'use client';

import { useId, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

interface WeekRating {
  weekNumber: number;
  value: -2 | -1 | 0 | 1 | 2 | null;
  /** Raw NRS value (0-10) reported by the patient. */
  nrs: number | null;
  reported: boolean;
  comment?: string;
  /** Who filled this check-in in. 'caregiver' shows a chip in the
   *  selected-week caption so the clinician has context. */
  submitterLabel?: 'self' | 'caregiver';
}

interface PhysioPoint {
  weekNumber: number;
  nrs: number;
  value: -2 | -1 | 0 | 1 | 2;
  note: string | null;
}

interface GoalProgressViewProps {
  goalText: string;
  /** Which graph to draw. NRS goals plot the raw 0–10 value; GAS goals
   *  plot the −2..+2 level on the banded chart. Defaults to GAS. */
  kind?: 'nrs' | 'gas';
  /** Current week number since treatment (1-indexed). Drives the x-axis size. */
  currentWeek: number;
  ratings: WeekRating[];
  /** Physiotherapist assessments, snapped to the nearest check-in week.
   *  Drawn as a second, amber line so the clinician can compare patient
   *  self-report against physiotherapist assessment. */
  physioRatings?: PhysioPoint[];
  /** When provided, a small "expand" button appears that calls this —
   *  the page opens the same chart larger in a modal. Omitted inside
   *  the modal itself (no nested expand). */
  onExpand?: () => void;
  /** NRS goals only: which way is clinically better. When set, the chart
   *  tints the "good" half sage and shows a "↑/↓ better" cue on the
   *  y-axis, so a downward (improving) line on a lower-is-better goal
   *  can't be misread as a decline. GAS goals already encode this via
   *  their sage/amber bands and ignore this prop. */
  nrsDirection?: 'higherIsBetter' | 'lowerIsBetter';
  /** NRS goals only: the agreed 0–10 starting value and target. When set,
   *  a faint "start" line and a dashed "target" line are drawn so the
   *  weekly self-report reads as a journey between them. */
  nrsBaseline?: number | null;
  nrsTarget?: number | null;
  /** Clinic video score(s) for this goal, overlaid as a distinct dark
   *  series. For NRS goals this is the clinic's 0–10 read of the
   *  peak-effect clip, shown beside the patient's own 0–10 self-report on
   *  the same axis. */
  clinicPoints?: {
    weekNumber: number;
    nrs: number | null;
    value: -2 | -1 | 0 | 1 | 2 | null;
  }[];
  /** ITB goals: weeks at which a pump dose change was recorded, drawn as
   *  faint vertical markers so the outcome line can be read against the
   *  titration. */
  doseMarkers?: { weekNumber: number }[];
  /** Optional status chip shown in the card header under the title — used by the
   *  clinician cockpit for the "video task" indicator. Other call sites omit it. */
  headerBadge?: ReactNode;
  /** When true, render without the outer card border/background/padding so
   * the chart can be embedded inside another card (e.g. a goal band). */
  bare?: boolean;
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
  kind = 'gas',
  currentWeek,
  ratings,
  physioRatings = [],
  onExpand,
  nrsDirection,
  nrsBaseline,
  nrsTarget,
  clinicPoints = [],
  doseMarkers = [],
  headerBadge,
  bare = false
}: GoalProgressViewProps) {
  const t = useTranslations('treatment');
  const tA11y = useTranslations('a11y');
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  // Unique id so multiple charts on one page don't share a <linearGradient>.
  const gradId = `nrs-good-${useId().replace(/:/g, '')}`;

  // NRS goals plot the raw 0–10 value on a 0–10 axis; GAS goals plot the
  // −2..+2 level on the banded axis. plotVal picks the right field.
  const isNrs = kind === 'nrs';
  const yMin = isNrs ? 0 : -2;
  const yMax = isNrs ? 10 : 2;
  const neutralVal = isNrs ? 5 : 0;
  // NRS direction cue: tint the good half + label the good end of the axis.
  const showNrsDir = isNrs && nrsDirection != null;
  const higherBetter = nrsDirection === 'higherIsBetter';
  const plotVal = (
    r: { value: number | null; nrs: number | null } | null
  ): number | null => (r == null ? null : isNrs ? r.nrs : r.value);
  // How a physio point reads in the caption, matching the active chart.
  const physioValue = (p: PhysioPoint) =>
    isNrs ? `NRS ${p.nrs}/10` : `GAS ${formatGas(p.value)}`;

  // Total weeks shown: max of current week, latest reported week, and
  // latest physio-rated week, with a minimum of 4.
  const latestReported = ratings.reduce(
    (m, r) => Math.max(m, r.weekNumber),
    0
  );
  const latestPhysio = physioRatings.reduce(
    (m, r) => Math.max(m, r.weekNumber),
    0
  );
  const totalWeeks = Math.max(
    currentWeek,
    latestReported,
    latestPhysio,
    4
  );

  // Week-indexed lookup. Each slot is either a known rating or null.
  const byWeek: (WeekRating | null)[] = Array.from(
    { length: totalWeeks },
    (_, i) => ratings.find((r) => r.weekNumber === i + 1) ?? null
  );

  const reportedCount = ratings.filter((r) => r.reported).length;
  const selected = selectedWeek !== null ? byWeek[selectedWeek - 1] : null;
  const selectedPhysio =
    selectedWeek !== null
      ? physioRatings.find((p) => p.weekNumber === selectedWeek) ?? null
      : null;

  // SVG layout. Width is set by the parent; viewBox handles scaling.
  // In `bare` mode (the therapist's stacked card, which is much wider than
  // the clinician's column) a wider viewBox keeps the same 0-10 / GAS layout
  // but renders the chart shorter and full-width, instead of ballooning to
  // ~280px tall. Clinician charts are unchanged.
  const width = bare ? 560 : 360;
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
  // y position for a plotted value, flipped so the max is at the top.
  const yFor = (value: number) => {
    const frac = (value - yMin) / (yMax - yMin);
    return padTop + (1 - frac) * innerHeight;
  };

  // GAS only: each level occupies a horizontal band of height
  // innerHeight/5 centred on yFor(value). The band edges sit at midpoints.
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
    const av = plotVal(a);
    const bv = plotVal(b);
    if (
      a?.reported &&
      typeof av === 'number' &&
      b?.reported &&
      typeof bv === 'number'
    ) {
      segments.push({
        x1: xFor(i + 1),
        y1: yFor(av),
        x2: xFor(i + 2),
        y2: yFor(bv)
      });
    }
  }

  // Physio ratings, deduped by snapped week (if two assessments snap to
  // the same week, the later one — last in the date-sorted input —
  // wins). Then a week-indexed lookup and connecting segments, same
  // approach as the patient line.
  const physioByWeek = new Map<number, PhysioPoint>();
  for (const p of physioRatings) physioByWeek.set(p.weekNumber, p);
  const physioWeeks = Array.from(physioByWeek.keys()).sort(
    (a, b) => a - b
  );
  const physioSegments: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  }[] = [];
  for (let i = 0; i < physioWeeks.length - 1; i++) {
    const wa = physioWeeks[i];
    const wb = physioWeeks[i + 1];
    physioSegments.push({
      x1: xFor(wa),
      y1: yFor(plotVal(physioByWeek.get(wa)!)!),
      x2: xFor(wb),
      y2: yFor(plotVal(physioByWeek.get(wb)!)!)
    });
  }

  // Clinic video score points (deduped by week), drawn as a distinct dark
  // series on top — the authoritative one-rater read to compare against the
  // patient's self-report on the same axis.
  const clinicByWeek = new Map<
    number,
    { weekNumber: number; nrs: number | null; value: -2 | -1 | 0 | 1 | 2 | null }
  >();
  for (const p of clinicPoints) clinicByWeek.set(p.weekNumber, p);
  const clinicWeeks = Array.from(clinicByWeek.keys()).sort((a, b) => a - b);
  const clinicSegments: { x1: number; y1: number; x2: number; y2: number }[] =
    [];
  for (let i = 0; i < clinicWeeks.length - 1; i++) {
    const wa = clinicWeeks[i];
    const wb = clinicWeeks[i + 1];
    const va = plotVal(clinicByWeek.get(wa)!);
    const vb = plotVal(clinicByWeek.get(wb)!);
    if (typeof va === 'number' && typeof vb === 'number') {
      clinicSegments.push({
        x1: xFor(wa),
        y1: yFor(va),
        x2: xFor(wb),
        y2: yFor(vb)
      });
    }
  }
  const selectedClinic =
    selectedWeek !== null ? clinicByWeek.get(selectedWeek) ?? null : null;

  // ITB dose-change weeks within range, deduped.
  const doseWeeks = Array.from(
    new Set(
      doseMarkers
        .map((d) => d.weekNumber)
        .filter((w) => w >= 1 && w <= totalWeeks)
    )
  );

  return (
    <article
      className={
        bare
          ? ''
          : 'rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4'
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-[16px] leading-snug text-ink">
            {goalText}
          </p>
          <p className="mt-0.5 text-[14px] text-ink-muted">
            {t('weeksReported', { reported: reportedCount, total: currentWeek })}
          </p>
          {headerBadge ? <div className="mt-1.5">{headerBadge}</div> : null}
        </div>
        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            aria-label={t('enlargeChart')}
            title={t('enlargeChart')}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-stone-soft hover:text-ink"
          >
            {/* expand / fullscreen-corners glyph */}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 3h6v6" />
              <path d="M9 21H3v-6" />
              <path d="M21 3l-7 7" />
              <path d="M3 21l7-7" />
            </svg>
          </button>
        )}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mt-3 block w-full"
        role="img"
        aria-label={
          showNrsDir
            ? `${tA11y('chartLabel', { goal: goalText })} (${
                higherBetter
                  ? tA11y('chartHigherBetter')
                  : tA11y('chartLowerBetter')
              })`
            : tA11y('chartLabel', { goal: goalText })
        }
      >
        {/* Background. GAS: five muted directional bands. NRS: faint
            gridlines at 0 / 5 / 10 on the plain card. */}
        {isNrs ? (
          <>
            {showNrsDir && (
              <>
                <defs>
                  <linearGradient
                    id={gradId}
                    gradientUnits="userSpaceOnUse"
                    x1={padLeft}
                    x2={padLeft}
                    y1={higherBetter ? yFor(yMax) : yFor(yMin)}
                    y2={yFor(neutralVal)}
                  >
                    <stop
                      offset="0%"
                      stopColor="var(--color-sage-soft)"
                      stopOpacity={0.55}
                    />
                    <stop
                      offset="100%"
                      stopColor="var(--color-sage-soft)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <rect
                  x={padLeft}
                  y={higherBetter ? yFor(yMax) : yFor(neutralVal)}
                  width={innerWidth}
                  height={Math.abs(
                    yFor(neutralVal) - yFor(higherBetter ? yMax : yMin)
                  )}
                  fill={`url(#${gradId})`}
                />
              </>
            )}
            {[0, 5, 10].map((v) => (
              <line
                key={`grid-${v}`}
                x1={padLeft}
                x2={padLeft + innerWidth}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="var(--color-stone)"
                strokeWidth={1}
                opacity={0.6}
              />
            ))}
          </>
        ) : (
          <>
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
          </>
        )}

        {/* NRS only: start (faint) + target (dashed) reference lines, so
            the weekly dots read as a journey from baseline toward target. */}
        {isNrs && typeof nrsBaseline === 'number' && (
          <>
            <line
              x1={padLeft}
              x2={padLeft + innerWidth}
              y1={yFor(nrsBaseline)}
              y2={yFor(nrsBaseline)}
              stroke="var(--color-ink-muted)"
              strokeWidth={1}
              strokeDasharray="2 3"
              opacity={0.7}
            />
            <text
              x={padLeft + innerWidth}
              y={Math.max(
                padTop + 7,
                Math.min(yFor(nrsBaseline) - 3, padTop + innerHeight - 1)
              )}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-ink-muted)"
            >
              {t('nrsStartTick')}
            </text>
          </>
        )}
        {isNrs && typeof nrsTarget === 'number' && (
          <>
            <line
              x1={padLeft}
              x2={padLeft + innerWidth}
              y1={yFor(nrsTarget)}
              y2={yFor(nrsTarget)}
              stroke="var(--color-sage-deep)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              opacity={0.9}
            />
            <text
              x={padLeft + innerWidth}
              y={Math.max(
                padTop + 7,
                Math.min(yFor(nrsTarget) - 3, padTop + innerHeight - 1)
              )}
              textAnchor="end"
              fontSize={9}
              fill="var(--color-sage-deep)"
              fontWeight={500}
            >
              {t('nrsTargetTick')}
            </text>
          </>
        )}
        {(isNrs ? [10, 5, 0] : [2, 1, 0, -1, -2]).map((v) => (
          <text
            key={v}
            x={padLeft - 6}
            y={yFor(v)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-ink-muted"
            fontSize={10}
          >
            {isNrs ? `${v}` : v > 0 ? `+${v}` : `${v}`}
          </text>
        ))}

        {/* NRS direction cue: marks the good end of the axis so a
            lower-is-better goal isn't read upside-down. */}
        {showNrsDir && (
          <text
            x={padLeft + 4}
            y={higherBetter ? padTop + 9 : padTop + innerHeight - 5}
            textAnchor="start"
            dominantBaseline="middle"
            className="fill-sage-deep"
            fontSize={9}
          >
            {higherBetter ? '↑' : '↓'} {t('axisBetter')}
          </text>
        )}

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

        {/* ITB dose-change markers — faint vertical lines with a small tick
            at the top, so titration timing reads against the outcome line. */}
        {doseWeeks.map((w) => (
          <g key={`dose-${w}`}>
            <line
              x1={xFor(w)}
              x2={xFor(w)}
              y1={padTop}
              y2={padTop + innerHeight}
              stroke="var(--color-ink-muted)"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.45}
            />
            <path
              d={`M ${xFor(w) - 3} ${padTop} L ${xFor(w) + 3} ${padTop} L ${xFor(
                w
              )} ${padTop + 4} Z`}
              fill="var(--color-ink-muted)"
              opacity={0.7}
            />
          </g>
        ))}

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
          const ev = plotVal(entry);

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
              {entry?.reported && typeof ev === 'number' ? (
                <>
                  <circle
                    cx={x}
                    cy={yFor(ev)}
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
                      transform={`translate(${x + 5}, ${yFor(ev) - 11})`}
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
                  cy={yFor(neutralVal)}
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
        {/* Physiotherapist line + dots — amber, dashed, to distinguish
            from the patient's sage self-report line. Drawn on top so
            it's visible where the two overlap. */}
        {physioSegments.map((s, i) => (
          <line
            key={`ps-${i}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="var(--color-amber-deep)"
            strokeWidth={1.5}
            strokeDasharray="3 2.5"
            strokeLinecap="round"
          />
        ))}
        {physioWeeks.map((w) => {
          const p = physioByWeek.get(w)!;
          const py = yFor(plotVal(p)!);
          return (
            <rect
              key={`pt-${w}`}
              x={xFor(w) - 4}
              y={py - 4}
              width={8}
              height={8}
              transform={`rotate(45 ${xFor(w)} ${py})`}
              fill="var(--color-amber-deep)"
              stroke="var(--color-cream-soft)"
              strokeWidth={1.25}
            />
          );
        })}
        {/* Clinic video score — dark, dotted line + filled squares, distinct
            from the patient (sage circles) and physio (amber diamonds). */}
        {clinicSegments.map((s, i) => (
          <line
            key={`cs-${i}`}
            x1={s.x1}
            y1={s.y1}
            x2={s.x2}
            y2={s.y2}
            stroke="var(--color-ink)"
            strokeWidth={1.5}
            strokeDasharray="1 3"
            strokeLinecap="round"
          />
        ))}
        {clinicWeeks.map((w) => {
          const p = clinicByWeek.get(w)!;
          const cv = plotVal(p);
          if (typeof cv !== 'number') return null;
          const cy = yFor(cv);
          return (
            <rect
              key={`ct-${w}`}
              x={xFor(w) - 3.5}
              y={cy - 3.5}
              width={7}
              height={7}
              fill="var(--color-ink)"
              stroke="var(--color-cream-soft)"
              strokeWidth={1.25}
            />
          );
        })}
      </svg>


      {(physioWeeks.length > 0 || clinicWeeks.length > 0) && (
        <div className="mt-1 flex flex-wrap gap-4 text-[13px] text-ink-muted">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-4 rounded-full"
              style={{ background: 'var(--color-sage-deep)' }}
            />
            {t('chartLegendPatient')}
          </span>
          {physioWeeks.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rotate-45"
                style={{ background: 'var(--color-amber-deep)' }}
              />
              {t('chartLegendPhysio')}
            </span>
          )}
          {clinicWeeks.length > 0 && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5"
                style={{ background: 'var(--color-ink)' }}
              />
              {t('clinicVideoLine')}
            </span>
          )}
        </div>
      )}

      {/* Caption: shows NRS value + derived GAS + any patient comment for
          the selected week, or a gentle hint when nothing is selected.
          If the physiotherapist also rated this week, that's shown too. */}
      <div className="mt-2 min-h-[20px] space-y-1 text-[14px]">
        {selected && selected.reported ? (
          <>
            <p className="text-ink-soft">
              {t('chartWeekLabel', { week: selected.weekNumber })}{' '}
              {isNrs ? (
                <span className="font-semibold text-ink">
                  NRS {selected.nrs}/10
                </span>
              ) : (
                <span className="text-ink">{formatGas(selected.value)}</span>
              )}
              {selected.submitterLabel === 'caregiver' && (
                <span className="ml-2 inline-flex items-center rounded-full border border-stone bg-cream-soft px-2 py-0.5 text-[12px] uppercase tracking-wider text-ink-muted">
                  {t('withCaregiver')}
                </span>
              )}
            </p>
            {selected.comment && (
              <p className="rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1.5 text-[14px] leading-relaxed text-ink">
                <span className="text-ink-muted">{t('patientNote')} </span>
                {selected.comment}
              </p>
            )}
            {selectedPhysio && (
              <p className="text-ink-soft">
                <span style={{ color: 'var(--color-amber-deep)' }}>
                  {t('chartLegendPhysio')}:
                </span>{' '}
                <span className="font-semibold text-ink">
                  {physioValue(selectedPhysio)}
                </span>
              </p>
            )}
            {selectedPhysio?.note && (
              <p className="rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1.5 text-[14px] leading-relaxed text-ink">
                <span className="text-ink-muted">
                  {t('chartPhysioNote')}{' '}
                </span>
                {selectedPhysio.note}
              </p>
            )}
          </>
        ) : selectedWeek !== null && selectedPhysio ? (
          // No patient rating that week, but the physio rated it.
          <>
            <p className="text-ink-soft">
              <span style={{ color: 'var(--color-amber-deep)' }}>
                {t('chartLegendPhysio')}:
              </span>{' '}
              <span className="font-semibold text-ink">
                {physioValue(selectedPhysio)}
              </span>
            </p>
            {selectedPhysio.note && (
              <p className="rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1.5 text-[14px] leading-relaxed text-ink">
                <span className="text-ink-muted">
                  {t('chartPhysioNote')}{' '}
                </span>
                {selectedPhysio.note}
              </p>
            )}
          </>
        ) : selectedWeek !== null && !selected?.reported ? (
          <p className="text-ink-soft">
            {t('chartWeekNotReported', { week: selectedWeek })}
          </p>
        ) : (
          <p className="text-ink-soft">{t('tapPointForDetails')}</p>
        )}
        {selectedClinic && typeof plotVal(selectedClinic) === 'number' && (
          <p className="text-ink-soft">
            <span className="text-ink-muted">{t('clinicVideoLine')}: </span>
            <span className="font-semibold text-ink">
              {isNrs
                ? `NRS ${selectedClinic.nrs}/10`
                : `GAS ${formatGas(selectedClinic.value)}`}
            </span>
          </p>
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
