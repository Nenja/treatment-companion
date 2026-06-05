'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './browser';

/**
 * Client layer for the vendor-neutral wearable / PGHD ingestion scaffold
 * (migration 0069). Source-agnostic on purpose: the same import path takes
 * manual entries, CSV, or — later — normalized output from per-vendor
 * adapters (Apple Health, Health Connect, Garmin, Fitbit, …).
 */

export type ObservationSource =
  | 'manual'
  | 'csv'
  | 'apple_health'
  | 'health_connect'
  | 'garmin'
  | 'fitbit'
  | 'oura'
  | 'withings'
  | 'other';

/** A normalized measurement ready to import. Mirrors the RPC payload. */
export interface ObservationInput {
  source: ObservationSource;
  code: string;
  codeSystem?: string;
  display?: string;
  valueNumeric?: number;
  unit?: string;
  valueText?: string;
  /** ISO-8601 instant. */
  effectiveTime: string;
  effectiveEnd?: string;
  deviceLabel?: string;
  externalId?: string;
  raw?: unknown;
}

/** A stored observation as read back for display. */
export interface Observation {
  id: string;
  source: ObservationSource;
  code: string;
  display: string | null;
  valueNumeric: number | null;
  unit: string | null;
  valueText: string | null;
  effectiveTime: string;
  effectiveEnd: string | null;
  deviceLabel: string | null;
}

/** Maps a camelCase ObservationInput to the snake_case RPC element shape. */
function toRpcElement(o: ObservationInput): Record<string, unknown> {
  return {
    source: o.source,
    code: o.code,
    code_system: o.codeSystem,
    display: o.display,
    value_numeric: o.valueNumeric,
    unit: o.unit,
    value_text: o.valueText,
    effective_time: o.effectiveTime,
    effective_end: o.effectiveEnd,
    device_label: o.deviceLabel,
    external_id: o.externalId,
    raw: o.raw
  };
}

/**
 * Imports a batch of normalized observations for a patient. Idempotent —
 * the RPC dedups on (patient, source, code, time, external_id), so the same
 * datapoint imported twice is a no-op. Returns the number actually inserted.
 */
export function useImportObservations() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      patientId: string;
      observations: ObservationInput[];
    }): Promise<number> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('import_observations', {
        p_patient_id: args.patientId,
        p_observations: args.observations.map(toRpcElement)
      });
      if (error) throw error;
      return (data as number) ?? 0;
    },
    onSuccess: (_n, args) => {
      qc.invalidateQueries({ queryKey: ['observations', args.patientId] });
    }
  });
}

/** Most-recent observations for a patient (read governed by RLS). */
export function usePatientObservations(
  patientId: string | null,
  limit = 100
) {
  return useQuery({
    queryKey: ['observations', patientId, limit],
    enabled: !!patientId,
    queryFn: async (): Promise<Observation[]> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from('observation')
        .select(
          'id, source, code, display, value_numeric, unit, value_text, effective_time, effective_end, device_label'
        )
        .eq('patient_id', patientId as string)
        .order('effective_time', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        id: r.id as string,
        source: r.source as ObservationSource,
        code: r.code as string,
        display: (r.display as string | null) ?? null,
        valueNumeric: (r.value_numeric as number | null) ?? null,
        unit: (r.unit as string | null) ?? null,
        valueText: (r.value_text as string | null) ?? null,
        effectiveTime: r.effective_time as string,
        effectiveEnd: (r.effective_end as string | null) ?? null,
        deviceLabel: (r.device_label as string | null) ?? null
      }));
    }
  });
}

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

/**
 * Splits one CSV line into fields, honoring double-quoted fields that may
 * contain commas or escaped ("") quotes. Deliberately small — enough for
 * exported wearable CSVs without pulling in a parser dependency.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

const KNOWN_SOURCES: ObservationSource[] = [
  'manual',
  'csv',
  'apple_health',
  'health_connect',
  'garmin',
  'fitbit',
  'oura',
  'withings',
  'other'
];

/**
 * Parses a normalized CSV into ObservationInput rows. Expected header
 * columns (order-independent, extras ignored):
 *
 *   effective_time, code, display, value, unit, value_text,
 *   source, device_label, external_id, effective_end
 *
 * Required per row: effective_time, code, and one of value / value_text.
 * `source` defaults to 'csv' if blank. Returns rows that parsed plus a
 * list of human-readable errors for rows that didn't (1-based line refs).
 */
export function parseObservationsCsv(text: string): {
  rows: ObservationInput[];
  errors: string[];
} {
  const rows: ObservationInput[] = [];
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows, errors: ['The file is empty.'] };
  }

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const iTime = idx('effective_time');
  const iCode = idx('code');
  if (iTime === -1 || iCode === -1) {
    return {
      rows,
      errors: ['Header must include at least "effective_time" and "code".']
    };
  }
  const iDisplay = idx('display');
  const iValue = idx('value');
  const iUnit = idx('unit');
  const iValueText = idx('value_text');
  const iSource = idx('source');
  const iDevice = idx('device_label');
  const iExternal = idx('external_id');
  const iEnd = idx('effective_end');

  const at = (cols: string[], i: number) =>
    i >= 0 && i < cols.length ? cols[i].trim() : '';

  for (let r = 1; r < lines.length; r++) {
    const lineNo = r + 1; // 1-based, header is line 1
    const cols = splitCsvLine(lines[r]);
    const timeStr = at(cols, iTime);
    const code = at(cols, iCode);
    const valueStr = at(cols, iValue);
    const valueText = at(cols, iValueText);

    if (!timeStr || !code) {
      errors.push(`Line ${lineNo}: missing effective_time or code.`);
      continue;
    }
    const when = new Date(timeStr);
    if (Number.isNaN(when.getTime())) {
      errors.push(`Line ${lineNo}: unparseable effective_time "${timeStr}".`);
      continue;
    }
    let valueNumeric: number | undefined;
    if (valueStr) {
      const n = Number(valueStr);
      if (Number.isNaN(n)) {
        errors.push(`Line ${lineNo}: value "${valueStr}" is not a number.`);
        continue;
      }
      valueNumeric = n;
    }
    if (valueNumeric === undefined && !valueText) {
      errors.push(`Line ${lineNo}: needs a numeric "value" or a "value_text".`);
      continue;
    }

    const sourceRaw = at(cols, iSource).toLowerCase();
    const source: ObservationSource = (KNOWN_SOURCES as string[]).includes(
      sourceRaw
    )
      ? (sourceRaw as ObservationSource)
      : 'csv';

    const endStr = at(cols, iEnd);
    let effectiveEnd: string | undefined;
    if (endStr) {
      const end = new Date(endStr);
      if (Number.isNaN(end.getTime())) {
        errors.push(`Line ${lineNo}: unparseable effective_end "${endStr}".`);
        continue;
      }
      effectiveEnd = end.toISOString();
    }

    rows.push({
      source,
      code,
      display: at(cols, iDisplay) || undefined,
      valueNumeric,
      unit: at(cols, iUnit) || undefined,
      valueText: valueText || undefined,
      effectiveTime: when.toISOString(),
      effectiveEnd,
      deviceLabel: at(cols, iDevice) || undefined,
      externalId: at(cols, iExternal) || undefined
    });
  }

  return { rows, errors };
}
