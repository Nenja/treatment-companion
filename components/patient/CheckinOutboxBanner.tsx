'use client';

import { useTranslations } from 'next-intl';
import { useCheckinOutbox } from '@/lib/useCheckinOutbox';

/**
 * Mounts the outbox flusher (so queued check-ins replay whenever the patient
 * is in the app and the connection returns) and shows a quiet status line
 * while any are still waiting. Renders nothing when the queue is empty.
 */
export function CheckinOutboxBanner() {
  const t = useTranslations('offline');
  const { pending } = useCheckinOutbox();
  if (pending <= 0) return null;
  return (
    <div
      role="status"
      className="mb-4 rounded-[var(--radius-card)] border border-amber-deep/40 bg-amber-deep/10 px-4 py-2.5 text-[13px] leading-relaxed text-ink-soft"
    >
      {t('pendingCheckins', { count: pending })}
    </div>
  );
}
