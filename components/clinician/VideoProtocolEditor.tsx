'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import {
  useSetGoalVideoEnabled,
  useSetGoalVideoProtocol
} from '@/lib/supabase/clinicianPatient';

/**
 * Edit the check-in video request + standardized task protocol for an
 * existing goal. (Previously these could only be set when the goal was
 * created.) Toggles video on/off and edits the recipe shown at record time.
 */
export function VideoProtocolEditor({
  goalId,
  goalText,
  initialEnabled,
  initialInstruction,
  initialSetup,
  initialSeconds,
  onClose
}: {
  goalId: string;
  goalText: string;
  initialEnabled: boolean;
  initialInstruction: string | null;
  initialSetup: string | null;
  initialSeconds: number | null;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.videoProtocol');
  const containerRef = useModalA11y(onClose);
  const setEnabled = useSetGoalVideoEnabled();
  const setProtocol = useSetGoalVideoProtocol();

  const [enabled, setEnabledState] = useState(initialEnabled);
  const [instruction, setInstruction] = useState(initialInstruction ?? '');
  const [setup, setSetup] = useState(initialSetup ?? '');
  const [seconds, setSeconds] = useState(
    initialSeconds != null ? String(initialSeconds) : ''
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (enabled !== initialEnabled) {
        await setEnabled.mutateAsync({ goalId, enabled });
      }
      if (enabled) {
        const secs = seconds.trim()
          ? Math.min(30, Math.max(3, Math.round(Number(seconds))))
          : null;
        await setProtocol.mutateAsync({
          goalId,
          instruction,
          setup,
          seconds: Number.isFinite(secs as number) ? secs : null
        });
      }
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const inputClass =
    'mt-1 w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink';
  const labelClass = 'text-[13px] font-semibold text-ink-soft';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-[var(--max-w-page-narrow)] overflow-y-auto rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
      >
        <h2 className="font-display text-[18px] leading-tight text-ink">
          {t('title')}
        </h2>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {goalText}
        </p>

        <label className="mt-4 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabledState(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#3f5a4b]"
          />
          <span>
            <span className="block text-[15px] font-semibold text-ink">
              {t('enable')}
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-muted">
              {t('enableHint')}
            </span>
          </span>
        </label>

        {enabled && (
          <div className="mt-4 space-y-3 border-t border-stone pt-4">
            <p className="text-[13px] leading-relaxed text-ink-soft">
              {t('hint')}
            </p>
            <div>
              <label className={labelClass}>{t('instructionLabel')}</label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder={t('instructionPlaceholder')}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('setupLabel')}</label>
              <textarea
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
                rows={2}
                placeholder={t('setupPlaceholder')}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('secondsLabel')}</label>
              <input
                type="number"
                min={3}
                max={30}
                value={seconds}
                onChange={(e) => setSeconds(e.target.value)}
                placeholder="10"
                className="mt-1 w-28 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink"
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-[var(--radius-button)] bg-sage-deep px-5 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
          >
            {saving ? t('saving') : t('save')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
