'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import { usePatientCareTeamNotes } from '@/lib/supabase/careTeamNotes';

/**
 * Quiet, read-only window for the patient into the three care-team note
 * channels (physician per-cycle + per-goal notes, therapist → clinic note).
 * Collapsed by default and hidden entirely when there are no notes — present
 * for a patient who goes looking, invisible to everyone else. Notes are shown
 * verbatim; the patient cannot reply or edit.
 */
export function CareTeamNotes() {
  const t = useTranslations('careTeamNotes');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const { data } = usePatientCareTeamNotes();
  const notes = data ?? [];
  if (notes.length === 0) return null;

  return (
    <section className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 py-1 text-left text-ink-soft"
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="shrink-0 text-ink-muted"
        >
          <path d="M4 5h16M4 12h16M4 19h10" />
        </svg>
        <span className="flex-1 text-[14px] font-semibold">{t('heading')}</span>
        <span className="rounded-full bg-stone-soft px-2 py-0.5 text-[12px] text-ink-muted">
          {notes.length}
        </span>
        <span
          aria-hidden
          className={`text-[13px] text-ink-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="mt-3">
          <p className="mb-4 max-w-prose text-[12.5px] leading-relaxed text-ink-muted">
            {t('intro')}
          </p>
          <ul className="space-y-4">
            {notes.map((n) => {
              const isPhysician = n.kind !== 'therapist';
              return (
                <li
                  key={n.id}
                  className={`border-l-2 pl-3 ${
                    isPhysician ? 'border-sage/60' : 'border-amber-deep/50'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="text-[13px] font-semibold text-ink">
                      {isPhysician
                        ? t('authorPhysician')
                        : t('authorTherapist')}
                    </span>
                    <span className="text-[12px] text-ink-muted">
                      {formatLongDate(n.date, locale)}
                    </span>
                    {n.kind === 'physicianCycle' && n.treatmentChanged && (
                      <span className="rounded-full border border-amber-soft bg-amber-soft/30 px-2 py-0.5 text-[11px] text-amber-deep">
                        {t('treatmentChanged')}
                      </span>
                    )}
                    {n.kind === 'physicianGoal' && n.goalText && (
                      <span className="rounded-full border border-stone px-2 py-0.5 text-[11px] text-ink-muted">
                        {t('goalContext', { goal: n.goalText })}
                      </span>
                    )}
                  </div>
                  {n.text && (
                    <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
                      {n.text}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
