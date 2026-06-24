'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import {
  useGoalVideoUrl,
  useDeleteGoalRatingVideo,
  useArchiveGoalVideo
} from '@/lib/supabase/goalVideo';
import type { GasAnchors } from '@/lib/supabase/clinicianPatient';

export interface VideoScoring {
  ratingId: string;
  currentRating: number | null;
  currentUnusable: boolean;
  goalKind: 'nrs' | 'gas';
  /** The goal's GAS anchors, shown as the scoring reference when present. */
  anchors?: GasAnchors | null;
  onSave: (next: { rating: number | null; unusable: boolean }) => Promise<void>;
}

const LEVELS: Array<{ v: number; key: string; anchor: keyof GasAnchors }> = [
  { v: 2, key: 'muchBetter', anchor: 'plus2' },
  { v: 1, key: 'better', anchor: 'plus1' },
  { v: 0, key: 'asExpected', anchor: 'zero' },
  { v: -1, key: 'less', anchor: 'minus1' },
  { v: -2, key: 'muchLess', anchor: 'minus2' }
];

/**
 * Plays back a patient-recorded goal video, and — when `scoring` is given —
 * lets the clinician score the standardized clip against the goal's GAS
 * levels (the authoritative, one-rater outcome) or mark it off-protocol.
 * Closes on backdrop tap, the close button, or Esc (via useModalA11y).
 */
export function VideoPlayerModal({
  path,
  title,
  onClose,
  scoring,
  approvedGoalId,
  consentClinical
}: {
  path: string;
  title: string;
  onClose: () => void;
  scoring?: VideoScoring;
  /** When set with clinical consent, an Archive action is offered alongside
   *  Delete (migration 0092). */
  approvedGoalId?: string;
  consentClinical?: boolean;
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
        className="max-h-[90vh] w-full max-w-[var(--max-w-page-narrow)] overflow-y-auto rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
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
              className="max-h-[60vh] w-full rounded-[var(--radius-button)] bg-ink"
            >
              {t('unsupported')}
            </video>
          )}
        </div>
        {scoring && <ScorePanel scoring={scoring} onDone={onClose} />}
        {scoring && (
          <DeleteClipControl
            ratingId={scoring.ratingId}
            path={path}
            approvedGoalId={approvedGoalId}
            canArchive={!!consentClinical}
            onDeleted={onClose}
          />
        )}
      </div>
    </div>
  );
}

function ScorePanel({
  scoring,
  onDone
}: {
  scoring: VideoScoring;
  onDone: () => void;
}) {
  const t = useTranslations('clinician.video');
  const [rating, setRating] = useState<number | null>(scoring.currentRating);
  const [unusable, setUnusable] = useState<boolean>(scoring.currentUnusable);
  const [saving, setSaving] = useState(false);

  const useAnchors = scoring.goalKind === 'gas' && !!scoring.anchors;
  const dirty =
    rating !== scoring.currentRating || unusable !== scoring.currentUnusable;
  const canSave = !saving && dirty && (unusable || rating !== null);

  const save = async () => {
    setSaving(true);
    try {
      await scoring.onSave({ rating: unusable ? null : rating, unusable });
      onDone();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 border-t border-stone pt-3">
      <p className="text-[13px] font-semibold text-ink">{t('score.heading')}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
        {t('score.intro')}
      </p>
      <div className="mt-3 space-y-1.5">
        {LEVELS.map((lvl) => {
          const selected = !unusable && rating === lvl.v;
          const label = useAnchors
            ? scoring.anchors![lvl.anchor]
            : t(`score.level.${lvl.key}`);
          return (
            <button
              key={lvl.v}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setRating(lvl.v);
                setUnusable(false);
              }}
              className={`flex w-full items-start gap-2 rounded-[var(--radius-button)] border px-3 py-2 text-left text-[13px] ${
                selected
                  ? 'border-sage bg-sage-soft text-sage-deep'
                  : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
              }`}
            >
              <span className="mt-0.5 shrink-0 font-semibold tabular-nums">
                {lvl.v > 0 ? `+${lvl.v}` : lvl.v}
              </span>
              <span>
                {useAnchors && (
                  <span className="mr-1 font-semibold text-ink">
                    {t(`score.level.${lvl.key}`)}:
                  </span>
                )}
                {label}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        aria-pressed={unusable}
        onClick={() => {
          setUnusable((u) => !u);
          if (!unusable) setRating(null);
        }}
        className={`mt-2 flex w-full items-center justify-between rounded-[var(--radius-button)] border px-3 py-2 text-[13px] font-semibold ${
          unusable
            ? 'border-amber-deep bg-amber-soft text-amber-deep'
            : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
        }`}
      >
        <span>{t('score.unusable')}</span>
        <span className="text-[11px] font-normal text-ink-muted">
          {t('score.unusableHint')}
        </span>
      </button>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-[var(--radius-button)] bg-sage-deep px-5 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
        >
          {saving ? t('score.saving') : t('score.save')}
        </button>
      </div>
    </div>
  );
}

function DeleteClipControl({
  ratingId,
  path,
  approvedGoalId,
  canArchive,
  onDeleted
}: {
  ratingId: string;
  path: string;
  approvedGoalId?: string;
  canArchive?: boolean;
  onDeleted: () => void;
}) {
  const t = useTranslations('clinician.video');
  const [confirming, setConfirming] = useState(false);
  const del = useDeleteGoalRatingVideo();
  const archive = useArchiveGoalVideo();

  if (!confirming) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-stone pt-3">
        {canArchive && approvedGoalId && (
          <button
            type="button"
            disabled={archive.isPending}
            onClick={async () => {
              try {
                await archive.mutateAsync({
                  approvedGoalId,
                  source: 'rating',
                  ratingId
                });
                onDeleted();
              } catch {
                /* surfaced by the mutation; leave the dialog open */
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="4" rx="1" />
              <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
              <path d="M10 12h4" />
            </svg>
            {archive.isPending ? t('archiving') : t('archive')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-amber-deep px-3 py-1.5 text-[13px] font-semibold text-amber-deep hover:bg-amber-deep hover:text-on-accent"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
          {t('delete')}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-stone pt-3">
      <p className="text-[13px] text-ink-soft">{t('deleteConfirm')}</p>
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={del.isPending}
          onClick={async () => {
            try {
              await del.mutateAsync({ ratingId, path });
              onDeleted();
            } catch {
              /* leave the dialog open so the clinician can retry */
            }
          }}
          className="rounded-[var(--radius-button)] bg-amber-deep px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
        >
          {del.isPending ? t('deleting') : t('deleteConfirmCta')}
        </button>
        <button
          type="button"
          disabled={del.isPending}
          onClick={() => setConfirming(false)}
          className="text-[13px] font-semibold text-ink-soft hover:text-ink"
        >
          {t('deleteCancel')}
        </button>
      </div>
    </div>
  );
}
