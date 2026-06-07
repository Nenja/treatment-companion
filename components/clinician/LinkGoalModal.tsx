'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import { useLinkGoalToLineage } from '@/lib/supabase/clinicianPatient';
import type { ClinicianPatientGoal } from '@/lib/supabase/clinicianPatient';

/**
 * Correction action: link THIS goal as the newest version of another goal's
 * lineage, for when a continuation was accidentally started as a separate
 * goal. Candidates are the patient's other live goals of the same measurement
 * kind. The chosen target's current version is frozen and this goal becomes
 * the live version of the merged lineage.
 */
export function LinkGoalModal({
  sourceGoal,
  candidates,
  onClose
}: {
  sourceGoal: ClinicianPatientGoal;
  candidates: ClinicianPatientGoal[];
  onClose: () => void;
}) {
  const tA11y = useTranslations('a11y');
  const t = useTranslations('linkGoal');
  const containerRef = useModalA11y(onClose);
  const link = useLinkGoalToLineage();
  const toast = useToast();
  const [targetId, setTargetId] = useState<string | null>(null);

  const onConfirm = async () => {
    if (!targetId) return;
    try {
      await link.mutateAsync({
        sourceGoalId: sourceGoal.id,
        targetGoalId: targetId
      });
      toast.success(t('saved'));
      onClose();
    } catch (err) {
      toast.error(
        classifyError(err) === 'errorGeneric' ? t('error') : t('errorShort')
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="flex max-h-[85vh] w-full max-w-[520px] flex-col rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone/70 px-5 py-3">
          <span className="eyebrow">{t('eyebrow')}</span>
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
          <h2 className="font-display text-[19px] leading-tight text-ink">
            {t('title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            {t('intro', { goal: sourceGoal.patientFacingText })}
          </p>

          {candidates.length === 0 ? (
            <p className="mt-5 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-3 text-[14px] text-ink-muted">
              {t('noCandidates')}
            </p>
          ) : (
            <ul className="mt-5 space-y-2">
              {candidates.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setTargetId(c.id)}
                    className={`flex w-full items-center gap-3 rounded-[var(--radius-button)] border px-3 py-2.5 text-left text-[14px] ${
                      targetId === c.id
                        ? 'border-sage-deep bg-sage-soft text-ink'
                        : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        targetId === c.id
                          ? 'border-sage-deep bg-sage-deep'
                          : 'border-stone'
                      }`}
                    >
                      {targetId === c.id && (
                        <span className="h-1.5 w-1.5 rounded-full bg-on-accent" />
                      )}
                    </span>
                    <span className="font-medium leading-snug">
                      {c.patientFacingText}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
            {t('note')}
          </p>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="h-12 flex-1 rounded-[var(--radius-button)] border border-stone bg-cream text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!targetId || link.isPending}
              className="h-12 flex-1 rounded-[var(--radius-button)] bg-sage-deep text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {link.isPending ? t('saving') : t('confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
