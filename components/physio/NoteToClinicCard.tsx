'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  useTherapistNotes,
  useSubmitTherapistNote
} from '@/lib/supabase/therapistNote';

/**
 * The therapist's single free-text note channel to the clinic.
 *
 * Zero ceremony: a box and a Send, any length the therapist chooses,
 * sent immediately. Patient-invisible (therapist_note has no patient RLS,
 * migration 0095). Muscle concerns live here as prose now that the
 * structured muscle-flag form is retired. Sent notes carry a receipt:
 * "Delivered" the instant they store, upgrading to "Seen · <time>" once a
 * physician opens the patient's notes (no name shown, per spec).
 */
function relativeTime(locale: string, iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'da' ? 'da' : 'en', {
    numeric: 'auto'
  });
  if (mins < 1) return rtf.format(0, 'minute');
  if (mins < 60) return rtf.format(-mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours < 24) return rtf.format(-hours, 'hour');
  return rtf.format(-Math.round(hours / 24), 'day');
}

export function NoteToClinicCard({ patientId }: { patientId: string }) {
  const t = useTranslations('therapistNote');
  const locale = useLocale();
  const notes = useTherapistNotes(patientId, true);
  const submit = useSubmitTherapistNote();
  const [body, setBody] = useState('');
  const [error, setError] = useState(false);

  const canSend = body.trim().length > 0 && !submit.isPending;

  const onSend = async () => {
    if (!canSend) return;
    setError(false);
    try {
      await submit.mutateAsync({ patientId, body: body.trim() });
      setBody('');
    } catch {
      setError(true);
    }
  };

  return (
    <section className="mt-10 border-t border-stone/70 pt-7">
      <p className="eyebrow">{t('title')}</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        {t('helper')}
      </p>

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={5000}
        rows={3}
        placeholder={t('placeholder')}
        className="mt-3 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream px-3 py-2.5 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-3">
        {error && <p className="text-[13px] text-amber-deep">{t('error')}</p>}
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="ml-auto flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
        >
          {submit.isPending ? t('sending') : t('send')}
        </button>
      </div>

      {(notes.data ?? []).length > 0 && (
        <div className="mt-5">
          <p className="eyebrow">{t('sentHeading')}</p>
          <ul className="mt-2 space-y-2">
            {notes.data!.map((n) => (
              <li
                key={n.id}
                className="rounded-[var(--radius-button)] border border-stone/70 bg-cream-soft px-3 py-2.5"
              >
                <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">
                  {n.body}
                </p>
                <p className="mt-1.5 text-[12px]">
                  {n.seenAt ? (
                    <span className="font-semibold text-sage-deep">
                      {t('seen')} · {relativeTime(locale, n.seenAt)}
                    </span>
                  ) : (
                    <span className="text-ink-muted">{t('delivered')}</span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
