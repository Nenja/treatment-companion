'use client';

import { useSyncExternalStore } from 'react';
import { buildSeed, type Seed } from './fakeData';
import { addDaysIso } from './dates';
import type {
  Role,
  AuditEvent,
  WeeklyPrompt,
  GoalSuggestion,
  WeeklyCheckin,
  WeeklyGoalRating,
  RatingValue,
  ApprovedGoal,
  GasAnchors,
  SuggestionStatus
} from './types';
import { RATING_VALUE_MAP, type RatingLabel } from './types';
import type { SuggestGoalDraft } from './suggestGoalDraft';
import type { CheckinDraft } from './checkinDraft';
import {
  generateVisitCodeString,
  normalizeVisitCodeInput,
  isUsable,
  VISIT_CODE_TTL_MINUTES,
  type VisitCode
} from './visitCode';

// ---------------------------------------------------------------------------
// Store state
// ---------------------------------------------------------------------------

export interface ClinicianSession {
  /** Patient ID the clinician currently has access to. */
  patientId: string;
  /** ISO timestamp of last activity — used for inactivity timeout. */
  lastActivityAt: string;
}

export interface State extends Seed {
  currentRole: Role;
  currentPatientId: string;
  /** Active and historical visit codes. */
  visitCodes: VisitCode[];
  /** Clinician's currently unlocked patient session, if any. */
  clinicianSession?: ClinicianSession;
}

