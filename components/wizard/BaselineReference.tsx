'use client';

import { useTranslations } from 'next-intl';
import { useGoalVideoUrl } from '@/lib/supabase/goalVideo';

/**
 * Shown to the patient when recording the peak-effect video at check-in:
 * plays back the in-clinic baseline clip so they reproduce the same task.
 * The patient has read access to their own goal-videos folder (0062), so
 * the signed URL resolves from their own session.
 */
export function BaselineReference({ path }: { path: string }) {
  const t = useTranslations('patient.checkin');
  const { data } = useGoalVideoUrl(path);
  return (
    <div className="mb-4 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3">
      <p className="text-[13px] font-semibold text-ink">
        {t('baselineRefTitle')}
      </p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
        {t('baselineRefHint')}
      </p>
      {data && (
        <video
          src={data}
          controls
          playsInline
          className="mt-2 w-full rounded-[var(--radius-button)] border border-stone bg-ink/5"
        />
      )}
    </div>
  );
}
