// ---------------------------------------------------------------------------
// Treatment Companion — domain types
//
// All entities use string IDs. All dates are ISO-8601 strings.
// The store is the only place that mutates these — components read only.
// ---------------------------------------------------------------------------

export type Role = 'patient' | 'clinician';

// --- Enums --------------------------------------------------------------

export const GOAL_DOMAINS = [
  'pain',
  'hygiene',
  'dressing',
  'walking',
  'transfers',
  'handUse',
  'sleep',
  'positioning',
  'caregiverHelp',
  'therapyExercise',
  'other'
] as const;
export type GoalDomain = (typeof GOAL_DOMAINS)[number];

export const IMPORTANCE_LEVELS = ['low', 'medium', 'high'] as const;
export type Importance = (typeof IMPORTANCE_LEVELS)[number];

export const HOPED_TIMEFRAMES = ['4w', '8w', '12w', 'notSure'] as const;
export type HopedTimeframe = (typeof HOPED_TIMEFRAMES)[number];

export const SUGGESTION_STATUSES = [
  'needsReview',
  'active',
  'discussAtNextVisit',
  'combinedWithAnother',
  'notSuitableThisCycle',
  'archived'
] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export type ApprovedGoalStatus = 'active' | 'archived' | 'combined';

export const SPASM_FREQUENCIES = ['none', 'occasional', 'daily', 'severalDaily'] as const;
export type SpasmFrequency = (typeof SPASM_FREQUENCIES)[number];

export const DAILY_CARE_OPTIONS = [
  'harder',
  'unchanged',
  'easier',
  'muchEasier',
  'notRelevant'
] as const;
export type DailyCare = (typeof DAILY_CARE_OPTIONS)[number];

export const SIDE_EFFECTS = [
  'weakness',
  'falls',
  'swallowing',
  'fluLike',
  'other'
] as const;
export type SideEffect = (typeof SIDE_EFFECTS)[number];

export const RATING_LABELS = [
  'muchWorseThanExpected',
  'aLittleWorseThanExpected',
  'asExpected',
  'betterThanExpected',
  'muchBetterThanExpected',
  'notSure'
] as const;
export type RatingLabel = (typeof RATING_LABELS)[number];

export type RatingValue = -2 | -1 | 0 | 1 | 2 | null;

export const RATING_VALUE_MAP: Record<RatingLabel, RatingValue> = {
  muchWorseThanExpected: -2,
  aLittleWorseThanExpected: -1,
  asExpected: 0,
  betterThanExpected: 1,
  muchBetterThanExpected: 2,
  notSure: null
};

/**
 * Reverse of RATING_VALUE_MAP. Given a numeric rating value, returns
 * the canonical rating label. Used when submitting check-ins to
 * Supabase, which stores both the label (enum) and the value (int).
 */
export function ratingLabelForValue(v: -2 | -1 | 0 | 1 | 2): RatingLabel {
  switch (v) {
    case -2:
      return 'muchWorseThanExpected';
    case -1:
      return 'aLittleWorseThanExpected';
    case 0:
      return 'asExpected';
    case 1:
      return 'betterThanExpected';
    case 2:
      return 'muchBetterThanExpected';
  }
}

// --- Entities -----------------------------------------------------------

export interface Patient {
  id: string;
  displayName: string;
  birthYear: number;
  activeTreatmentCycleId: string;
}

export interface Clinician {
  id: string;
  displayName: string;
}

export interface TreatmentCycle {
  id: string;
  patientId: string;
  cycleNumber: number;
  /** Cycle length in weeks. Common values: 12, 14, 16. Varies by patient. */
  lengthWeeks: number;
  startDate: string;
  reviewDate: string;
  status: 'active' | 'completed';
}

export interface GoalSuggestion {
  id: string;
  patientId: string;
  treatmentCycleId: string;
  domain: GoalDomain;
  patientWording: string;
  importance: Importance;
  hopedTimeframe: HopedTimeframe;
  difficultyContext?: string;
  createdAt: string;
  status: SuggestionStatus;
}

export interface GasAnchors {
  minus2: string;
  minus1: string;
  zero: string;
  plus1: string;
  plus2: string;
}

export interface ApprovedGoal {
  id: string;
  suggestionId: string;
  patientId: string;
  treatmentCycleId: string;
  patientFacingText: string;
  smartText: string;
  gasAnchors: GasAnchors;
  approvedByClinicianId: string;
  approvedAt: string;
  status: ApprovedGoalStatus;
}

export interface WeeklyPrompt {
  id: string;
  patientId: string;
  treatmentCycleId: string;
  weekNumber: number;
  dueDate: string;
  status: 'pending' | 'completed';
}

export interface WeeklyGoalRating {
  id: string;
  weeklyCheckinId: string;
  approvedGoalId: string;
  ratingLabel: RatingLabel;
  ratingValue: RatingValue;
}

export interface WeeklyCheckin {
  id: string;
  weeklyPromptId: string;
  patientId: string;
  treatmentCycleId: string;
  weekNumber: number;
  submittedAt: string;
  pain: number; // 0-10
  stiffness: number; // 0-10
  spasmFrequency: SpasmFrequency;
  dailyCare: DailyCare;
  sideEffects: SideEffect[];
  otherSideEffectText?: string;
  comment?: string;
  ratings: WeeklyGoalRating[];
}

export interface AuditEvent {
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  entity: string;
  entityId: string;
  timestamp: string;
}

// --- Treatment record -------------------------------------------------

export const INJECTION_SIDES = ['left', 'right', 'bilateral'] as const;
export type InjectionSide = (typeof INJECTION_SIDES)[number];

export const GUIDANCE_METHODS = [
  'emg',
  'ultrasound',
  'usEmg',
  'electricalStimulation',
  'anatomicalLandmarks',
  'none',
  'other'
] as const;
export type GuidanceMethod = (typeof GUIDANCE_METHODS)[number];

export interface MuscleInjection {
  id: string;
  muscle: string; // free text — see slice-5 design notes
  side: InjectionSide;
  doseUnits: number;
  guidance: GuidanceMethod;
}

export interface TreatmentSession {
  id: string;
  patientId: string;
  treatmentCycleId: string;
  date: string; // ISO date, day only
  drugProduct: string; // free text — see slice-5 design notes
  totalUnits: number;
  dilution?: string; // free text, e.g. "250 IU/ml" — optional
  injections: MuscleInjection[];
  notes?: string;
  recordedByClinicianId: string;
  recordedAt: string; // ISO timestamp
}
