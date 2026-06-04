'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import type {
  ClinicianPatientCheckin,
  ClinicianPatientGoal
} from '@/lib/supabase/clinicianPatient';

interface VisitChangesProps {
  /** Date of the most recent treatment for this cycle, if one is recorded. */
  lastTreatmentDate: string | null;
  /** Fallback anchor when no treatment is recorded yet. */
  cycleStartDate: string;
  /** Current-cycle check-ins (each carries submittedAt + per-goal ratings). */
  checkins: ClinicianPatientCheckin[];
  /** Active + archived goals — used for text, kind and NRS direction. */
  goals: ClinicianPatientGoal[];
}

type Trend = 'up' | 'down' | 'flat';

interface GoalRow {
  goalId: string;
  text: string;
  archived: boolean;
  kind: 'nrs' | 'gas';
  first: number;
  last: number;
  delta: number; // |last - first|
  trend: Trend;
  sparkPoints: string;
  lastX: number;
  lastY: number;
  single: boolean;
}

// Sparkline geometry (compact, inline next to the value).
const SW = 64;
const SH = 22;
const PAD = 3;

function sparkData(values: number[], min: number, max: number) {
  const n = values.length;
  const span = max - min || 1;
  const innerW = SW - PAD * 2;
  const innerH = SH - PAD * 2;
  const pts = values.map((v, i) => {
    const x = n <= 1 ? SW / 2 : PAD + (i * innerW) / (n - 1);
    const y = SH - PAD - ((v - min) / span) * innerH;
    return { x, y };
  });
  const last = pts[pts.length - 1];
  return {
    points: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    lastX: last.x,
    lastY: last.y
  };
}

/**
 * Auto-generated, read-only summary of what changed since the patient was last
 * seen (anchored to the last treatment). Leads with per-goal movement — a small
 * trend line, the current value, and a plain-language change chip — then a
 * compact strip for adherence, training and videos. Computed from loaded data;
 * nothing is editable.
 */
