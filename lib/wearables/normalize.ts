import { METRIC_CODES, type WearableSample } from './types';

/**
 * The element shape consumed by the `ingest_wearable_observations` RPC (and,
 * identically, `import_observations`). snake_case to match the SQL.
 */
export interface ObservationElement {
  code: string;
  code_system?: string;
  display?: string;
  value_numeric?: number;
  unit?: string;
  value_text?: string;
  effective_time: string;
  effective_end?: string;
  device_label?: string;
  external_id?: string;
  raw?: unknown;
}

/**
 * Maps normalized samples to observation elements, applying the metric→coding
 * table. Samples without a finite value or a start time are dropped (the RPC
 * would reject them anyway). `source` is NOT set here — the RPC forces it from
 * the patient's connection, so a payload can't write under another source.
 */
export function toObservationElements(
  samples: WearableSample[]
): ObservationElement[] {
  const out: ObservationElement[] = [];
  for (const s of samples) {
    if (!Number.isFinite(s.value) || !s.start) continue;
    const coding = METRIC_CODES[s.metric];
    out.push({
      code: coding?.code ?? s.metric,
      code_system: coding?.codeSystem, // undefined → RPC defaults to LOINC
      display: coding?.display ?? s.metric,
      value_numeric: s.value,
      unit: s.unit ?? coding?.unit,
      effective_time: s.start,
      effective_end: s.end,
      device_label: s.deviceLabel,
      external_id: s.externalId ?? '',
      raw: s.raw
    });
  }
  return out;
}
