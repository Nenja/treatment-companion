'use client';

import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { RecordGoalForm } from './RecordGoalForm';

/**
 * Slide-over that hosts <RecordGoalForm/> over the patient page, so a
 * clinician can record a goal the patient voiced without leaving the
 * chart. The patient's goal list stays mounted behind the overlay and
 * refreshes on its own when the goal is recorded (the create mutations
 * invalidate ['clinicianPatient']), so onClose is all the caller needs.
 */
export function RecordGoalDrawer({
  patientId,
  onClose,
  therapy = 'bont'
}: {
  patientId: string;
  onClose: () => void;
  therapy?: 'bont' | 'itb';
}) {
  const tA11y = useTranslations('a11y');
  const t = useTranslations('newGoal');
  const containerRef = useModalA11y(onClose);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('eyebrow')}
        className="flex h-full w-full max-w-[560px] flex-col border-l border-stone bg-cream shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone/70 bg-cream px-5 py-3">
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

        <div className="flex-1 overflow-y-auto px-5 py-6">
          <RecordGoalForm
            patientId={patientId}
            onCancel={onClose}
            onRecorded={onClose}
            therapy={therapy}
          />
        </div>
      </div>
    </div>
  );
}
