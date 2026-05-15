'use client';

import { useSyncExternalStore } from 'react';
import { buildSeed, type Seed } from './fakeData';
import { addDaysIso } from './dates';
import type { Role, AuditEvent, WeeklyPrompt } from './types';

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

export interface State extends Seed {
  currentRole: Role;
  currentPatientId: string;
}

function makeInitial(): State {
  const seed = buildSeed();
  return {
    ...seed,
    currentRole: 'patient',
    currentPatientId: seed.patients[0].id // Anna by default
  };
}

const STORAGE_KEY = 'treatment-companion:v1';

// The single source of truth at module scope. Mutated only by `setState`.
let state: State = makeInitial();
let hydratedFromStorage = false;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function persist() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quietly tolerate quota errors etc. — this is a prototype.
  }
}

function loadFromStorage(): State | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as State;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// useSyncExternalStore plumbing
//
// IMPORTANT: getServerSnapshot and the first client snapshot must match to
// avoid hydration errors. We therefore load from localStorage only AFTER
// the first subscriber attaches (i.e. after hydration), then emit so React
// re-renders with the persisted state.
// ---------------------------------------------------------------------------

function subscribe(listener: () => void): () => void {
  if (!hydratedFromStorage && typeof window !== 'undefined') {
    hydratedFromStorage = true;
    const loaded = loadFromStorage();
    if (loaded) {
      state = loaded;
      // Defer so the *current* subscribe call has finished registering before
      // we notify; otherwise the just-registered listener might miss the emit.
      queueMicrotask(emit);
    }
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): State {
  return state;
}

// Memoise the server snapshot so React's referential checks stay stable.
const serverSnapshot: State = makeInitial();
function getServerSnapshot(): State {
  return serverSnapshot;
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function setState(updater: (s: State) => State) {
  state = updater(state);
  persist();
  emit();
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export const actions = {
  setRole(role: Role) {
    setState((s) => ({ ...s, currentRole: role }));
  },

  setCurrentPatientId(id: string) {
    setState((s) => ({ ...s, currentPatientId: id }));
  },

  /**
   * Advance the virtual "now" by seven days and create a fresh weekly
   * prompt for every active treatment cycle that does not already have a
   * pending prompt. This is the prototype's stand-in for real time passing.
   */
  simulateNextWeek() {
    setState((s) => {
      const newNow = addDaysIso(s.now, 7);

      const newPrompts: WeeklyPrompt[] = [];
      for (const cycle of s.treatmentCycles) {
        if (cycle.status !== 'active') continue;

        const existingForCycle = s.weeklyPrompts.filter(
          (p) => p.treatmentCycleId === cycle.id
        );
        const hasPending = existingForCycle.some((p) => p.status === 'pending');
        if (hasPending) continue; // don't pile up unanswered prompts

        const nextWeekNumber =
          existingForCycle.reduce((max, p) => Math.max(max, p.weekNumber), 0) +
          1;

        newPrompts.push({
          id: randomId(`wp-${cycle.id}`),
          patientId: cycle.patientId,
          treatmentCycleId: cycle.id,
          weekNumber: nextWeekNumber,
          dueDate: newNow,
          status: 'pending'
        });
      }

      const auditEvent: AuditEvent = {
        id: randomId('audit'),
        actorId: 'system',
        actorRole: s.currentRole,
        action: 'simulate_next_week',
        entity: 'system',
        entityId: 'clock',
        timestamp: new Date().toISOString()
      };

      return {
        ...s,
        now: newNow,
        weeklyPrompts: [...s.weeklyPrompts, ...newPrompts],
        auditLog: [...s.auditLog, auditEvent]
      };
    });
  },

  reset() {
    state = makeInitial();
    persist();
    emit();
  },

  log(partial: Omit<AuditEvent, 'id' | 'timestamp'>) {
    setState((s) => ({
      ...s,
      auditLog: [
        ...s.auditLog,
        {
          ...partial,
          id: randomId('audit'),
          timestamp: new Date().toISOString()
        }
      ]
    }));
  }
};
