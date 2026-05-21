'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useStartNewCycle } from '@/lib/supabase/clinicianPatient';
import { todayIso } from '@/lib/dates';
import { useToast } from '@/components/feedback/Toast';
import { classifyError } from '@/lib/feedback';

interface NewCycleDialogProps {
  patientId: string;
  onClose: () => void;
}

/**
 * Modal dialog asking the clinician to pick the date of the new
 * treatment injection. Calling the RPC:
 *   - closes the patient's currently-active cycle (status → completed)
 *   - creates a new active cycle whose start_date is the picked date
 *   - seeds 16 weekly prompts on the new cycle
 * Then navigates to /clinician/treatment, where the form is empty —
 * the clinician records the new treatment from scratch, or uses
 * "Copy from previous" inside the form.
 */
export function NewCycleDialog({ patientId, onClose }: NewCycleDialogProps) {
  const router = useRouter();
  const locale = useLocale();
  const startNewCycle = useStartNewCycle();
  const [date, setDate] = useState(todayIso());
  const toast = useToast();
  const tFeedback = useTranslations('feedback');

  const onConfirm = async () => {
    if (!date) {
      toast.error(tFeedback('errorInvalidInput'));
      return;
    }
    try {
      await startNewCycle.mutateAsync({
        patientId,
        treatmentDate: date
      });
      toast.success(tFeedback('successCycleStarted'));
      onClose();
      // Navigate to treatment record form for the new cycle.
      router.push(
        locale === 'en' ? '/clinician/treatment' : `/${locale}/clinician/treatment`
      );
    } catch (err) {
      const key = classifyError(err);
      toast.error(tFeedback(key));
      if (key === 'errorClinicianUnlockExpired') {
        onClose();
        setTimeout(() => {
          router.push(
            locale === 'en' ? '/clinician' : `/${locale}/clinician`
          );
        }, 1500);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl">
        <h2 className="font-display text-[20px] leading-tight text-ink">
          Start a new treatment cycle
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          This closes the current cycle and creates a new one with the
          treatment date you choose. The current cycle&apos;s data is
          preserved.
        </p>

        <label className="mt-5 block text-[13px] font-semibold text-ink">
          Date of treatment
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none"
        />

        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={startNewCycle.isPending}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone"
          >
            {startNewCycle.isPending ? '…' : 'Start new cycle'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={startNewCycle.isPending}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
