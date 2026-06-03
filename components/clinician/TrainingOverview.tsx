'use client';

import { Fragment } from 'react';
import { useTranslations } from 'next-intl';

/** Short-label keys for Monday..Sunday (ISO weekday 1..7). */
const DAY_KEYS = [
  'monShort',
  'tueShort',
  'wedShort',
  'thuShort',
  'friShort',
  'satShort',
  'sunShort'
] as const;

interface TrainingOverviewProps {
  /** Current week of the active cycle (1-indexed). */
  currentWeek: number;
  /** Week number → ISO weekday numbers trained that week. A present key
   *  with an empty array means the patient reported no training that
   *  week (still a reported data point). Absent = not reported. */
  daysByWeek: Map<number, number[]>;
}

/**
 * A compact week × day grid of the patient's home-training reports for the
 * active cycle. Rows are Mon–Sun, columns are weeks left→right (matching
 * the goal charts' timeline), so adherence can be read against outcomes.
 * Filled cell = trained that day; the column density shows how many days,
 * and the left→right shape shows the trend and any drop-off.
 */
export function TrainingOverview({
  currentWeek,
  daysByWeek
}: TrainingOverviewProps) {
  const t = useTranslations('training');

  const latestReported = daysByWeek.size
    ? Math.max(...Array.from(daysByWeek.keys()))
    : 0;
  const totalWeeks = Math.max(currentWeek, latestReported, 4);
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  const reportedWeeks = weeks.filter(
    (w) => w <= currentWeek && daysByWeek.has(w)
  );
  const totalSessions = reportedWeeks.reduce(
    (sum, w) => sum + (daysByWeek.get(w)?.length ?? 0),
    0
  );
  const avg =
    reportedWeeks.length > 0
      ? (totalSessions / reportedWeeks.length).toFixed(1)
      : null;

  return (
    <article className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-[16px] leading-snug text-ink">
          {t('overviewTitle')}
        </p>
        <p className="text-[13px] text-ink-muted">
          {avg !== null
            ? t('overviewSummary', { avg, sessions: totalSessions })
            : t('overviewNone')}
        </p>
      </div>

      <div
        className="mt-3 grid items-center gap-[5px]"
        style={{ gridTemplateColumns: `24px repeat(${totalWeeks}, 1fr)` }}
        role="img"
        aria-label={t('overviewAria')}
      >
        {DAY_KEYS.map((key, d) => {
          const iso = d + 1;
          return (
            <Fragment key={key}>
              <div className="text-center text-[11px] text-ink-muted">
                {t(key)}
              </div>
              {weeks.map((w) => {
                const future = w > currentWeek;
                const on =
                  !future && (daysByWeek.get(w)?.includes(iso) ?? false);
                return (
                  <div
                    key={w}
                    className={[
                      'mx-auto h-[18px] w-[18px] rounded',
                      on
                        ? 'bg-sage-deep'
                        : future
                        ? 'border border-dashed border-stone/60'
                        : 'border border-stone'
                    ].join(' ')}
                  />
                );
              })}
            </Fragment>
          );
        })}

        <div />
        {weeks.map((w) => (
          <div
            key={`n-${w}`}
            className={[
              'text-center text-[11px]',
              w === currentWeek
                ? 'font-semibold text-sage-deep'
                : 'text-ink-muted'
            ].join(' ')}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-sage-deep" aria-hidden />
          {t('legendTrained')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-stone" aria-hidden />
          {t('legendNone')}
        </span>
        {totalWeeks > currentWeek && (
          <span className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded border border-dashed border-stone/60"
              aria-hidden
            />
            {t('legendUpcoming')}
          </span>
        )}
        <span className="ml-auto text-ink-muted">{t('legendWeek')}</span>
      </div>
    </article>
  );
}
