'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import {
  useArchivedVideos,
  useUnarchiveGoalVideo,
  useDeleteArchivedVideo,
  useGoalVideoUrl,
  type ArchivedGoalVideo
} from '@/lib/supabase/goalVideo';

/**
 * Per-patient archive of goal videos (migration 0092). Lists every archived
 * clip across the patient's goals with playback, the score it carried, the
 * consent flags captured when it was archived, and actions to un-archive
 * (restore to its goal/rating) or permanently delete.
 */
export function ArchivedVideosModal({
  patientId,
  onClose
}: {
  patientId: string;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.archive');
  const tA11y = useTranslations('a11y');
  const containerRef = useModalA11y(onClose);
  const archived = useArchivedVideos(patientId);
  const unarchive = useUnarchiveGoalVideo();
  const del = useDeleteArchivedVideo();

  const [playing, setPlaying] = useState<ArchivedGoalVideo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const items = archived.data ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="flex max-h-[92dvh] w-full max-w-[640px] flex-col overflow-y-auto rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl"
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

        <div className="flex flex-col gap-3 p-5">
          <p className="text-[13px] leading-relaxed text-ink-soft">{t('intro')}</p>

          {playing && (
            <ClipPlayer
              clip={playing}
              loadingLabel={t('loading')}
              onClose={() => setPlaying(null)}
              closeLabel={t('closePlayer')}
            />
          )}

          {archived.isLoading ? (
            <p className="text-[13px] text-ink-muted">{t('loading')}</p>
          ) : items.length === 0 ? (
            <p className="rounded-[var(--radius-button)] border border-stone bg-cream-soft p-4 text-[14px] text-ink-soft">
              {t('empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {items.map((v) => (
                <li
                  key={v.id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-ink">
                        {v.goalText || t('unknownGoal')}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-muted">
                        <span>
                          {v.source === 'baseline'
                            ? t('sourceBaseline')
                            : t('sourceRating')}
                        </span>
                        {v.clinicRating != null && (
                          <span>
                            · {t('score')} {v.clinicRating > 0 ? '+' : ''}
                            {v.clinicRating}
                          </span>
                        )}
                        <span>· {new Date(v.archivedAt).toLocaleDateString()}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            v.consentClinical
                              ? 'bg-sage-soft text-sage-deep'
                              : 'border border-stone text-ink-muted'
                          }`}
                        >
                          {v.consentClinical
                            ? t('consentClinicalYes')
                            : t('consentClinicalNo')}
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            v.consentResearch
                              ? 'bg-sage-soft text-sage-deep'
                              : 'border border-stone text-ink-muted'
                          }`}
                        >
                          {v.consentResearch
                            ? t('consentResearchYes')
                            : t('consentResearchNo')}
                        </span>
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setPlaying(v)}
                      className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
                    >
                      {t('play')}
                    </button>
                    <button
                      type="button"
                      disabled={unarchive.isPending}
                      onClick={() => void unarchive.mutateAsync(v.id)}
                      className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft disabled:opacity-50"
                    >
                      {t('unarchive')}
                    </button>
                    {confirmDelete === v.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          disabled={del.isPending}
                          onClick={async () => {
                            try {
                              await del.mutateAsync({
                                archiveId: v.id,
                                path: v.videoPath
                              });
                              if (playing?.id === v.id) setPlaying(null);
                              setConfirmDelete(null);
                            } catch {
                              /* keep the confirm open to retry */
                            }
                          }}
                          className="rounded-[var(--radius-button)] bg-amber-deep px-3 py-1.5 text-[13px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
                        >
                          {del.isPending ? t('deleting') : t('deleteConfirm')}
                        </button>
                        <button
                          type="button"
                          disabled={del.isPending}
                          onClick={() => setConfirmDelete(null)}
                          className="text-[13px] font-semibold text-ink-soft hover:text-ink"
                        >
                          {t('cancel')}
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(v.id)}
                        className="rounded-[var(--radius-button)] border border-amber-deep px-3 py-1.5 text-[13px] font-semibold text-amber-deep hover:bg-amber-deep hover:text-on-accent"
                      >
                        {t('delete')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ClipPlayer({
  clip,
  loadingLabel,
  onClose,
  closeLabel
}: {
  clip: ArchivedGoalVideo;
  loadingLabel: string;
  onClose: () => void;
  closeLabel: string;
}) {
  const url = useGoalVideoUrl(clip.videoPath);
  return (
    <div className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{clip.goalText}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-[13px] font-semibold text-ink-soft hover:text-ink"
        >
          {closeLabel}
        </button>
      </div>
      {url.data ? (
        <video
          src={url.data}
          controls
          playsInline
          preload="metadata"
          className="max-h-[50vh] w-full rounded-[var(--radius-button)] bg-ink"
        />
      ) : (
        <p className="text-[13px] text-ink-muted">{loadingLabel}</p>
      )}
    </div>
  );
}
