'use client';

import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { useGoalVideoUrl } from '@/lib/supabase/goalVideo';

/**
 * Plays back a patient-recorded goal video. Fetches a short-lived signed
 * URL for the Storage object and renders it in a native <video> player.
 * Closes on backdrop tap, the close button, or Esc (via useModalA11y).
 */
export function VideoPlayerModal({
  path,
  title,
  onClose
}: {
  path: string;
  title: string;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.video');
  const containerRef = useModalA11y(onClose);
  const { data: url, isLoading, isError } = useGoalVideoUrl(path);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[var(--max-w-page-narrow)] rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('close')}
          </button>
        </div>
        <div className="mt-3">
          {isLoading ? (
            <p className="py-10 text-center text-[14px] text-ink-muted">
              {t('loading')}
            </p>
          ) : isError || !url ? (
            <p className="py-10 text-center text-[14px] text-amber-deep">
              {t('error')}
            </p>
          ) : (
            <video
              src={url}
              controls
              playsInline
              preload="metadata"
              className="max-h-[70vh] w-full rounded-[var(--radius-button)] bg-ink"
            >
              {t('unsupported')}
            </video>
          )}
        </div>
      </div>
    </div>
  );
}
