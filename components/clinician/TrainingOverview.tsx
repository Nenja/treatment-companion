'use client';

import { Fragment, useId, useState } from 'react';
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

interface WeekTraining {
  home: number[];
  therapist: number[];
}

interface TrainingOverviewProps {
  /** Current week of the active cycle (1-indexed). */
  currentWeek: number;
  /** Week number → days trained at home / with a therapist that week.
   *  A present key means the week was reported (either array may be empty);
   *  absent = not reported. */
  daysByWeek: Map<number, WeekTraining>;
}

/**
 * Collapsible week × day grid of the patient's training reports for the
 * active cycle. Rows are Mon–Sun, columns are weeks left→right (matching the
 * goal charts' timeline). A filled cell = trained at home that day; an amber
 * ring = a session with a therapist that day (a cell can be both). The header
 * stays visible when collapsed and carries the summary.
 */
export function TrainingOverview({
  currentWeek,
  daysByWeek
}: TrainingOverviewProps) {
  const t = useTranslations('training');
  const [open, setOpen] = useState(true);
  const panelId = useId();

  const latestReported = daysByWeek.size
    ? Math.max(...Array.from(daysByWeek.keys()))
    : 0;
  const totalWeeks = Math.max(currentWeek, latestReported, 4);
  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);

  const reportedWeeks = weeks.filter(
    (w) => w <= currentWeek && daysByWeek.has(w)
  );
  const homeTotal = reportedWeeks.reduce(
    (sum, w) => sum + (daysByWeek.get(w)?.home.length ?? 0),
    0
  );
  const therTotal = reportedWeeks.reduce(
    (sum, w) => sum + (daysByWeek.get(w)?.therapist.length ?? 0),
    0
  );
  const homeAvg =
    reportedWeeks.length > 0
      ? (homeTotal / reportedWeeks.length).toFixed(1)
      : null;

  return (
    <article className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-baseline justify-between gap-2 rounded-[var(--radius-card)] p-4 text-left hover:bg-stone-soft/60"
      >
        <span className="flex items-center gap-2">
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 16 16"
            className={`shrink-0 text-ink-muted transition-transform ${
              open ? 'rotate-90' : ''
            }`}
          >
            <path
              d="M6 4 L10 8 L6 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="font-display text-[16px] leading-snug text-ink">
            {t('overviewTitle')}
          </span>
        </span>
        <span className="text-[13px] text-ink-muted">
          {homeAvg !== null
            ? t('overviewSummary', { avg: homeAvg, ther: therTotal })
            : t('overviewNone')}
        </span>
      </button>

      {open && (
        <div id={panelId} className="px-4 pb-4">
          <div
            className="grid items-center gap-[5px]"
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
                    const entry = daysByWeek.get(w);
                    const future = w > currentWeek;
                    const home = !future && (entry?.home.includes(iso) ?? false);
                    const ther =
                      !future && (entry?.therapist.includes(iso) ?? false);
                    let cls: string;
                    if (future) {
                      cls = 'border border-dashed border-stone/60';
                    } else if (home && ther) {
                      cls = 'bg-sage-deep border-2 border-amber-deep';
                    } else if (home) {
                      cls = 'bg-sage-deep';
                    } else if (ther) {
                      cls = 'bg-amber-soft border-2 border-amber-deep';
                    } else {
                      cls = 'border border-stone';
                    }
                    return (
                      <div
                        key={w}
                        className={`mx-auto box-border h-[18px] w-[18px] rounded ${cls}`}
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
                className={`text-center text-[11px] ${
                  w === currentWeek
                    ? 'font-semibold text-sage-deep'
                    : 'text-ink-muted'
                }`}
              >
                {w}
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-sage-deep" aria-hidden />
              {t('legendHome')}
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="box-border h-3 w-3 rounded border-2 border-amber-deep bg-amber-soft"
                aria-hidden
              />
              {t('legendTherapist')}
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
        </div>
      )}
    </article>
  );
}