export function VisitChanges({
  lastTreatmentDate,
  cycleStartDate,
  checkins,
  goals
}: VisitChangesProps) {
  const t = useTranslations('visitChanges');
  const locale = useLocale();

  const anchoredToTreatment = !!lastTreatmentDate;
  const anchorIso = lastTreatmentDate ?? cycleStartDate;
  const anchorMs = new Date(anchorIso).getTime();

  const since = [...checkins]
    .filter((c) => new Date(c.submittedAt).getTime() >= anchorMs)
    .sort(
      (a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime() ||
        a.weekNumber - b.weekNumber
    );

  const goalById = new Map(goals.map((g) => [g.id, g]));

  const gasLabel = (v: number): string => {
    switch (v) {
      case 2:
        return t('gasP2');
      case 1:
        return t('gasP1');
      case 0:
        return t('gas0');
      case -1:
        return t('gasM1');
      case -2:
        return t('gasM2');
      default:
        return String(v);
    }
  };

  // --- Per-goal movement ---------------------------------------------------
  const rows: GoalRow[] = [];
  for (const goal of goals) {
    const kind = goal.kind;
    const series: number[] = [];
    for (const c of since) {
      const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
      if (!r) continue;
      const v = kind === 'nrs' ? r.nrsValue : r.ratingValue;
      if (typeof v === 'number') series.push(v);
    }
    if (series.length === 0) continue;
    const first = series[0];
    const last = series[series.length - 1];
    let betterWhenHigher = true;
    if (kind === 'nrs' && goal.nrs) {
      betterWhenHigher = goal.nrs.direction === 'higherIsBetter';
    }
    let trend: Trend = 'flat';
    if (last !== first) trend = last > first === betterWhenHigher ? 'up' : 'down';
    const min = kind === 'gas' ? -2 : 0;
    const max = kind === 'gas' ? 2 : 10;
    const sd = sparkData(series, min, max);
    rows.push({
      goalId: goal.id,
      text: goal.patientFacingText,
      archived: goal.status !== 'active',
      kind,
      first,
      last,
      delta: Math.abs(last - first),
      trend,
      sparkPoints: sd.points,
      lastX: sd.lastX,
      lastY: sd.lastY,
      single: series.length <= 1
    });
  }

  // --- Adherence -----------------------------------------------------------
  const weeks = since.map((c) => c.weekNumber).sort((a, b) => a - b);
  const missed: number[] = [];
  if (weeks.length > 0) {
    const present = new Set(weeks);
    for (let w = weeks[0]; w <= weeks[weeks.length - 1]; w++) {
      if (!present.has(w)) missed.push(w);
    }
  }

  // --- Training ------------------------------------------------------------
  let homeDays = 0;
  let homeWeeks = 0;
  let therapistSessions = 0;
  for (const c of since) {
    if (c.trainingDays) {
      homeDays += c.trainingDays.length;
      homeWeeks += 1;
    }
    if (c.trainingDaysTherapist) therapistSessions += c.trainingDaysTherapist.length;
  }
  const perWeek = homeWeeks > 0 ? Math.round(homeDays / homeWeeks) : 0;
  const hasTraining = homeWeeks > 0 || therapistSessions > 0;

  // --- Videos --------------------------------------------------------------
  let videoCount = 0;
  for (const c of since) {
    for (const r of c.ratings) if (r.videoPath) videoCount += 1;
  }

  const anchorPhrase = anchoredToTreatment
    ? t('subTreatment', { date: formatLongDate(anchorIso, locale) })
    : t('subCycle', { date: formatLongDate(anchorIso, locale) });
  const adherencePhrase =
    missed.length === 0
      ? t('everyWeek')
      : t('missedWeeks', { count: missed.length, weeks: missed.join(', ') });

  const trendText = (tr: Trend) =>
    tr === 'up'
      ? 'text-sage-deep'
      : tr === 'down'
        ? 'text-amber-deep'
        : 'text-ink-muted';
  const chipClass = (tr: Trend) =>
    tr === 'up'
      ? 'bg-sage-soft text-sage-deep'
      : tr === 'down'
        ? 'bg-amber-soft text-amber-deep'
        : 'bg-stone-soft text-ink-soft';
  const glyph = (tr: Trend) => (tr === 'up' ? '↑' : tr === 'down' ? '↓' : '→');
  const ariaWord = (tr: Trend) =>
    tr === 'up' ? t('improved') : tr === 'down' ? t('declined') : t('unchanged');

  const Stat = ({ children }: { children: React.ReactNode }) => (
    <span className="inline-flex items-center rounded-md bg-stone-soft px-2.5 py-1 text-[12px] text-ink-soft">
      {children}
    </span>
  );

  return (
    <section className="mt-10 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-[18px] leading-tight text-ink">
          {t('title')}
        </h2>
        {since.length > 0 && (
          <span className="shrink-0 text-[12px] text-ink-muted">
            {t('checkinCount', { count: since.length })}
          </span>
        )}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
        {since.length === 0 ? anchorPhrase : `${anchorPhrase} · ${adherencePhrase}`}
      </p>

      {since.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-soft">{t('empty')}</p>
      ) : (
        <>
          {rows.length > 0 ? (
            <ul className="mt-4 space-y-3.5">
              {rows.map((m) => (
                <li
                  key={m.goalId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5"
                >
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                    {m.text}
                    {m.archived && (
                      <span className="ml-1 text-[12px] font-normal text-ink-muted">
                        · {t('archived')}
                      </span>
                    )}
                  </span>

                  <span className={`shrink-0 ${trendText(m.trend)}`}>
                    <svg
                      width={SW}
                      height={SH}
                      viewBox={`0 0 ${SW} ${SH}`}
                      className="block"
                      aria-hidden="true"
                    >
                      {!m.single && (
                        <polyline
                          points={m.sparkPoints}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      <circle cx={m.lastX} cy={m.lastY} r={2.6} fill="currentColor" />
                    </svg>
                  </span>

                  <span className="flex shrink-0 items-center gap-2 text-right">
                    <span className="text-[16px] font-semibold text-ink tabular-nums">
                      {m.kind === 'gas' ? (
                        gasLabel(m.last)
                      ) : (
                        <>
                          {m.last}
                          <span className="text-[12px] font-normal text-ink-muted">
                            /10
                          </span>
                        </>
                      )}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] ${chipClass(
                        m.trend
                      )}`}
                    >
                      <span aria-hidden="true">{glyph(m.trend)}</span>
                      <span className="sr-only">{ariaWord(m.trend)}</span>
                      {m.trend === 'flat'
                        ? t('chipNoChange')
                        : m.kind === 'gas'
                          ? t('chipLevels', { count: m.delta })
                          : t('chipFrom', { value: m.first })}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[14px] text-ink-soft">{t('noGoalMovement')}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone pt-3">
            {hasTraining ? (
              <>
                {homeWeeks > 0 && (
                  <Stat>
                    {t('statHome', { days: homeDays })}
                    {homeWeeks > 1 && perWeek > 0
                      ? ` · ${t('statCadence', { n: perWeek })}`
                      : ''}
                  </Stat>
                )}
                {therapistSessions > 0 && (
                  <Stat>{t('statTherapist', { count: therapistSessions })}</Stat>
                )}
              </>
            ) : (
              <Stat>{t('trainingNone')}</Stat>
            )}
            {videoCount > 0 && <Stat>{t('statVideo', { count: videoCount })}</Stat>}
          </div>
        </>
      )}
    </section>
  );
}
