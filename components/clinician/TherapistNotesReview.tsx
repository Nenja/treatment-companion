'use client';

import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import {
  useTherapistNotes,
  useMarkTherapistNotesSeen
} from '@/lib/supabase/therapistNote';

/**
 * The physician's view of the therapist's free-text notes for this
 * patient — the upward channel landing in the clinic. Renders nothing
 * when there are no notes (no empty card). On open, any unseen notes are
 * marked seen once, which flips the therapist's receipt to "Seen · time"
 * (no name shown to the therapist; seen_by is audit-only). Read-only:
 * the physician acts on what they read, they don't reply here.
 */
export function TherapistNotesReview({ patientId }: { patientId: string }) {
  const t = useTranslations('therapistNote');
  const locale = useLocale();
  const notes = useTherapistNotes(patientId, true);
  const markSeen = useMarkTherapistNotesSeen();
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    const list = notes.data;
    if (!list) return;
    if (list.some((n) => !n.seenAt)) {
      marked.current = true;
      markSeen.mutate(patientId);
    }
  }, [notes.data, patientId, markSeen]);

  const list = notes.data ?? [];
  if (list.length === 0) return null;

  return (
    <section className="mt-4 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <h2 className="font-display text-[18px] leading-tight text-ink">
        {t('reviewHeading')}
      </h2>
      <ul className="mt-3 space-y-2.5">
        {list.map((n) => (
          <li
            key={n.id}
            className="rounded-r-[var(--radius-button)] border-l-2 border-sage/50 bg-cream px-3 py-2"
          >
            <div className="text-[11px] text-ink-muted">
              {formatLongDate(n.createdAt, locale)}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
              {n.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
