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

// --- NRS goal configuration ------------------------------------------

export const NRS_DIRECTIONS = ['higherIsBetter', 'lowerIsBetter'] as const;
export type NrsDirection = (typeof NRS_DIRECTIONS)[number];

/**
 * NRS-to-GAS mapping for a goal. Four cut points partition 0-10 into
 * five GAS buckets (-2..+2). For higherIsBetter:
 *   nrs ≤ cutLowLow      → -2
 *   cutLowLow < nrs ≤ cutLow  → -1
 *   cutLow < nrs ≤ cutZero    →  0
 *   cutZero < nrs ≤ cutHigh   → +1
 *   nrs > cutHigh             → +2
 * For lowerIsBetter, the sign of the resulting GAS is flipped.
 */
export interface NrsConfig {
  question: string;
  direction: NrsDirection;
  cutLowLow: number;
  cutLow: number;
  cutZero: number;
  cutHigh: number;
}

/**
 * Maps an NRS value (0-10) to a GAS bucket (-2..+2) given a goal's
 * configuration. Mirrors the server-side nrs_to_gas function.
 */
export function nrsToGas(nrs: number, config: NrsConfig): -2 | -1 | 0 | 1 | 2 {
  let gas: -2 | -1 | 0 | 1 | 2;
  if (nrs <= config.cutLowLow) gas = -2;
  else if (nrs <= config.cutLow) gas = -1;
  else if (nrs <= config.cutZero) gas = 0;
  else if (nrs <= config.cutHigh) gas = 1;
  else gas = 2;
  if (config.direction === 'lowerIsBetter') {
    gas = (-gas) as -2 | -1 | 0 | 1 | 2;
  }
  return gas;
}

// --- Treatment record -------------------------------------------------

export const INJECTION_SIDES = ['left', 'right', 'bilateral'] as const;
export type InjectionSide = (typeof INJECTION_SIDES)[number];

/**
 * Display label for an injection side. The raw enum values are
 * lowercase ('left' / 'right' / 'bilateral') and must never reach the
 * UI raw — this is the single source for the readable form, used by
 * the clinician card, the physiotherapist views, and the EHR export.
 */
export function injectionSideLabel(side: InjectionSide): string {
  switch (side) {
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
    case 'bilateral':
      return 'Bilateral';
    default:
      return side;
  }
}

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