function makeInitial(): State {
  const seed = buildSeed();
  return {
    ...seed,
    currentRole: 'patient',
    currentPatientId: seed.patients[0].id, // Anna by default
    visitCodes: [],
    clinicianSession: undefined
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

  /**
   * Create a GoalSuggestion from a completed wizard draft and append it
   * to the store. Returns the new suggestion's ID so the caller can
   * route appropriately.
   *
   * Caller is responsible for clearing the draft from localStorage —
   * this action only touches the in-memory store.
   */
  submitGoalSuggestion(draft: SuggestGoalDraft): string {
    let newId = '';
    setState((s) => {
      const patient = s.patients.find((p) => p.id === draft.patientId);
      if (!patient) return s;

      const cycle = s.treatmentCycles.find(
        (c) => c.id === patient.activeTreatmentCycleId
      );
      if (!cycle) return s;

      if (
        !draft.domain ||
        !draft.patientWording ||
        !draft.importance
      ) {
        return s;
      }

      newId = randomId('sug');

      const suggestion: GoalSuggestion = {
        id: newId,
        patientId: patient.id,
        treatmentCycleId: cycle.id,
        domain: draft.domain,
        patientWording:
          draft.domain === 'other' && draft.otherDomainText
            ? // Prefix the other-domain label so clinicians see context
              `[${draft.otherDomainText.trim()}] ${draft.patientWording.trim()}`
            : draft.patientWording.trim(),
        importance: draft.importance,
        // Default to "notSure" since we no longer ask the patient.
        // The clinician can refine this against the cycle length on approval.
        hopedTimeframe: 'notSure',
        difficultyContext: draft.difficultyContext?.trim() || undefined,
        createdAt: new Date().toISOString(),
        status: 'needsReview'
      };

      const auditEvent: AuditEvent = {
        id: randomId('audit'),
        actorId: patient.id,
        actorRole: 'patient',
        action: 'suggest_goal_submitted',
        entity: 'goal_suggestion',
        entityId: newId,
        timestamp: new Date().toISOString()
      };

      return {
        ...s,
        goalSuggestions: [...s.goalSuggestions, suggestion],
        auditLog: [...s.auditLog, auditEvent]
      };
    });
    return newId;
  },

  /**
   * Convert a completed check-in draft into a WeeklyCheckin record,
   * mark the prompt completed, and append both to the store.
   *
   * Pain / stiffness / spasm-frequency / daily-care / side-effects fields
   * remain on the WeeklyCheckin type (historical data uses them) but new
   * patient-submitted check-ins don't supply them — those questions were
   * removed because they duplicate the per-goal rating once a patient has
   * goals around pain, stiffness, etc.
   *
   * Returns the new check-in's ID, or empty string on validation failure.
   */
  submitCheckin(draft: CheckinDraft): string {
    let newId = '';
    setState((s) => {
      const prompt = s.weeklyPrompts.find((p) => p.id === draft.weeklyPromptId);
      if (!prompt || prompt.status !== 'pending') return s;

      // Build the per-goal ratings from the draft's map.
      const ratings: WeeklyGoalRating[] = [];
      newId = randomId('ci');
      for (const [goalId, value] of Object.entries(draft.ratings)) {
        // Reverse-lookup the label from the value so the stored record
        // carries both — handy for the clinician summary later.
        const label = (Object.keys(RATING_VALUE_MAP) as RatingLabel[]).find(
          (k) => RATING_VALUE_MAP[k] === value
        );
        if (!label) continue;
        ratings.push({
          id: randomId(`${newId}-r`),
          weeklyCheckinId: newId,
          approvedGoalId: goalId,
          ratingLabel: label,
          ratingValue: value as RatingValue
        });
      }

      // Need at least one rating to be considered a valid submission.
      if (ratings.length === 0) {
        newId = '';
        return s;
      }

      const checkin: WeeklyCheckin = {
        id: newId,
        weeklyPromptId: draft.weeklyPromptId,
        patientId: draft.patientId,
        treatmentCycleId: draft.treatmentCycleId,
        weekNumber: draft.weekNumber,
        submittedAt: new Date().toISOString(),
        // The questions below were removed from the patient-facing check-in.
        // Stored as nulls/defaults for new submissions; historical data
        // retains its original values.
        pain: 0,
        stiffness: 0,
        spasmFrequency: 'none',
        dailyCare: 'notRelevant',
        sideEffects: [],
        comment: draft.comment?.trim() || undefined,
        ratings
      };

      const updatedPrompts = s.weeklyPrompts.map((p) =>
        p.id === prompt.id ? { ...p, status: 'completed' as const } : p
      );

      const auditEvent: AuditEvent = {
        id: randomId('audit'),
        actorId: draft.patientId,
        actorRole: 'patient',
        action: 'checkin_submitted',
        entity: 'weekly_checkin',
        entityId: newId,
        timestamp: new Date().toISOString()
      };

      return {
        ...s,
        weeklyPrompts: updatedPrompts,
        weeklyCheckins: [...s.weeklyCheckins, checkin],
        auditLog: [...s.auditLog, auditEvent]
      };
    });
    return newId;
  },

  /**
   * Generate a fresh visit code for the given patient. Any previously
   * unconsumed code for that patient is invalidated.
   */
  generateVisitCode(patientId: string): VisitCode {
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + VISIT_CODE_TTL_MINUTES * 60 * 1000
    ).toISOString();
    const newCode: VisitCode = {
      code: generateVisitCodeString(),
      patientId,
      expiresAt
    };
    setState((s) => {
      // Mark any other unconsumed codes for this patient as consumed-now,
      // so the new one is the only valid code.
      const updated = s.visitCodes.map((c) =>
        c.patientId === patientId && !c.consumedAt && new Date(c.expiresAt) > now
          ? { ...c, consumedAt: now.toISOString() }
          : c
      );
      return {
        ...s,
        visitCodes: [...updated, newCode],
        auditLog: [
          ...s.auditLog,
          {
            id: randomId('audit'),
            actorId: patientId,
            actorRole: 'patient',
            action: 'visit_code_generated',
            entity: 'visit_code',
            entityId: newCode.code,
            timestamp: now.toISOString()
          }
        ]
      };
    });
    return newCode;
  },

  /**
   * Clinician attempts to unlock a patient by entering a code.
   * Returns the patient ID on success, or null on invalid/expired code.
   */
  unlockWithVisitCode(rawInput: string): string | null {
    const code = normalizeVisitCodeInput(rawInput);
    let unlockedPatientId: string | null = null;
    setState((s) => {
      const match = s.visitCodes.find(
        (c) => c.code === code && isUsable(c)
      );
      if (!match) return s;
      unlockedPatientId = match.patientId;
      const nowIso = new Date().toISOString();
      const updatedCodes = s.visitCodes.map((c) =>
        c.code === code ? { ...c, consumedAt: nowIso } : c
      );
      return {
        ...s,
        visitCodes: updatedCodes,
        clinicianSession: {
          patientId: match.patientId,
          lastActivityAt: nowIso
        },
        auditLog: [
          ...s.auditLog,
          {
            id: randomId('audit'),
            actorId: 'clin-1',
            actorRole: 'clinician',
            action: 'patient_unlocked',
            entity: 'patient',
            entityId: match.patientId,
            timestamp: nowIso
          }
        ]
      };
    });
    return unlockedPatientId;
  },

  /** Refresh the clinician's session timestamp (any clinician action). */
  touchClinicianSession() {
    setState((s) => {
      if (!s.clinicianSession) return s;
      return {
        ...s,
        clinicianSession: {
          ...s.clinicianSession,
          lastActivityAt: new Date().toISOString()
        }
      };
    });
  },

  /** End the clinician's session (manual or timeout). */
  endClinicianSession() {
    setState((s) => {
      if (!s.clinicianSession) return s;
      return {
        ...s,
        clinicianSession: undefined,
        auditLog: [
          ...s.auditLog,
          {
            id: randomId('audit'),
            actorId: 'clin-1',
            actorRole: 'clinician',
            action: 'session_ended',
            entity: 'patient',
            entityId: s.clinicianSession.patientId,
            timestamp: new Date().toISOString()
          }
        ]
      };
    });
  },

  /**
   * Set a suggestion's status without approving it. Used for
   * "discuss at next visit", "combined", "not suitable" actions.
   */
  setSuggestionStatus(suggestionId: string, status: SuggestionStatus) {
    setState((s) => {
      const updated = s.goalSuggestions.map((g) =>
        g.id === suggestionId ? { ...g, status } : g
      );
      return {
        ...s,
        goalSuggestions: updated,
        auditLog: [
          ...s.auditLog,
          {
            id: randomId('audit'),
            actorId: 'clin-1',
            actorRole: 'clinician',
            action: 'suggestion_status_updated',
            entity: 'goal_suggestion',
            entityId: suggestionId,
            timestamp: new Date().toISOString()
          }
        ]
      };
    });
  },

  /**
   * Approve a suggestion: create an ApprovedGoal and mark the source
   * suggestion as active.
   */
  approveSuggestion(
    suggestionId: string,
    fields: {
      patientFacingText: string;
      smartText: string;
      gasAnchors: GasAnchors;
    }
  ): string {
    let newGoalId = '';
    setState((s) => {
      const suggestion = s.goalSuggestions.find((g) => g.id === suggestionId);
      if (!suggestion) return s;
      newGoalId = randomId('goal');
      const goal: ApprovedGoal = {
        id: newGoalId,
        suggestionId: suggestion.id,
        patientId: suggestion.patientId,
        treatmentCycleId: suggestion.treatmentCycleId,
        patientFacingText: fields.patientFacingText.trim(),
        smartText: fields.smartText.trim(),
        gasAnchors: {
          minus2: fields.gasAnchors.minus2.trim(),
          minus1: fields.gasAnchors.minus1.trim(),
          zero: fields.gasAnchors.zero.trim(),
          plus1: fields.gasAnchors.plus1.trim(),
          plus2: fields.gasAnchors.plus2.trim()
        },
        approvedByClinicianId: 'clin-1',
        approvedAt: new Date().toISOString(),
        status: 'active'
      };
      const updatedSuggestions = s.goalSuggestions.map((g) =>
        g.id === suggestionId ? { ...g, status: 'active' as const } : g
      );
      return {
        ...s,
        goalSuggestions: updatedSuggestions,
        approvedGoals: [...s.approvedGoals, goal],
        auditLog: [
          ...s.auditLog,
          {
            id: randomId('audit'),
            actorId: 'clin-1',
            actorRole: 'clinician',
            action: 'suggestion_approved',
            entity: 'approved_goal',
            entityId: newGoalId,
            timestamp: new Date().toISOString()
          }
        ]
      };
    });
    return newGoalId;
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
