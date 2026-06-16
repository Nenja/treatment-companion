// Server-only REDCap API import client.
//
// Pushes pre-built REDCap rows to the project's API (content=record, flat,
// CSV). Chunks the rows so a large full-snapshot never exceeds REDCap's
// payload/timeout limits — REDCap matches each row independently by
// record_id + redcap_repeat_instrument + redcap_repeat_instance, so splitting
// a patient's repeating rows across chunks is safe.
//
// Credentials come from server-only env vars (set in Vercel, never client,
// never committed): REDCAP_API_URL and REDCAP_API_TOKEN. The token must NEVER
// be sent to the browser.

import { type Row, csvHeader, csvRowLine } from './buildRows';

const CHUNK_SIZE = 2000;

export type RedcapImportResult = {
  configured: boolean;
  chunks: number;
  imported: number; // records REDCap reports it imported (summed across chunks)
  errors: string[];
};

export async function importRowsToRedcap(
  rows: Row[],
  chunkSize: number = CHUNK_SIZE
): Promise<RedcapImportResult> {
  const url = process.env.REDCAP_API_URL;
  const token = process.env.REDCAP_API_TOKEN;
  if (!url || !token) {
    return {
      configured: false,
      chunks: 0,
      imported: 0,
      errors: ['REDCAP_API_URL / REDCAP_API_TOKEN not set (configure in Vercel)']
    };
  }

  const header = csvHeader();
  const errors: string[] = [];
  let imported = 0;
  let chunks = 0;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const csv = [header, ...slice.map(csvRowLine)].join('\r\n');
    chunks += 1;

    const body = new URLSearchParams({
      token,
      content: 'record',
      format: 'csv',
      type: 'flat',
      // 'normal' = do not blank out existing REDCap values with empty cells.
      overwriteBehavior: 'normal',
      forceAutoNumber: 'false',
      returnContent: 'count',
      returnFormat: 'json',
      data: csv
    });

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
    } catch (e) {
      errors.push(`chunk ${chunks}: network error ${(e as Error)?.message ?? ''}`);
      continue;
    }

    const text = await res.text();
    if (!res.ok) {
      errors.push(`chunk ${chunks}: HTTP ${res.status} — ${text.slice(0, 200)}`);
      continue;
    }
    try {
      const parsed = JSON.parse(text) as { count?: number; error?: string };
      if (typeof parsed.count === 'number') imported += parsed.count;
      else if (parsed.error) errors.push(`chunk ${chunks}: ${parsed.error}`);
      else errors.push(`chunk ${chunks}: unexpected response ${text.slice(0, 120)}`);
    } catch {
      errors.push(`chunk ${chunks}: unparseable response ${text.slice(0, 120)}`);
    }
  }

  return { configured: true, chunks, imported, errors };
}
