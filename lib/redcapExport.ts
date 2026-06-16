'use client';

import { useMutation } from '@tanstack/react-query';
import { createSupabaseBrowserClient } from './supabase/browser';
import { patientRows, toCsv } from './redcap/buildRows';

// Re-export the pure helpers so existing importers (and tests) keep working.
export { esc, toCsv, patientRows, COLUMNS } from './redcap/buildRows';

/* eslint-disable @typescript-eslint/no-explicit-any */

function downloadCsv(csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `treatment-companion-redcap-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Builds and downloads the REDCap import CSV for all research-consented
 * patients. Returns counts for a confirmation message. Clinician-gated in the
 * RPC; the browser does the formatting only.
 */
export function useExportRedcapDataset() {
  return useMutation({
    mutationFn: async (): Promise<{ patients: number; rows: number }> => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.rpc('export_research_dataset');
      if (error) throw error;
      const patients = (data as any[]) ?? [];
      const rows = patients.flatMap(patientRows);
      downloadCsv(toCsv(rows));
      return { patients: patients.length, rows: rows.length };
    }
  });
}

/**
 * Triggers the server-side REDCap sync (admin-only route). The browser never
 * sees the REDCap token — the route holds it. Returns the sync summary.
 */
export function useSyncRedcapDataset() {
  return useMutation({
    mutationFn: async (): Promise<{
      patients: number;
      rows: number;
      imported: number;
      chunks: number;
      errors: string[];
    }> => {
      const res = await fetch('/api/admin/redcap-sync', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string })?.error ?? `Sync failed (HTTP ${res.status})`);
      }
      return json;
    }
  });
}
