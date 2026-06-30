/**
 * Shared types for the wearable-aggregator ingestion module.
 *
 * Flow: a patient links a provider (e.g. Garmin) through an EU data
 * aggregator. The aggregator pushes the patient's data to our webhook, which
 * normalizes each sample into the vendor-neutral `observation` store (0069)
 * via the service-role RPC `ingest_wearable_observations` (0120).
 *
 * The aggregator's wire format lives ONLY in `aggregator.ts`; everything else
 * works in the internal `WearableSample` / `WearableEvent` shapes below, so
 * swapping aggregators is a one-file change.
 *
 * DESCRIPTIVE ONLY: this module stores and displays data. It deliberately
 * derives no scores, thresholds, or alerts — consistent with the app's
 * intended purpose (keeps it clear of medical-device decision support).
 */

/** Provisional coding system for metrics without a confident standard code.
 *  Replace the affected entries with proper LOINC/SNOMED during clinical
 *  review; the store and exporter don't care which system is used. */
export const PROVISIONAL_CODE_SYSTEM = 'urn:tc:wearable-metric';

export interface MetricCoding {
  /** LOINC code by default; an opaque key when codeSystem is provisional. */
  code: string;
  display: string;
  /** UCUM unit. */
  unit: string;
  /** Defaults to LOINC (http://loinc.org) when omitted. */
  codeSystem?: string;
}

/**
 * Maps an internal metric key to its coding. Keys are the aggregator metric
 * names AFTER mapping in aggregator.ts (so this file stays vendor-neutral).
 * Codes marked provisional need a clinician/terminology review before they
 * carry real meaning in an export — confirmed ones are standard LOINC.
 */
export const METRIC_CODES: Record<string, MetricCoding> = {
  heart_rate: { code: '8867-4', display: 'Heart rate', unit: 'beats/min' },
  resting_heart_rate: {
    code: '40443-4',
    display: 'Resting heart rate',
    unit: 'beats/min'
  },
  steps: { code: '55423-8', display: 'Steps', unit: 'steps' },
  spo2: { code: '59408-5', display: 'Oxygen saturation', unit: '%' },
  respiration: { code: '9279-1', display: 'Respiratory rate', unit: 'breaths/min' },
  // Provisional — no single agreed LOINC in this app yet. Confirm in review.
  sleep_duration: {
    code: 'sleep_duration',
    display: 'Sleep duration',
    unit: 'min',
    codeSystem: PROVISIONAL_CODE_SYSTEM
  },
  hrv: {
    code: 'hrv',
    display: 'Heart rate variability',
    unit: 'ms',
    codeSystem: PROVISIONAL_CODE_SYSTEM
  },
  stress: {
    code: 'stress',
    display: 'Stress level',
    unit: '{score}',
    codeSystem: PROVISIONAL_CODE_SYSTEM
  },
  calories: {
    code: 'calories',
    display: 'Calories burned',
    unit: 'kcal',
    codeSystem: PROVISIONAL_CODE_SYSTEM
  },
  distance: {
    code: 'distance',
    display: 'Distance',
    unit: 'm',
    codeSystem: PROVISIONAL_CODE_SYSTEM
  }
};

/** One normalized measurement, aggregator-agnostic. */
export interface WearableSample {
  /** Key into METRIC_CODES; unknown keys fall through as their own code. */
  metric: string;
  value: number;
  /** Optional unit override; otherwise the metric's default unit is used. */
  unit?: string;
  /** ISO-8601 instant the measurement applies to. */
  start: string;
  /** ISO-8601 end for intervals (e.g. a sleep session); omit for points. */
  end?: string;
  /** The source's own id for this datapoint, for idempotent re-import. */
  externalId?: string;
  /** Free-text device name, e.g. "Garmin Vivoactive 4". */
  deviceLabel?: string;
  /** Original payload fragment, kept for provenance. */
  raw?: unknown;
}

/** Internal representation of an inbound webhook event. */
export type WearableEvent =
  | {
      kind: 'auth';
      /** Our connection id, echoed back as the aggregator's reference. */
      connectionId: string;
      aggregatorUserId: string;
      status: 'connected' | 'error';
    }
  | { kind: 'deauth'; aggregatorUserId: string }
  | { kind: 'data'; aggregatorUserId: string; samples: WearableSample[] };

/**
 * The metrics a clinician can choose to import, in display order. Keys index
 * into METRIC_CODES; the UI localizes each via `wearables.metrics.<key>`.
 */
export const IMPORTABLE_METRIC_KEYS = [
  'steps',
  'heart_rate',
  'resting_heart_rate',
  'sleep_duration',
  'hrv',
  'spo2',
  'respiration',
  'stress',
  'calories',
  'distance'
] as const;

/** Conservative starter allowlist (matches the SQL column default in 0121). */
export const DEFAULT_IMPORT_METRICS: string[] = [
  'steps',
  'heart_rate',
  'sleep_duration'
];
