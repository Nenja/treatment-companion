// ---------------------------------------------------------------------------
// Weekly check-in draft
//
// A check-in is one NRS rating (0..10) per active goal, plus an optional
// free-text comment. Draft auto-saves to localStorage so the patient can
// close mid-flow and resume.
//
// Wizard step shape:
//   - Steps 1..N  — one step per active goal
//   - Step N+1    — optional comment + summary review
// ---------------------------------------------------------------------------

export interface CheckinDraft {
  weeklyPromptId: string;
  patientId: string;
  treatmentCycleId: string;
  weekNumber: number;
  /** 1-indexed step counter. */
  currentStep: number;
  /** Map of approvedGoalId → NRS value (0..10). Missing = not yet rated. */
  ratings: Record<string, number>;
  comment?: string;
  startedAt: string;
}

export function emptyCheckinDraft(
  patient: { id: string; activeTreatmentCycleId: string },
  prompt: { id: string; weekNumber: number }
): CheckinDraft {
  return {
    weeklyPromptId: prompt.id,
    patientId: patient.id,
    treatmentCycleId: patient.activeTreatmentCycleId,
    weekNumber: prompt.weekNumber,
    currentStep: 1,
    ratings: {},
    startedAt: new Date().toISOString()
  };
}

/**
 * The check-in is complete when every active goal has a rating.
 * The comment step is always optional.
 */
export function isCheckinComplete(
  draft: CheckinDraft,
  activeGoalIds: string[]
): boolean {
  if (activeGoalIds.length === 0) return false;
  return activeGoalIds.every((id) => typeof draft.ratings[id] === 'number');
}
