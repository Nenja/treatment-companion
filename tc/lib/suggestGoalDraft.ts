// ---------------------------------------------------------------------------
// Suggest-goal wizard state
//
// A draft is what the patient is currently building. It mirrors the shape
// of a GoalSuggestion but every field is optional (you fill them in over
// 5 steps) and there's a `currentStep` field tracking where in the wizard
// the patient is.
//
// Drafts auto-save to localStorage so the patient can close the tab and
// come back. Once submitted, the draft is cleared and a proper
// GoalSuggestion is created in the store.
// ---------------------------------------------------------------------------

import type { GoalDomain, Importance } from './types';

export type WizardStep = 1 | 2 | 3 | 4;

export interface SuggestGoalDraft {
  patientId: string;
  currentStep: WizardStep;
  domain?: GoalDomain;
  // When domain is "other", the patient can write a short label
  otherDomainText?: string;
  patientWording?: string;
  importance?: Importance;
  difficultyContext?: string;
  // ISO timestamp — useful for "you have an unfinished suggestion from..."
  // hints later (not implemented in slice 2, but the field is here so we
  // don't have to migrate drafts later).
  startedAt: string;
}

export function emptyDraft(patientId: string): SuggestGoalDraft {
  return {
    patientId,
    currentStep: 1,
    startedAt: new Date().toISOString()
  };
}

export function isStepComplete(
  draft: SuggestGoalDraft,
  step: WizardStep
): boolean {
  switch (step) {
    case 1:
      // Domain required. If "other", a label is required.
      if (!draft.domain) return false;
      if (draft.domain === 'other' && !draft.otherDomainText?.trim()) {
        return false;
      }
      return true;
    case 2:
      return Boolean(draft.patientWording && draft.patientWording.trim().length > 0);
    case 3:
      return Boolean(draft.importance);
    case 4:
      // Step 4 (difficulty context) is entirely optional — always "complete".
      return true;
  }
}

export function canSubmit(draft: SuggestGoalDraft): boolean {
  return (
    isStepComplete(draft, 1) &&
    isStepComplete(draft, 2) &&
    isStepComplete(draft, 3)
  );
}
