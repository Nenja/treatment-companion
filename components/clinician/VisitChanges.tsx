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
  /** Active + archived goals — used for the goal's text, kind and direction. */
  goals: ClinicianPatientGoal[];
}

interface Movement {
  goalId: string;
  text: string;
  archived: boolean;
  kind: 'nrs' | 'gas';
  first: number;
  last: number;
  /** improved | declined | unchanged — direction-aware. */
  trend: 'up' | 'down' | 'flat';
}

interface VideoItem {
  goalId: string;
  text: string;
  week: number;
}

/**
 * An auto-generated, read-only summary of what changed since the patient was
 * last seen (anchored to the last treatment). Lists the check-ins submitted
 * since then with per-goal movement, the training logged, and any videos
 * recorded. Nothing is editable — it is computed from the data already loaded.
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

  // Check-ins submitted since the anchor, oldest → newest.
  const since = [...checkins]
    .filter((c) => new Date(c.submittedAt).getTime() >= anchorMs)
    .sort(
      (a, b) =>
        new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime() ||
        a.weekNumber - b.weekNumber
    );

  const goalById = new Map(goals.map((g) => [g.id, g]));

  // GAS level (−2..2) → descriptive label.
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

  // --- Goal movement: first → last value across the window, per goal -------
  const movements: Movement[] = [];
  // Preserve the goals' own order (active first, then archived as passed in).
  for (const goal of goals) {
    const kind = goal.kind;
    const values: number[] = [];
    for (const c of since) {
      const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
      if (!r) continue;
      const v = kind === 'nrs' ? r.nrsValue : r.ratingValue;
      if (typeof v === 'number') values.push(v);
    }
    if (values.length === 0) continue;
    const first = values[0];
    const last = values[values.length - 1];

    // Direction-aware trend. GAS: higher level is always better. NRS: depends
    // on the goal's configured direction.
    let betterWhenHigher = true;
    if (kind === 'nrs' && goal.nrs) {
      betterWhenHigher = goal.nrs.direction === 'higherIsBetter';
    }
    let trend: Movement['trend'] = 'flat';
    if (last !== first) {
      const higher = last > first;
      trend = higher === betterWhenHigher ? 'up' : 'down';
    }

    movements.push({
      goalId: goal.id,
      text: goal.patientFacingText,
      archived: goal.status !== 'active',
      kind,
      first,
      last,
      trend
    });
  }

  // --- Training aggregate --------------------------------------------------
  let homeDays = 0;
  let homeWeeks = 0;
  let therapistSessions = 0;
  for (const c of since) {
    if (c.trainingDays) {
      homeDays += c.trainingDays.length;
      homeWeeks += 1;
    }
    if (c.trainingDaysTherapist) {
      therapistSessions += c.trainingDaysTherapist.length;
    }
  }
  const hasTraining = homeWeeks > 0 || therapistSessions > 0;

  // --- Videos recorded -----------------------------------------------------
  const videos: VideoItem[] = [];
  for (const c of since) {
    for (const r of c.ratings) {
      if (!r.videoPath) continue;
      videos.push({
        goalId: r.approvedGoalId,
        text: goalById.get(r.approvedGoalId)?.patientFacingText ?? '—',
        week: c.weekNumber
      });
    }
  }

  const weeksList = since.map((c) => c.weekNumber).join(', ');

  const trendColour = (trend: Movement['trend']) =>
    trend === 'up'
      ? 'text-sage-deep'
      : trend === 'down'
        ? 'text-amber-deep'
        : 'text-ink-soft';
  const trendGlyph = (trend: Movement['trend']) =>
    trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
  const trendAria = (trend: Movement['trend']) =>
    trend === 'up' ? t('improved') : trend === 'down' ? t('declined') : t('unchanged');

  const Label = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
      {children}
    </p>
  );

  return (
    <section className="mt-10 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <h2 className="font-display text-[18px] leading-tight text-ink">
        {t('title')}
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
        {anchoredToTreatment
          ? t('subTreatment', { date: formatLongDate(anchorIso, locale) })
          : t('subCycle', { date: formatLongDate(anchorIso, locale) })}
      </p>

      {since.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-soft">{t('empty')}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Check-ins + goal movement */}
          <div>
            <Label>{t('checkinsLabel')}</Label>
            <p className="mt-1 text-[14px] text-ink">
              {t('weeks', { weeks: weeksList })}
            </p>
            {movements.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {movements.map((m) => (
                  <li
                    key={m.goalId}
                    className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[15px] text-ink"
                  >
                    <span className="font-semibold">
                      {m.text}
                      {m.archived && (
                        <span className="ml-1 align-middle text-[12px] font-normal text-ink-muted">
                          · {t('archived')}
                        </span>
                      )}
                    </span>
                    <span className={`tabular-nums ${trendColour(m.trend)}`}>
                      {m.kind === 'gas' ? gasLabel(m.first) : m.first}
                      {m.last !== m.first && (
                        <>
                          {' '}
                          <span aria-label={trendAria(m.trend)}>
                            {trendGlyph(m.trend)}
                          </span>{' '}
                          {m.kind === 'gas' ? gasLabel(m.last) : m.last}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-[14px] text-ink-soft">
                {t('noGoalMovement')}
              </p>
            )}
          </div>

          {/* Training */}
          <div>
            <Label>{t('trainingLabel')}</Label>
            {hasTraining ? (
              <p className="mt-1 text-[15px] text-ink">
                {homeWeeks > 0 && t('trainingHome', { days: homeDays })}
                {homeWeeks > 0 && therapistSessions > 0 && ' · '}
                {therapistSessions > 0 &&
                  t('trainingTherapist', { count: therapistSessions })}
              </p>
            ) : (
              <p className="mt-1 text-[14px] text-ink-soft">{t('trainingNone')}</p>
            )}
          </div>

          {/* Videos (only when present) */}
          {videos.length > 0 && (
            <div>
              <Label>{t('videosLabel')}</Label>
              <ul className="mt-1 space-y-1 text-[15px] text-ink">
                {videos.map((v, i) => (
                  <li key={`${v.goalId}-${v.week}-${i}`}>
                    {t('videoItem', { goal: v.text, week: v.week })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
