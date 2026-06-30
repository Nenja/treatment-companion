# Wearable ingestion module (EU aggregator)

Lets a patient link a wearable (e.g. Garmin) through an **EU data aggregator**.
The aggregator pushes the patient's data to our webhook, which normalizes each
sample into the vendor-neutral `observation` store (migration 0069). The
existing clinician "wearable trend" (in `VisitChanges`) renders it — no extra
display work was needed.

**Descriptive only.** Nothing here derives scores, thresholds, or alerts. It
stores and shows data, consistent with the app's intended purpose (keeps it
clear of medical-device decision support). Keep it that way.

## Pieces

| Layer | File |
|---|---|
| Connection model + ingestion RPCs | `supabase/migrations/0120_wearable_connection.sql` |
| Per-connection metric allowlist + setter RPC | `supabase/migrations/0121_wearable_import_metrics.sql` |
| Metric→coding map, internal types | `lib/wearables/types.ts` |
| Sample → observation element mapping | `lib/wearables/normalize.ts` |
| **Aggregator wire contract (the seam)** | `lib/wearables/aggregator.ts` |
| Connect / webhook / disconnect routes | `app/api/wearables/{connect,webhook,disconnect}/route.ts` |
| Client hooks | `lib/supabase/wearableConnections.ts` |
| Patient UI (feature-flagged) | `components/patient/WearableConnectPanel.tsx` (mounted on `/profile`) |

## How a link works

1. Patient taps **Connect** on `/profile` → `POST /api/wearables/connect`.
2. We record a `pending` `wearable_connection` (this action is the consent) and
   ask the aggregator for a hosted connect URL, passing our connection id as the
   reference. Browser redirects there; patient authorizes with the provider.
3. Aggregator calls `POST /api/wearables/webhook` with an **auth** event →
   `set_wearable_connection_status` flips it to `connected` and stores the
   aggregator's end-user id.
4. As data syncs, the aggregator sends **data** events →
   `ingest_wearable_observations` resolves the patient from the connection and
   upserts into `observation` (idempotent; `source` forced from the provider).
5. **Disconnect** (patient) or a **deauth** webhook → status `revoked`; ingestion
   for that end-user then returns 0.

Both write RPCs are SECURITY DEFINER and granted to **`service_role` only** — a
signed-in user cannot call them. The webhook runs with the service client.

## Choosing which metrics to import (0121)

Each connection carries a `metrics text[]` allowlist of normalized metric keys
(`steps`, `heart_rate`, `hrv`, …). **The webhook drops any sample whose metric
isn't listed before it reaches `observation`** — so the clinician decides what's
collected, which is both clinically focused and GDPR data-minimising. New
connections start with a conservative default (`steps`, `heart_rate`,
`sleep_duration`); an empty list imports nothing.

- The clinician edits the list on the patient page
  (`components/clinician/WearableImportSettings.tsx`, a checkbox list); the
  patient sees what's shared on `/profile`.
- Writes go through `set_wearable_import_metrics(connection_id, metrics)` — a
  SECURITY DEFINER RPC that authorizes the patient (own), a clinician with
  access, or an admin, and updates **only** the allowlist (never status). Safe
  to grant to `authenticated`.
- The selected metrics are also passed to the aggregator connect session as a
  scope hint (`createConnectSession`), so where the aggregator supports
  scope-limited authorization, un-selected data needn't leave the provider at
  all. Best-effort and vendor-dependent — confirm in the aggregator's docs.
- The selectable catalog + display order is `IMPORTABLE_METRIC_KEYS` in
  `types.ts`; labels are localized under `wearables.metrics.<key>`.

## ⚠️ Reconcile before it works end to end

`lib/wearables/aggregator.ts` is written to a **representative** aggregator
contract (the pattern Terra / Thryve / Vitalera / Rook share). With a real
account you must confirm, against your aggregator's live docs, and adjust **only
this file**:

- the connect-session endpoint + request/response field names (`createConnectSession`)
- the webhook signature scheme + header (`WEBHOOK_SIGNATURE_HEADER`,
  `verifyWebhookSignature` — currently HMAC-SHA256 hex over the raw body)
- the webhook event JSON shape and metric names (`parseWebhookEvents`)
- the deauthorize endpoint (`deauthorize`)

Also review the metric→LOINC table in `types.ts`: heart rate, resting HR, steps,
SpO₂, and respiration use confirmed LOINC; sleep duration, HRV, stress,
calories, and distance are marked **provisional** (`urn:tc:wearable-metric`) and
need a terminology/clinician sign-off before they carry meaning in an export.

## Environment variables (Vercel)

```
WEARABLES_AGGREGATOR=thryve            # label stored on each connection
WEARABLES_API_BASE_URL=https://...     # aggregator REST base, no trailing slash
WEARABLES_API_KEY=...                  # server credential (server-only)
WEARABLES_WEBHOOK_SECRET=...           # HMAC secret for webhook verification
WEARABLES_PROVIDER_DEFAULT=garmin      # provider the Connect button links
NEXT_PUBLIC_WEARABLES_ENABLED=true     # shows the patient UI; omit to hide
```

The patient panel and the connect endpoint stay inert until these are set
(`NEXT_PUBLIC_WEARABLES_ENABLED` gates the UI; the API returns 503 if the server
vars are missing), so this ships safely **off** by default.

Webhook URL to register with the aggregator: `https://<deployment>/api/wearables/webhook`.

## Before any real patient data — compliance gates (NOT optional)

- **DPO / DPIA.** Adding an aggregator puts a third-party **data processor** in
  the GDPR chain (the patient's data flows through their servers). Update the
  DPIA, sign a **Data Processing Agreement** with the aggregator, disclose them
  as a **sub-processor**, and cover the international-transfer basis if any
  processing leaves the EU/EEA. Prefer an EU-resident aggregator + EU data
  region.
- **Consent.** The Connect action records `consented_at`, but confirm the
  consent wording and lawful basis with the DPO; wearable data is health data.
- **Keep it descriptive.** Do not add alerts/thresholds/scoring on top of this
  feed — that would change the intended purpose and risk MDR device
  classification.
- **Type regen.** After applying 0120 in Supabase, run `npm run gen:types`; it
  will reproduce the `wearable_connection` table + the two functions that were
  hand-added to `lib/database.types.ts` for this delivery.

## Validation done

Migration 0120 was validated in a throwaway Postgres 16 harness: link →
`connected` + id + timestamp; ingest 2 then re-ingest 0 (dedup); a non-enum
provider falls back to `other`; unknown/non-connected end-user → 0; revoke →
ingest 0 + `revoked_at` stamped; grants confirmed `authenticated`=false,
`service_role`=true for both functions. tsc 0, eslint 0, i18n parity, font-stub
build 108/108.
