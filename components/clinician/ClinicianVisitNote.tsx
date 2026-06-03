'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSetCycleClinicianNote } from '@/lib/supabase/clinicianPatient';
import { useToast } from '@/components/feedback/Toast';

interface ClinicianVisitNoteProps {
  cycleId: string;
  note: string | null;
}

/**
 * A free-text clinician note for the current cycle ("since last visit").
 * Read view shows the note (or an empty hint) with an Edit/Add button; edit
 * view is a textarea + Save/Cancel. Saved via the cycle-note RPC.
 */
export function ClinicianVisitNote({ cycleId, note }: ClinicianVisitNoteProps) {
  const t = useTranslations('visitNote');
  const toast = useToast();
  const save = useSetCycleClinicianNote();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note ?? '');

  const begin = () => {
    setDraft(note ?? '');
    setEditing(true);
  };

  const onSave = async () => {
    try {
      await save.mutateAsync({ cycleId, note: draft });
      setEditing(false);
      toast.success(t('saved'));
    } catch {
      toast.error(t('saveError'));
    }
  };

  return (
    <section className="mt-10 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[18px] leading-tight text-ink">
          {t('title')}
        </h2>
        {!editing && (
          <button
            type="button"
            onClick={begin}
            className="shrink-0 rounded-[var(--radius-button)] border border-sage/50 bg-cream-soft px-3 py-2 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
          >
            {note ? t('edit') : t('add')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('placeholder')}
            rows={4}
            className="w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted focus:border-focus focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={save.isPending}
              className="rounded-[var(--radius-button)] bg-sage-deep px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-60"
            >
              {t('save')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      ) : note ? (
        <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
          {note}
        </p>
      ) : (
        <p className="mt-3 text-[14px] text-ink-muted">{t('empty')}</p>
      )}
    </section>
  );
}
