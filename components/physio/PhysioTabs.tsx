'use client';

import { useState } from 'react';
import { PhysioProgressForm } from '@/components/physio/PhysioProgressForm';
import { PhysioGoalSuggestionForm } from '@/components/physio/PhysioGoalSuggestionForm';
import { PhysioMuscleSuggestionForm } from '@/components/physio/PhysioMuscleSuggestionForm';
import type { PhysioPatientData } from '@/lib/supabase/physioPatient';

type Tab = 'progress' | 'goal' | 'muscle';

interface PhysioTabsProps {
  patientId: string;
  goals: PhysioPatientData['goals'];
}

/**
 * Tab bar for the three physiotherapist tasks on a patient.
 *
 * Before this, the three forms (progress, goal suggestion, muscle
 * suggestion) were stacked vertically — a long scroll where reaching
 * the third task meant scrolling past the first two. Tabs put all
 * three tasks one tap away and show only the one in use.
 *
 * "Progress" is the default tab: a physiotherapist reports progress
 * most visits and suggests goals/muscles occasionally.
 *
 * If the patient has no active goals, the Progress tab can't do its
 * job (it needs goals to rate). In that case the tab is disabled and
 * the default falls to "Suggest goal" — the physiotherapist can still
 * suggest the first goal.
 */
export function PhysioTabs({ patientId, goals }: PhysioTabsProps) {
  const hasGoals = goals.length > 0;
  const [tab, setTab] = useState<Tab>(hasGoals ? 'progress' : 'goal');

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: 'progress', label: 'Progress', disabled: !hasGoals },
    { id: 'goal', label: 'Suggest goal' },
    { id: 'muscle', label: 'Suggest muscle' }
  ];

  return (
    <div className="mt-8">
      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Physiotherapist tasks"
        className="flex gap-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-1"
      >
        {tabs.map((tdef) => {
          const selected = tab === tdef.id;
          return (
            <button
              key={tdef.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={tdef.disabled}
              onClick={() => setTab(tdef.id)}
              className={`flex h-11 flex-1 items-center justify-center rounded-[calc(var(--radius-button)-2px)] px-2 text-[14px] font-semibold ${
                selected
                  ? 'bg-sage-deep text-cream-soft'
                  : tdef.disabled
                    ? 'cursor-not-allowed text-ink-muted'
                    : 'text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {tdef.label}
            </button>
          );
        })}
      </div>

      {/* Disabled-progress hint — explains why a physiotherapist with a
          goalless patient can't report progress yet. */}
      {!hasGoals && (
        <p className="mt-2 text-[13px] text-ink-muted">
          Progress reporting becomes available once the patient has
          approved goals. You can still suggest a goal or muscle below.
        </p>
      )}

      {/* Selected panel */}
      <div role="tabpanel">
        {tab === 'progress' && hasGoals && (
          <PhysioProgressForm patientId={patientId} goals={goals} />
        )}
        {tab === 'goal' && (
          <PhysioGoalSuggestionForm patientId={patientId} />
        )}
        {tab === 'muscle' && (
          <PhysioMuscleSuggestionForm
            patientId={patientId}
            goals={goals}
          />
        )}
      </div>
    </div>
  );
}
