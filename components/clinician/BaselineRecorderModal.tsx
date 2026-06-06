'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import {
  GoalVideoRecorder,
  type RecordedVideo
} from '@/components/wizard/GoalVideoRecorder';
import { useGoalVideoUrl } from '@/lib/supabase/goalVideo';
import {
  uploadBaselineVideo,
  useSetGoalBaselineVideo
} from '@/lib/supabase/clinicianPatient';
import { useToast } from '@/components/feedback/Toast';

/**
 * In-clinic baseline capture for a goal. The clinician records the patient
 * performing the goal's standardized task at the start of the cycle; the
 * clip is stored on the goal and later shown to the patient as a reference
 * when they record the peak-effect video at home.
 *
 * If a baseline already exists it plays back here, with the option to
 * re-record (which overwrites it).
 */
export function BaselineRecorderModal({
  patientId,
  goalId,
  goalText,
  protocol,
  existingPath,
  onClose
}: {
  patientId: string;
  goalId: string;
  goalText: string;
  protocol: {
    instruction: string | null;
    setup: string | null;
    seconds: number | null;
  };
  existingPath: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.baseline');
  const tA11y = useTranslations('a11y');
  const toast = useToast();
  const containerRef = useModalA11y(onClose);
  const setBaseline = useSetGoalBaselineVideo();

  const [reRecording, setReRecording] = useState(existingPath == null);
  const [clip, setClip] = useState<RecordedVideo | null>(null);
  const [saving, setSaving] = useState(false);

  const existing = useGoalVideoUrl(reRecording ? null : existingPath);

  const save = async () => {
    if (!clip) return;
    setSaving(true);
    try {
      const path = await uploadBaselineVideo({
        patientId,
        goalId,
        blob: clip.blob,
        ext: clip.ext
      });
      await setBaseline.mutateAsync({ goalId, path });
      toast.success(t('saved'));
      onClose();
    } catch {
      toast.error(t('error'));
      setSaving(false);
    }
  };

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
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-4 px-5 py-5">
          <div>
            <p className="text-[15px] font-semibold text-ink">{goalText}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
              {t('intro')}
            </p>
          </div>

          {!reRecording && existingPath ? (
            <div className="flex flex-col gap-3">
              <p className="text-[14px] font-semibold text-sage-deep">
                {t('existing')}
              </p>
              {existing.data ? (
                <video
                  src={existing.data}
                  controls
                  playsInline
                  className="w-full rounded-[var(--radius-button)] border border-stone bg-ink/5"
                />
              ) : (
                <p className="text-[13px] text-ink-muted">{t('loading')}</p>
              )}
              <button
                type="button"
                onClick={() => {
                  setClip(null);
                  setReRecording(true);
                }}
                className="self-start rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
              >
                {t('reRecord')}
              </button>
            </div>
          ) : (
            <>
              <GoalVideoRecorder
                value={clip}
                onChange={setClip}
                protocol={protocol}
              />
              <div className="flex justify-end gap-2">
                {existingPath && (
                  <button
                    type="button"
                    onClick={() => {
                      setClip(null);
                      setReRecording(false);
                    }}
                    className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
                  >
                    {t('cancel')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={save}
                  disabled={!clip || saving}
                  className="rounded-[var(--radius-button)] bg-sage-deep px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
                >
                  {saving ? t('saving') : t('save')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
