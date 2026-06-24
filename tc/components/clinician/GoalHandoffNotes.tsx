'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useGoalHandoffNotes,
  useSetGoalHandoffNote
} from '@/lib/supabase/clinicianPatient';

interface GoalHandoffNotesProps {
  cycleId: string;
  /** Goals a therapist has engaged with — the only ones that get a note input,
   *  matching the rule that therapist modules activate per goal on evaluation. */
  goals: { id: string; text: string }[];
}

/**
 * Optional, short, goal-specific notes the physician leaves for the weekly
 * therapist (e.g. "raised dose for this goal — push range"). Written by the
 * physician; readable by the therapist and by the patient themselves (patient
 * self-read added in migration 0096). Each note
 * saves on blur when it changes; an emptied note clears the row.
 */
export function GoalHandoffNotes({ cycleId, goals }: GoalHandoffNotesProps) {
  const t = useTranslations('clinician.goalHandoff');
  const notes = useGoalHandoffNotes(cycleId);
  const setNote = useSetGoalHandoffNote();

  if (goals.length === 0) return null;

  return (
    <div className="mt-4 border-t border-sage-soft pt-3">
      <p className="text-[14px] font-semibold text-ink">{t('heading')}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{t('hint')}</p>
      <div className="mt-3 space-y-3">
        {goals.map((g) => (
          <GoalNoteField
            key={g.id}
            label={g.text}
            initial={notes.data?.get(g.id) ?? ''}
            ready={!notes.isLoading}
            placeholder={t('placeholder')}
            onCommit={(value) => {
              setNote.mutate({ cycleId, goalId: g.id, note: value });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function GoalNoteField({
  label,
  initial,
  ready,
  placeholder,
  onCommit
}: {
  label: string;
  initial: string;
  ready: boolean;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);

  // Seed once the fetched note arrives (the field mounts before the query
  // resolves); don't clobber edits in progress.
  useEffect(() => {
    if (ready) setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, initial]);

  return (
    <div>
      <label className="block text-[13px] font-medium text-ink-soft">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (value.trim() !== initial.trim()) onCommit(value);
        }}
        rows={2}
        maxLength={1000}
        placeholder={placeholder}
        className="mt-1 w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none"
      />
    </div>
  );
}
