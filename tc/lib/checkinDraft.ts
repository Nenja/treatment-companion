// ---------------------------------------------------------------------------
// Weekly check-in draft
//
// A check-in is one NRS rating (0..10) per active goal, plus an optional
// free-text comment. Draft auto-saves to localStorage so the patient can
// close mid-flow and resume.
//
// Wizard step shape:
//   - Steps 1..N  — one step per active goal
//   - Step N+1    — which days the patient trained this week
//   - Step N+2    — optional comment + summary review
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
  /** ISO weekday numbers (1=Mon..7=Sun) trained AT HOME this week.
   *  Undefined until the patient reaches the training step; an empty
   *  array means "no home training this week". */
  trainingDays?: number[];
  /** ISO weekday numbers (1=Mon..7=Sun) trained WITH A THERAPIST this week. */
  trainingDaysTherapist?: number[];
  comment?: string;
  /** Who filled this in: patient themself, or someone helping them.
   *  Defaults to undefined until the patient explicitly picks; we ask
   *  on the summary step. */
  submitterLabel?: 'self' | 'caregiver';
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
