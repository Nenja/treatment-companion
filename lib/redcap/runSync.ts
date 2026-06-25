// Server-only: the shared REDCap sync routine used by BOTH triggers
// (the admin "Sync now" button and the scheduled cron job).
//
// Full-snapshot for v1: calls export_research_dataset() (0106, the
// consent-gated SECURITY DEFINER RPC) via the service-role client, flattens
// every consented patient into REDCap rows, and imports them (chunked).
// Idempotent — REDCap overwrites matching record_id + repeat instance — so a
// missed run self-heals on the next one. Incremental sync is a later
// optimisation (see redcap/AUTOMATION.md).

import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import { patientRows, questionnaireRows } from '@/lib/redcap/buildRows';
import { importRowsToRedcap, type RedcapImportResult } from '@/lib/redcap/importToRedcap';

export type RedcapSyncSummary = {
  patients: number;
  rows: number;
} & RedcapImportResult;

export async function runRedcapSync(): Promise<RedcapSyncSummary> {
  const svc = createSupabaseServiceClient();
  const { data, error } = await svc.rpc('export_research_dataset');
  if (error) {
    throw new Error(`export_research_dataset failed: ${error.message}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const qres = await (svc as any).rpc('export_questionnaire_responses');
  if (qres.error) {
    throw new Error(`export_questionnaire_responses failed: ${qres.error.message}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patients = ((data as any[]) ?? []);
  const rows = [...patients.flatMap(patientRows), ...questionnaireRows(qres.data)];
  const result = await importRowsToRedcap(rows);
  return { patients: patients.length, rows: rows.length, ...result };
}
