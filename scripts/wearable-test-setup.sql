-- wearable-test-setup.sql
-- Level-A wearable test scaffolding. Run in the Supabase SQL editor on the
-- SAME project your PREVIEW deploy points at. Test data only (pre-pilot).

-- 1. Find your own test patient id ------------------------------------------
select p.id as patient_id, pr.email, p.created_at
from patient p
join profile pr on pr.id = p.profile_id
order by p.created_at desc;
-- copy your patient id, then use it below.

-- 2. Create a CONNECTED test connection -------------------------------------
-- aggregator + aggregator_user_id MUST match the console snippet's CONFIG and
-- the WEARABLES_AGGREGATOR env var. provider='garmin' forces observation.source
-- to 'garmin'. metrics = the allowlist the webhook filters against.
insert into wearable_connection
  (patient_id, aggregator, provider, aggregator_user_id, status, metrics,
   consented_at, connected_at)
values
  ('PASTE_YOUR_PATIENT_ID', 'garmin-test', 'garmin', 'garmin-test-me', 'connected',
   array['steps','heart_rate','resting_heart_rate','sleep_duration'],
   now(), now())
on conflict (patient_id, provider) do update
  set status             = 'connected',
      aggregator         = excluded.aggregator,
      aggregator_user_id = excluded.aggregator_user_id,
      metrics            = excluded.metrics,
      connected_at       = now();

-- 3. (OPTIONAL) DB-layer-only test, skipping the HTTP/signature path ---------
-- The SQL editor runs as a superuser, so it can call the service-role RPC
-- directly. This proves patient resolution + dedup + source forcing. Use your
-- real Garmin values; codes are LOINC (resting HR 40443-4, steps 55423-8).
select ingest_wearable_observations(
  'garmin-test', 'garmin-test-me',
  '[{"code":"40443-4","display":"resting_heart_rate","value_numeric":52,"unit":"bpm","effective_time":"2026-06-29T07:00:00Z","external_id":"sql-1"},
    {"code":"55423-8","display":"steps","value_numeric":8243,"unit":"steps","effective_time":"2026-06-29T00:00:00Z","external_id":"sql-2"}]'::jsonb
) as rows_ingested;

-- 4. VERIFY what landed (run after the console snippet and/or step 3) --------
select source, code, display, value_numeric, unit, effective_time, external_id, created_at
from observation
where patient_id = 'PASTE_YOUR_PATIENT_ID'
order by created_at desc
limit 50;

-- last_sync_at should have advanced; metrics is the active allowlist.
select aggregator, provider, status, metrics, last_sync_at
from wearable_connection
where patient_id = 'PASTE_YOUR_PATIENT_ID';

-- Re-running the same payload should ingest 0 new rows (dedup on
-- patient+source+code+effective_time+external_id) — that's the idempotency check.

-- 5. CLEANUP after testing ---------------------------------------------------
-- delete from observation
--   where patient_id = 'PASTE_YOUR_PATIENT_ID' and source = 'garmin';
-- delete from wearable_connection
--   where patient_id = 'PASTE_YOUR_PATIENT_ID' and aggregator = 'garmin-test';
