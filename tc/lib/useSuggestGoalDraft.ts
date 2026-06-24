'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  emptyDraft,
  type SuggestGoalDraft,
  type WizardStep
} from './suggestGoalDraft';

// Each patient has their own draft. Switching patient (in the dev panel
// or in real life via different accounts) should not show another
// patient's unfinished suggestion.
function storageKey(patientId: string): string {
  return `treatment-companion:v1:suggest-goal-draft:${patientId}`;
}

function load(patientId: string): SuggestGoalDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey(patientId));
    if (!raw) return null;
    return JSON.parse(raw) as SuggestGoalDraft;
  } catch {
    return null;
  }
}

function save(draft: SuggestGoalDraft): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(storageKey(draft.patientId), JSON.stringify(draft));
  } catch {
    // Quietly ignore quota errors etc — prototype.
  }
}

function clear(patientId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(storageKey(patientId));
  } catch {
    // ignore
  }
}

/**
 * Manages the draft for the suggest-goal wizard. Starts from any
 * previously-saved draft for this patient, falling back to an empty
 * draft on first use.
 *
 * Every change is persisted synchronously, so closing the tab mid-flow
 * doesn't lose work.
 */
export function useSuggestGoalDraft(patientId: string) {
  const [draft, setDraft] = useState<SuggestGoalDraft>(() =>
    emptyDraft(patientId)
  );
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from storage after mount (avoids SSR mismatch).
  useEffect(() => {
    const loaded = load(patientId);
    if (loaded && loaded.patientId === patientId) {
      setDraft(loaded);
    } else {
      setDraft(emptyDraft(patientId));
    }
    setHydrated(true);
  }, [patientId]);

  const update = useCallback(
    (patch: Partial<SuggestGoalDraft>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch };
        save(next);
        return next;
      });
    },
    []
  );

  const goToStep = useCallback(
    (step: WizardStep) => {
      update({ currentStep: step });
    },
    [update]
  );

  const reset = useCallback(() => {
    clear(patientId);
    setDraft(emptyDraft(patientId));
  }, [patientId]);

  return { draft, update, goToStep, reset, hydrated };
}

// Exposed for the store action that submits the draft.
export const draftStorage = { load, save, clear };
