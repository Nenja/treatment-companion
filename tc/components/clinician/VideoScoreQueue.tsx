'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { useGoalVideoUrl } from '@/lib/supabase/goalVideo';
import {
  useSetClinicVideoScore,
  useSetClinicVideoNrs,
  type GasAnchors
} from '@/lib/supabase/clinicianPatient';
import { useToast } from '@/components/feedback/Toast';

export interface ScoreQueueItem {
  ratingId: string;
  goalText: string;
  kind: 'nrs' | 'gas';
  anchors: GasAnchors | null;
  nrsQuestion: string | null;
  peakPath: string;
  baselinePath: string | null;
  weekNumber: number;
}

const GAS_LEVELS: Array<{ v: number; key: string; anchor: keyof GasAnchors }> = [
  { v: 2, key: 'muchBetter', anchor: 'plus2' },
  { v: 1, key: 'better', anchor: 'plus1' },
  { v: 0, key: 'asExpected', anchor: 'zero' },
  { v: -1, key: 'less', anchor: 'minus1' },
  { v: -2, key: 'muchLess', anchor: 'minus2' }
];

/**
 * Walks the clinician through the unscored peak-effect clips, one at a time.
 * Each shows the clip beside the goal's baseline (when one exists), the score
 * control (GAS anchors −2..+2, or the patient's 0–10 question for NRS), an
 * "unusable" escape, and auto-advances. The clip and baseline are the same
 * standardized task, so judging change is a direct before/after.
 */
export function VideoScoreQueue({
  items,
  onClose
}: {
  items: ScoreQueueItem[];
  onClose: () => void;
}) {
  const t = useTranslations('clinician.videoQueue');
  const tv = useTranslations('clinician.video');
  const containerRef = useModalA11y(onClose);
  const toast = useToast();
  const setGas = useSetClinicVideoScore();
  const setNrs = useSetClinicVideoNrs();

  const [index, setIndex] = useState(0);
  const [rating, setRating] = useState<number | null>(null);
  const [unusable, setUnusable] = useState(false);
  const [saving, setSaving] = useState(false);

  const item = items[index];
  const last = index >= items.length - 1;

  const reset = () => {
    setRating(null);
    setUnusable(false);
  };
  const advance = () => {
    if (last) {
      onClose();
    } else {
      setIndex((i) => i + 1);
      reset();
    }
  };

  const canSave = !saving && (unusable || rating !== null);

  const saveAndNext = async () => {
    if (!item || !canSave) return;
    setSaving(true);
    try {
      if (item.kind === 'gas') {
        await setGas.mutateAsync({
          ratingId: item.ratingId,
          rating: unusable ? null : rating,
          unusable
        });
      } else {
        await setNrs.mutateAsync({
          ratingId: item.ratingId,
          nrs: unusable ? null : rating,
          unusable
        });
      }
      setSaving(false);
      advance();
    } catch {
      toast.error(tv('error'));
      setSaving(false);
    }
  };

  if (!item) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="flex max-h-[92dvh] w-full max-w-[var(--max-w-page-mid)] flex-col overflow-y-auto rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone/70 px-5 py-3">
          <div>
            <span className="eyebrow block">{t('title')}</span>
            <span className="text-[12px] text-ink-muted">
              {t('progress', { n: index + 1, total: items.length })}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('done')}
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <p className="text-[15px] font-semibold text-ink">
            {item.goalText}{' '}
            <span className="text-[13px] font-normal text-ink-muted">
              · {t('week', { week: item.weekNumber })}
            </span>
          </p>

          <ClipPair
            key={item.ratingId}
            peakPath={item.peakPath}
            baselinePath={item.baselinePath}
            thisVisitLabel={t('thisVisit')}
            baselineLabel={t('baseline')}
            noBaselineLabel={t('noBaseline')}
          />

          {item.kind === 'gas' ? (
            <div className="space-y-1.5">
              {GAS_LEVELS.map((lvl) => {
                const selected = !unusable && rating === lvl.v;
                const anchorText = item.anchors
                  ? item.anchors[lvl.anchor]
                  : null;
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
                      <span className="mr-1 font-semibold text-ink">
                        {tv(`score.level.${lvl.key}`)}
                        {anchorText ? ':' : ''}
                      </span>
                      {anchorText}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div>
              {item.nrsQuestion && (
                <p className="mb-2 text-[13px] text-ink-soft">
                  {item.nrsQuestion}
                </p>
              )}
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11">
                {Array.from({ length: 11 }, (_, n) => {
                  const selected = !unusable && rating === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setRating(n);
                        setUnusable(false);
                      }}
                      className={`flex h-11 items-center justify-center rounded-[var(--radius-button)] border text-[15px] font-semibold tabular-nums ${
                        selected
                          ? 'border-sage bg-sage-deep text-on-accent'
                          : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            aria-pressed={unusable}
            onClick={() => {
              setUnusable((u) => !u);
              if (!unusable) setRating(null);
            }}
            className={`flex w-full items-center justify-between rounded-[var(--radius-button)] border px-3 py-2 text-[13px] font-semibold ${
              unusable
                ? 'border-amber-deep bg-amber-soft text-amber-deep'
                : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
            }`}
          >
            <span>{tv('score.unusable')}</span>
            <span className="text-[11px] font-normal text-ink-muted">
              {tv('score.unusableHint')}
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone/70 px-5 py-3">
          <button
            type="button"
            onClick={advance}
            className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('skip')}
          </button>
          <button
            type="button"
            onClick={saveAndNext}
            disabled={!canSave}
            className="rounded-[var(--radius-button)] bg-sage-deep px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
          >
            {saving ? t('saving') : last ? t('saveDone') : t('saveNext')}
          </button>
        </div>
      </div>
    </div>
  );
}

function ClipPair({
  peakPath,
  baselinePath,
  thisVisitLabel,
  baselineLabel,
  noBaselineLabel
}: {
  peakPath: string;
  baselinePath: string | null;
  thisVisitLabel: string;
  baselineLabel: string;
  noBaselineLabel: string;
}) {
  const peak = useGoalVideoUrl(peakPath);
  const baseline = useGoalVideoUrl(baselinePath);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-1 text-[12px] font-semibold text-ink-soft">
          {thisVisitLabel}
        </p>
        {peak.data ? (
          <video
            src={peak.data}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-[var(--radius-button)] bg-ink"
          />
        ) : (
          <div className="aspect-video w-full rounded-[var(--radius-button)] bg-ink/10" />
        )}
      </div>
      <div>
        <p className="mb-1 text-[12px] font-semibold text-ink-soft">
          {baselineLabel}
        </p>
        {baselinePath && baseline.data ? (
          <video
            src={baseline.data}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-[var(--radius-button)] bg-ink"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-[var(--radius-button)] border border-dashed border-stone bg-cream-soft px-3 text-center text-[12px] text-ink-muted">
            {noBaselineLabel}
          </div>
        )}
      </div>
    </div>
  );
}
