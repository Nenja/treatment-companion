'use client';

import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { useGoalHistory } from '@/lib/supabase/goalHistory';
import type { GoalHistoryRating } from '@/lib/supabase/goalHistory';

const fmtGas = (v: number) => (v > 0 ? `+${v}` : `${v}`);

function RatingChips({
  ratings,
  kind
}: {
  ratings: GoalHistoryRating[];
  kind: 'nrs' | 'gas';
}) {
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {ratings.map((r, i) => (
        <span
          key={i}
          className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-cream px-1.5 text-[12px] font-semibold text-ink"
        >
          {kind === 'gas' ? fmtGas(r.value) : r.value}
        </span>
      ))}
    </div>
  );
}

/**
 * Read-only timeline of a goal's versions (oldest first). Each version shows
 * the wording and calibration frozen at the time, plus the patient and
 * therapist ratings recorded under it — so the clinician can read how the goal
 * evolved across cycles. NRS values are 0–10; GAS values are the −2..+2 level
 * rated against that version's anchors (which is why versions are kept
 * separate rather than drawn as one continuous line).
 */
export function GoalHistoryModal({
  lineageId,
  goalLabel,
  onClose
}: {
  lineageId: string;
  goalLabel: string;
  onClose: () => void;
}) {
  const tA11y = useTranslations('a11y');
  const t = useTranslations('goalHistory');
  const containerRef = useModalA11y(onClose);
  const history = useGoalHistory(lineageId, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone/70 px-5 py-3">
          <div>
            <span className="eyebrow">{t('eyebrow')}</span>
            <p className="text-[14px] font-semibold text-ink">{goalLabel}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={tA11y('close')}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {history.isLoading ? (
            <p className="text-[14px] text-ink-muted">{t('loading')}</p>
          ) : history.isError ? (
            <p className="text-[14px] text-ink-muted">{t('error')}</p>
          ) : !history.data || history.data.length === 0 ? (
            <p className="text-[14px] text-ink-muted">{t('empty')}</p>
          ) : (
            <ol className="space-y-4">
              {history.data.map((v) => (
                <li
                  key={v.id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-sage-deep px-2 py-0.5 text-[12px] font-semibold text-on-accent">
                      {t('versionN', { n: v.version })}
                    </span>
                    {v.cycleNumber != null && (
                      <span className="text-[12px] text-ink-muted">
                        {t('cycleN', { n: v.cycleNumber })}
                      </span>
                    )}
                    {v.isLive && (
                      <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-semibold text-sage-deep">
                        {t('current')}
                      </span>
                    )}
                  </div>

                  <p className="mt-2 font-display text-[15px] leading-snug text-ink">
                    {v.patientFacingText}
                  </p>

                  {/* Calibration frozen at this version */}
                  {v.kind === 'nrs' ? (
                    <p className="mt-2 text-[13px] text-ink-soft">
                      {t('nrsCalibration', {
                        baseline: v.nrsBaseline ?? '—',
                        target: v.nrsTarget ?? '—'
                      })}
                    </p>
                  ) : (
                    v.gas && (
                      <ul className="mt-2 space-y-0.5 text-[12px] leading-snug text-ink-soft">
                        <li>+2 · {v.gas.plus2}</li>
                        <li>+1 · {v.gas.plus1}</li>
                        <li>&nbsp;0 · {v.gas.zero}</li>
                        <li>−1 · {v.gas.minus1}</li>
                        <li>−2 · {v.gas.minus2}</li>
                      </ul>
                    )
                  )}

                  {/* Ratings recorded under this version */}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[12px] font-semibold text-ink-soft">
                        {t('patientRatings', {
                          count: v.patientRatings.length
                        })}
                      </p>
                      {v.patientRatings.length > 0 && (
                        <RatingChips ratings={v.patientRatings} kind={v.kind} />
                      )}
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-ink-soft">
                        {t('therapistRatings', {
                          count: v.therapistRatings.length
                        })}
                      </p>
                      {v.therapistRatings.length > 0 && (
                        <RatingChips
                          ratings={v.therapistRatings}
                          kind={v.kind}
                        />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
