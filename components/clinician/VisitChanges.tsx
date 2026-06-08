'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import { VideoPlayerModal } from '@/components/clinician/VideoPlayerModal';
import { useSetClinicVideoScore } from '@/lib/supabase/clinicianPatient';
import {
  usePatientObservations,
  type Observation
} from '@/lib/supabase/observations';
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
  /** Patient id — drives the conditional wearable trend (only shown when
   *  the patient actually has observations). */
  patientId: string;
  /** Opens the "last treatment" dialog. Only wired when a treatment is
   *  recorded for the cycle; the button is hidden otherwise. */
  onShowLastTreatment?: () => void;
}

type Trend = 'up' | 'down' | 'flat';

interface WearableSeries {
  label: string;
  unit: string | null;
  points: number[];
  latest: number;
  dir: Trend;
}

/** Group numeric observations by metric and build a small recent series for
 *  each (oldest→newest), capped to a few metrics. Non-numeric or empty
 *  metrics are dropped, so a patient with no usable data yields []. */
function buildWearableSeries(observations: Observation[]): WearableSeries[] {
  const byMetric = new Map<string, Observation[]>();
  for (const o of observations) {
    if (o.valueNumeric == null) continue;
    const key = o.display || o.code;
    const arr = byMetric.get(key);
    if (arr) arr.push(o);
    else byMetric.set(key, [o]);
  }
  const out: WearableSeries[] = [];
  for (const [label, list] of byMetric) {
    const sorted = [...list].sort(
      (a, b) =>
        new Date(a.effectiveTime).getTime() -
        new Date(b.effectiveTime).getTime()
    );
    const points = sorted
      .map((o) => o.valueNumeric as number)
      .slice(-12);
    if (points.length === 0) continue;
    const first = points[0];
    const latest = points[points.length - 1];
    const dir: Trend =
      latest > first ? 'up' : latest < first ? 'down' : 'flat';
    out.push({ label, unit: sorted[sorted.length - 1].unit, points, latest, dir });
    if (out.length >= 3) break;
  }
  return out;
}

