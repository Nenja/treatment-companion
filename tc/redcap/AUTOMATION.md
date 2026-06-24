# REDCap sync — automation

How the app pushes the research dataset into REDCap, and what you must configure.

## Shape (v1)
**Full snapshot, chunked, idempotent.** Each run rebuilds *all* consented
patients' rows and imports them; REDCap matches on
`record_id` + `redcap_repeat_instrument` + `redcap_repeat_instance`, so a missed
run self-heals on the next one. Incremental (only-changed) sync is deferred —
see "Later" below.

## Pieces
- `lib/redcap/buildRows.ts` — **pure** row/CSV builder (no browser/server deps).
  Shared by the client download hook and the server sync. Mirrors the codings in
  `redcap/treatment_companion_datadictionary.csv`.
- `lib/redcap/importToRedcap.ts` — server-only REDCap API client. Chunks rows
  (2000/chunk) and POSTs `content=record, format=csv, type=flat,
  overwriteBehavior=normal`. Reads `REDCAP_API_URL` / `REDCAP_API_TOKEN`.
- `lib/redcap/runSync.ts` — `runRedcapSync()`: service-role client →
  `export_research_dataset()` (0106) → flatten → import → summary. Used by both
  triggers.
- `app/api/admin/redcap-sync/route.ts` — **trigger 1**: admin button. POST,
  signed-in-admin gated, writes an admin audit event.
- `app/api/cron/redcap-sync/route.ts` — **trigger 2**: scheduled. GET, gated by
  `CRON_SECRET`.
- `vercel.json` — cron schedule `0 3 * * 1` (weekly, Mon 03:00 UTC).
- UI: "Sync to REDCap now" button on the clinician **Observations** page, next
  to the existing "Download REDCap CSV" export.

## Environment variables (set in Vercel — server-only, NO `NEXT_PUBLIC_`)
| Var | What | Where |
|---|---|---|
| `REDCAP_API_URL` | Your instance's API endpoint, e.g. `https://redcap.example.org/api/` | Vercel env |
| `REDCAP_API_TOKEN` | The project API token (a credential) | Vercel env |
| `CRON_SECRET` | Any long random string; Vercel Cron sends it as `Authorization: Bearer …` | Vercel env |

The token is **never** in code, in a zip, or sent to the browser. Set these on
**Production**. Do **not** put the real production token on the Preview
environment — if you want to test against a REDCap *test* project, use a
separate token there.

## Notes / limits
- **Cron runs on the production deployment only**, on the weekly schedule.
  Vercel's Hobby plan allows cron at daily-or-less-frequent cadence, so weekly
  is fine; anything more frequent than daily needs Pro.
- `maxDuration = 60` on the routes. Hobby caps function duration lower than
  Pro; a very large snapshot could be cut off on Hobby — another reason Pro is
  the eventual production posture (alongside Supabase Pro). At tens of patients
  this is not a concern.
- Response codes: `200` clean, `207` if some chunks errored (see `errors[]`),
  `400` if REDCap env vars are missing, `401/403` auth, `500` otherwise.

## ⚠️ DPO / DPIA gate
Automated transfer of patient data to REDCap is a **processing activity** that
belongs in the DPIA. Do **not** run this against **real patient data** until the
DPO / regulatory sign-off. Building and testing against **staging / fake data**
is fine now.

## Later (deferred)
- **Incremental sync**: send only records changed since the last run (needs a
  reliable "modified since" signal per table + a stored cursor). Worth it only
  when full-snapshot volume becomes a problem; not at current scale.
