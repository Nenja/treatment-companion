'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  emptyCheckinDraft,
  type CheckinDraft
} from './checkinDraft';

// One draft per pending prompt. If the patient starts a check-in for week 5,
// closes the tab, and the dev panel later simulates week 6, the week-5 draft
// stays paired with prompt 5 so resuming hits the right context.
function storageKey(promptId: string): string {
  return `treatment-companion:v1:checkin-draft:${promptId}`;
}

function load(promptId: string): CheckinDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(promptId));
    if (!raw) return null;
    return JSON.parse(raw) as CheckinDraft;
  } catch {
    return null;
  }
}

function save(draft: CheckinDraft): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(draft.weeklyPromptId), JSON.stringify(draft));
  } catch {
    // ignore quota errors etc.
  }
}

function clear(promptId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(promptId));
  } catch {
    // ignore
  }
}

interface UseCheckinDraftArgs {
  patient: { id: string; activeTreatmentCycleId: string };
  prompt: { id: string; weekNumber: number };
}

export function useCheckinDraft({ patient, prompt }: UseCheckinDraftArgs) {
  const [draft, setDraft] = useState<CheckinDraft>(() =>
    emptyCheckinDraft(patient, prompt)
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const loaded = load(prompt.id);
    if (loaded && loaded.weeklyPromptId === prompt.id) {
      setDraft(loaded);
    } else {
      setDraft(emptyCheckinDraft(patient, prompt));
    }
    setHydrated(true);
  }, [patient, prompt]);

  const update = useCallback((patch: Partial<CheckinDraft>) => {
    setDraft((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  const setRating = useCallback(
    (approvedGoalId: string, value: number) => {
      setDraft((prev) => {
        const next = {
          ...prev,
          ratings: { ...prev.ratings, [approvedGoalId]: value }
        };
        save(next);
        return next;
      });
    },
    []
  );

  const goToStep = useCallback(
    (step: number) => {
      update({ currentStep: step });
    },
    [update]
  );

  const reset = useCallback(() => {
    clear(prompt.id);
    setDraft(emptyCheckinDraft(patient, prompt));
  }, [patient, prompt]);

  return { draft, update, setRating, goToStep, reset, hydrated };
}

export const checkinDraftStorage = { load, save, clear };