function Sparkline({ points }: { points: number[] }) {
  const w = 72;
  const h = 24;
  const pad = 2;
  const n = points.length;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const coords = points
    .map((v, i) => {
      const x = n === 1 ? w : (i / (n - 1)) * w;
      const y = h - pad - ((v - min) / span) * (h - 2 * pad);
      return `${Math.round(x)},${Math.round(y)}`;
    })
    .join(' ');
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden
      className="shrink-0 text-sage-deep"
    >
      <polyline
        points={coords}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface GoalRow {
  goalId: string;
  text: string;
  archived: boolean;
  kind: 'nrs' | 'gas';
  last: number;
  trend: Trend;
}

/**
 * Auto-generated, read-only summary of what changed since the patient was last
 * seen (anchored to the last treatment). One row per goal: the current value and
 * a plain-language verdict — improved / declined / no change — where up and green
 * always mean "better", whether the goal is higher- or lower-is-better. (We
 * deliberately avoid a slope line and a raw "from N", since those read as a
 * decline for lower-is-better goals even when the patient improved.) Then a
 * compact strip for adherence, training and videos. Computed from loaded data;
 * nothing is editable.
 */
export function VisitChanges({
  lastTreatmentDate,
  cycleStartDate,
  checkins,
  goals,
  patientId,
  onShowLastTreatment
}: VisitChangesProps) {
  const t = useTranslations('visitChanges');
  const tLast = useTranslations('lastTreatment');
  const tv = useTranslations('clinician.video');
  const locale = useLocale();
  const setClinicScore = useSetClinicVideoScore();
  const observationsQuery = usePatientObservations(patientId);
  const wearable = buildWearableSeries(observationsQuery.data ?? []);
  const [video, setVideo] = useState<{
    path: string;
    title: string;
    ratingId: string;
    goalId: string;
    clinicRating: number | null;
    clinicUnusable: boolean;
  } | null>(null);

  // Compact badge describing the clinic's score state for a clip.
  const scoreBadge = (rating: number | null, unusable: boolean): string => {
    if (unusable) return tv('score.badgeUnusable');
    if (rating != null) {
      return tv('score.badgeScored', {
        n: rating > 0 ? `+${rating}` : String(rating)
      });
    }
    return tv('score.badgePending');
  };

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

  // --- Per-goal verdict ----------------------------------------------------
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
    // Direction-aware: "up" = clinically better. GAS is higher-is-better; NRS
    // depends on the goal's configured direction.
    let betterWhenHigher = true;
    if (kind === 'nrs' && goal.nrs) {
      betterWhenHigher = goal.nrs.direction === 'higherIsBetter';
    }
    let trend: Trend = 'flat';
    if (last !== first) trend = last > first === betterWhenHigher ? 'up' : 'down';
    rows.push({
      goalId: goal.id,
      text: goal.patientFacingText,
      archived: goal.status !== 'active',
      kind,
      last,
      trend
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
  // Patient-recorded clips since the anchor, labelled by goal + week so the
  // clinician can play each back. (Storage read is granted to clinicians with
  // an active session by the goal-videos bucket policy; see migration 0062.)
  const goalById = new Map(goals.map((g) => [g.id, g]));
  const videos: {
    key: string;
    goalText: string;
    week: number;
    path: string;
    ratingId: string;
    goalId: string;
    clinicRating: number | null;
    clinicUnusable: boolean;
  }[] = [];
  for (const c of since) {
    for (const r of c.ratings) {
      if (r.videoPath) {
        videos.push({
          key: `${c.id}:${r.approvedGoalId}`,
          goalText: goalById.get(r.approvedGoalId)?.patientFacingText ?? '',
          week: c.weekNumber,
          path: r.videoPath,
          ratingId: r.id,
          goalId: r.approvedGoalId,
          clinicRating: r.clinicVideoRating,
          clinicUnusable: r.clinicVideoUnusable
        });
      }
    }
  }

  const anchorPhrase = anchoredToTreatment
    ? t('subTreatment', { date: formatLongDate(anchorIso, locale) })
    : t('subCycle', { date: formatLongDate(anchorIso, locale) });
  const adherencePhrase =
    missed.length === 0
      ? t('everyWeek')
      : t('missedWeeks', { count: missed.length, weeks: missed.join(', ') });

  const chipClass = (tr: Trend) =>
    tr === 'up'
      ? 'bg-sage-soft text-sage-deep'
      : tr === 'down'
        ? 'bg-amber-soft text-amber-deep'
        : 'bg-stone-soft text-ink-soft';
  const glyph = (tr: Trend) => (tr === 'up' ? '↑' : tr === 'down' ? '↓' : '→');
  const verdict = (tr: Trend) =>
    tr === 'up' ? t('improved') : tr === 'down' ? t('declined') : t('chipNoChange');

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
        <div className="flex shrink-0 items-baseline gap-3">
          {onShowLastTreatment && anchoredToTreatment && (
            <button
              type="button"
              onClick={onShowLastTreatment}
              className="self-center rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
            >
              {tLast('button')}
            </button>
          )}
          {since.length > 0 && (
            <span className="text-[12px] text-ink-muted">
              {t('checkinCount', { count: since.length })}
            </span>
          )}
        </div>
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
        {since.length === 0 ? anchorPhrase : `${anchorPhrase} · ${adherencePhrase}`}
      </p>

      {since.length === 0 ? (
        <p className="mt-3 text-[15px] text-ink-soft">{t('empty')}</p>
      ) : (
        <>
          {rows.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {rows.map((m) => (
                <li
                  key={m.goalId}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
                >
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-ink">
                    {m.text}
                    {m.archived && (
                      <span className="ml-1 text-[12px] font-normal text-ink-muted">
                        · {t('archived')}
                      </span>
                    )}
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
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
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] ${chipClass(
                        m.trend
                      )}`}
                    >
                      <span aria-hidden="true">{glyph(m.trend)}</span>
                      {verdict(m.trend)}
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
          </div>
          {wearable.length > 0 && (
            <div className="mt-3 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-3">
              <p className="text-[12px] font-semibold text-ink-soft">
                {t('wearableHeading')}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                {wearable.map((w) => (
                  <div key={w.label} className="flex items-center gap-3">
                    <Sparkline points={w.points} />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-ink">
                        {w.label}
                      </p>
                      <p className="text-[12px] text-ink-soft">
                        {w.dir === 'up' ? '↑' : w.dir === 'down' ? '↓' : '→'}{' '}
                        {Math.round(w.latest * 100) / 100}
                        {w.unit ? ` ${w.unit}` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {videos.length > 0 && (
            <div className="mt-3">
              <p className="text-[12px] font-semibold text-ink-soft">
                {t('videosHeading')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {videos.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() =>
                      setVideo({
                        path: v.path,
                        title: t('videoTitle', {
                          goal: v.goalText,
                          week: v.week
                        }),
                        ratingId: v.ratingId,
                        goalId: v.goalId,
                        clinicRating: v.clinicRating,
                        clinicUnusable: v.clinicUnusable
                      })
                    }
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    {t('videoLabel', { goal: v.goalText, week: v.week })}
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                        v.clinicUnusable
                          ? 'bg-amber-soft text-amber-deep'
                          : v.clinicRating != null
                            ? 'bg-sage-soft text-sage-deep'
                            : 'bg-stone-soft text-ink-muted'
                      }`}
                    >
                      {scoreBadge(v.clinicRating, v.clinicUnusable)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
      {video && (
        <VideoPlayerModal
          path={video.path}
          title={video.title}
          onClose={() => setVideo(null)}
          scoring={{
            ratingId: video.ratingId,
            currentRating: video.clinicRating,
            currentUnusable: video.clinicUnusable,
            goalKind: goalById.get(video.goalId)?.kind ?? 'gas',
            anchors: goalById.get(video.goalId)?.gas ?? null,
            onSave: async (next) => {
              await setClinicScore.mutateAsync({
                ratingId: video.ratingId,
                rating: next.rating,
                unusable: next.unusable
              });
            }
          }}
        />
      )}
    </section>
  );
}
