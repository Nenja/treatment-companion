'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSetPhysioPlan } from '@/lib/supabase/physioPatient';
import { useToast } from '@/components/feedback/Toast';

/**
 * Therapist-editable, per-patient free-text fields: the exercise plan
 * and the assistive devices in use. Persists across cycles. Collapsed
 * to a summary by default; expands into an edit form. Visible to the
 * physician read-only elsewhere (the clinician page).
 */
export function PhysioPlanSection({
  patientId,
  exercisePlan,
  assistiveDevices
}: {
  patientId: string;
  exercisePlan: string | null;
  assistiveDevices: string | null;
}) {
  const t = useTranslations('physioPlan');
  const toast = useToast();
  const save = useSetPhysioPlan();

  const [editing, setEditing] = useState(false);
  const [plan, setPlan] = useState(exercisePlan ?? '');
  const [devices, setDevices] = useState(assistiveDevices ?? '');

  const onSave = () => {
    save.mutate(
      {
        patientId,
        exercisePlan: plan,
        assistiveDevices: devices
      },
      {
        onSuccess: () => {
          toast.success(t('saved'));
          setEditing(false);
        },
        onError: () => toast.error(t('saveError'))
      }
    );
  };

  const onCancel = () => {
    setPlan(exercisePlan ?? '');
    setDevices(assistiveDevices ?? '');
    setEditing(false);
  };

  return (
    <section className="mt-8 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-[18px] text-ink">{t('title')}</h2>
          <p className="mt-0.5 text-[12px] text-ink-muted">
            {t('audienceHelper')}
          </p>
        </div>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[14px] font-semibold text-sage-deep hover:bg-stone-soft"
          >
            {t('edit')}
          </button>
        )}
      </div>

      {!editing ? (
        <div className="mt-3 space-y-3">
          <div>
            <div className="eyebrow">{t('exerciseLabel')}</div>
            <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
              {exercisePlan?.trim() ? exercisePlan : t('empty')}
            </p>
          </div>
          <div>
            <div className="eyebrow">{t('devicesLabel')}</div>
            <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
              {assistiveDevices?.trim() ? assistiveDevices : t('empty')}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div>
            <label className="block text-[14px] font-semibold text-ink">
              {t('exerciseLabel')}
            </label>
            <textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={t('exercisePlaceholder')}
              className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[14px] font-semibold text-ink">
              {t('devicesLabel')}
            </label>
            <textarea
              value={devices}
              onChange={(e) => setDevices(e.target.value)}
              rows={3}
              maxLength={4000}
              placeholder={t('devicesPlaceholder')}
              className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={save.isPending}
              className="rounded-[var(--radius-button)] bg-sage-deep px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
            >
              {save.isPending ? '…' : t('save')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={save.isPending}
              className="rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
