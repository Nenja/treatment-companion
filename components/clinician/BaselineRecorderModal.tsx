'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import {
  GoalVideoRecorder,
  type RecordedVideo
} from '@/components/wizard/GoalVideoRecorder';
import {
  useGoalVideoUrl,
  useDeleteGoalBaselineVideo,
  useArchiveGoalVideo
} from '@/lib/supabase/goalVideo';
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
  consentClinical,
  onBack,
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
  /** Patient-level clinical video consent. Filming is blocked until this is on
   *  file; an existing baseline can still be viewed/deleted without it. */
  consentClinical: boolean;
  /** When opened from the per-goal Video overview, returns to it. */
  onBack?: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.baseline');
  const tA11y = useTranslations('a11y');
  const toast = useToast();
  const containerRef = useModalA11y(onClose);
  const setBaseline = useSetGoalBaselineVideo();
  const deleteBaseline = useDeleteGoalBaselineVideo();
  const archiveBaseline = useArchiveGoalVideo();

  const [reRecording, setReRecording] = useState(existingPath == null);
  const [clip, setClip] = useState<RecordedVideo | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

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
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1 text-[13px] font-semibold text-sage-deep hover:text-ink"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                {tA11y('back')}
              </button>
            )}
            <span className="eyebrow">{t('title')}</span>
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setClip(null);
                    setReRecording(true);
                  }}
                  className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
                >
                  {t('reRecord')}
                </button>
                {consentClinical && (
                  <button
                    type="button"
                    disabled={archiveBaseline.isPending}
                    onClick={async () => {
                      try {
                        await archiveBaseline.mutateAsync({
                          approvedGoalId: goalId,
                          source: 'baseline'
                        });
                        onClose();
                      } catch {
                        /* leave open to retry */
                      }
                    }}
                    className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink disabled:opacity-50"
                  >
                    {t('archiveCta')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-amber-deep px-4 py-2 text-[14px] font-semibold text-amber-deep hover:bg-amber-deep hover:text-on-accent"
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
                  {t('deleteCta')}
                </button>
              </div>
              {confirmingDelete && existingPath && (
                <div className="rounded-[var(--radius-button)] border border-stone bg-cream p-3">
                  <p className="text-[13px] text-ink-soft">{t('deleteConfirm')}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      disabled={deleteBaseline.isPending}
                      onClick={async () => {
                        try {
                          await deleteBaseline.mutateAsync({
                            goalId,
                            path: existingPath
                          });
                          onClose();
                        } catch {
                          /* leave the dialog open so the clinician can retry */
                        }
                      }}
                      className="rounded-[var(--radius-button)] bg-amber-deep px-4 py-2 text-[13px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
                    >
                      {deleteBaseline.isPending
                        ? t('deleting')
                        : t('deleteConfirmCta')}
                    </button>
                    <button
                      type="button"
                      disabled={deleteBaseline.isPending}
                      onClick={() => setConfirmingDelete(false)}
                      className="text-[13px] font-semibold text-ink-soft hover:text-ink"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : !consentClinical ? (
            <div className="rounded-[var(--radius-button)] border border-amber-deep bg-cream-soft p-4">
              <p className="text-[14px] font-semibold text-ink">
                {t('consentGateTitle')}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                {t('consentGateBody')}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-3 rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                {t('consentGateClose')}
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
