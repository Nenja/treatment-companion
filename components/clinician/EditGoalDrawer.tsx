'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';
import { useEditGoal } from '@/lib/supabase/clinicianPatient';
import type { ClinicianPatientGoal } from '@/lib/supabase/clinicianPatient';

const inputClasses =
  'mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none';

/**
 * Recalibrate a goal at a visit. Editing creates a NEW version of the goal
 * (server-side `edit_goal`) in the active cycle and freezes the previous one,
 * so past ratings stay bound to the calibration they were made under. Only
 * wording and calibration are edited here; video protocol and therapy tag
 * carry forward unchanged.
 */
export function EditGoalDrawer({
  goal,
  onClose
}: {
  goal: ClinicianPatientGoal;
  onClose: () => void;
}) {
  const tA11y = useTranslations('a11y');
  const t = useTranslations('editGoal');
  const containerRef = useModalA11y(onClose);
  const editGoal = useEditGoal();
  const toast = useToast();

  const [patientText, setPatientText] = useState(goal.patientFacingText);
  const [smartText, setSmartText] = useState(goal.smartText);
  // NRS calibration
  const [baseline, setBaseline] = useState(
    goal.nrs?.baselineValue != null ? String(goal.nrs.baselineValue) : ''
  );
  const [target, setTarget] = useState(
    goal.nrs?.targetValue != null ? String(goal.nrs.targetValue) : ''
  );
  // GAS anchors
  const [m2, setM2] = useState(goal.gas?.minus2 ?? '');
  const [m1, setM1] = useState(goal.gas?.minus1 ?? '');
  const [z0, setZ0] = useState(goal.gas?.zero ?? '');
  const [p1, setP1] = useState(goal.gas?.plus1 ?? '');
  const [p2, setP2] = useState(goal.gas?.plus2 ?? '');

  const isGas = goal.kind === 'gas';
  const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));
  const canSave =
    patientText.trim().length > 0 &&
    smartText.trim().length > 0 &&
    (!isGas ||
      [m2, m1, z0, p1, p2].every((a) => a.trim().length > 0)) &&
    !editGoal.isPending;

  const onSave = async () => {
    if (!canSave) return;
    try {
      await editGoal.mutateAsync({
        sourceGoalId: goal.id,
        patientFacingText: patientText.trim(),
        smartText: smartText.trim(),
        ...(isGas
          ? {
              anchorMinus2: m2.trim(),
              anchorMinus1: m1.trim(),
              anchorZero: z0.trim(),
              anchorPlus1: p1.trim(),
              anchorPlus2: p2.trim()
            }
          : {
              nrsBaselineValue: numOrNull(baseline),
              nrsTargetValue: numOrNull(target)
            })
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
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
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
          <h2 className="font-display text-[20px] leading-tight text-ink">
            {t('title')}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            {t('intro', { version: goal.version, next: goal.version + 1 })}
          </p>

          <label className="mt-5 block text-[14px] font-semibold text-ink">
            {t('patientText')}
            <textarea
              value={patientText}
              onChange={(e) => setPatientText(e.target.value)}
              rows={2}
              maxLength={200}
              className={inputClasses}
            />
          </label>

          <label className="mt-4 block text-[14px] font-semibold text-ink">
            {t('smartText')}
            <textarea
              value={smartText}
              onChange={(e) => setSmartText(e.target.value)}
              rows={3}
              maxLength={1000}
              className={inputClasses}
            />
          </label>

          {isGas ? (
            <fieldset className="mt-5">
              <legend className="text-[14px] font-semibold text-ink">
                {t('anchorsLegend')}
              </legend>
              {(
                [
                  ['anchorPlus2', p2, setP2],
                  ['anchorPlus1', p1, setP1],
                  ['anchorZero', z0, setZ0],
                  ['anchorMinus1', m1, setM1],
                  ['anchorMinus2', m2, setM2]
                ] as const
              ).map(([key, val, setter]) => (
                <label
                  key={key}
                  className="mt-3 block text-[13px] font-medium text-ink-soft"
                >
                  {t(key)}
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    maxLength={300}
                    className={inputClasses}
                  />
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-4">
              <label className="block text-[14px] font-semibold text-ink">
                {t('baseline')}
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value)}
                  className={inputClasses}
                />
              </label>
              <label className="block text-[14px] font-semibold text-ink">
                {t('target')}
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className={inputClasses}
                />
              </label>
            </div>
          )}

          <p className="mt-5 rounded-[var(--radius-button)] border border-stone/70 bg-cream-soft px-3 py-2.5 text-[13px] leading-relaxed text-ink-muted">
            {t('carryForwardNote')}
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
              onClick={onSave}
              disabled={!canSave}
              className="h-12 flex-1 rounded-[var(--radius-button)] bg-sage-deep text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              {editGoal.isPending ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
