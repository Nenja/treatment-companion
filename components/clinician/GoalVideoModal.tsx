'use client';

import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { useGoalVideoUrl } from '@/lib/supabase/goalVideo';

interface GoalVideoHubGoal {
  id: string;
  text: string;
  enabled: boolean;
  instruction: string | null;
  setup: string | null;
  seconds: number | null;
  baselineVideoPath: string | null;
}

/**
 * Per-goal video overview — one place that gathers everything video for a goal:
 * the task protocol, the baseline clip (with inline playback), and pointers to
 * the check-in clips (reviewed in "Since last visit") and the patient archive.
 * It reuses the existing protocol/baseline editors via the callbacks rather
 * than re-implementing them, so the proven flows are untouched.
 */
export function GoalVideoModal({
  goal,
  onEditProtocol,
  onManageBaseline,
  onOpenArchive,
  onClose
}: {
  goal: GoalVideoHubGoal;
  onEditProtocol: () => void;
  onManageBaseline: () => void;
  onOpenArchive: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.videoHub');
  const tA11y = useTranslations('a11y');
  const containerRef = useModalA11y(onClose);
  const baseline = useGoalVideoUrl(goal.enabled ? goal.baselineVideoPath : null);

  const hasTask = !!(goal.instruction || goal.setup || goal.seconds);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="flex max-h-[92dvh] w-full max-w-[560px] flex-col overflow-y-auto rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone/70 px-5 py-3">
          <span className="eyebrow">{t('title')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={tA11y('close')}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <p className="font-display text-[18px] leading-tight text-ink">{goal.text}</p>

          {/* Task protocol */}
          <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                {t('protocolSection')}
              </h3>
              <button
                type="button"
                onClick={onEditProtocol}
                className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
              >
                {goal.enabled ? t('editTask') : t('setUpTask')}
              </button>
            </div>
            {!goal.enabled ? (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                {t('disabled')}
              </p>
            ) : hasTask ? (
              <dl className="mt-2 flex flex-col gap-1.5 text-[13px]">
                {goal.instruction && (
                  <div className="flex flex-col">
                    <dt className="text-ink-muted">{t('instruction')}</dt>
                    <dd className="whitespace-pre-wrap text-ink-soft">
                      {goal.instruction}
                    </dd>
                  </div>
                )}
                {goal.setup && (
                  <div className="flex flex-col">
                    <dt className="text-ink-muted">{t('setup')}</dt>
                    <dd className="whitespace-pre-wrap text-ink-soft">{goal.setup}</dd>
                  </div>
                )}
                {goal.seconds != null && (
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">{t('seconds')}</dt>
                    <dd className="text-ink-soft">{goal.seconds}s</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="mt-2 text-[13px] text-ink-muted">{t('noTask')}</p>
            )}
          </section>

          {/* Baseline clip */}
          {goal.enabled && (
            <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('baselineSection')}
                </h3>
                <button
                  type="button"
                  onClick={onManageBaseline}
                  className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
                >
                  {goal.baselineVideoPath ? t('manageBaseline') : t('recordBaseline')}
                </button>
              </div>
              {goal.baselineVideoPath ? (
                baseline.data ? (
                  <video
                    src={baseline.data}
                    controls
                    playsInline
                    preload="metadata"
                    className="mt-2 max-h-[45vh] w-full rounded-[var(--radius-button)] bg-ink"
                  />
                ) : (
                  <p className="mt-2 text-[13px] text-ink-muted">{t('loading')}</p>
                )
              ) : (
                <p className="mt-2 text-[13px] text-ink-muted">{t('noBaseline')}</p>
              )}
            </section>
          )}

          {/* Pointers to the other places clips live */}
          <div className="flex flex-col gap-2 border-t border-stone pt-3 text-[13px] text-ink-soft">
            <p>{t('clipsNote')}</p>
            <button
              type="button"
              onClick={onOpenArchive}
              className="self-start rounded-[var(--radius-button)] border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-sage-deep hover:bg-stone-soft"
            >
              {t('openArchive')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
