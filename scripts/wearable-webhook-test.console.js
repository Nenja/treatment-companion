/*
 * LEVEL-A WEARABLE TEST — simulate the aggregator's signed webhook with YOUR
 * own Garmin readings, with no aggregator account.
 *
 * HOW TO RUN (no local tooling):
 *   1. Deploy to a PREVIEW (not production) with these env vars set in Vercel
 *      for that environment:
 *        WEARABLES_API_BASE_URL   = https://example.invalid   (unused by webhook, any value)
 *        WEARABLES_API_KEY        = test                      (unused by webhook, any value)
 *        WEARABLES_WEBHOOK_SECRET = <pick a long random string>   <-- must match below
 *        WEARABLES_AGGREGATOR     = garmin-test                    <-- must match below + the SQL row
 *      (NEXT_PUBLIC_WEARABLES_ENABLED only affects the patient UI; the webhook
 *       just needs the three above so isAggregatorConfigured() is true.)
 *   2. Run scripts/wearable-test-setup.sql in the Supabase SQL editor first to
 *      create the CONNECTED test connection row for your own test patient.
 *   3. Open your preview URL, open DevTools (F12) -> Console, paste this whole
 *      file, edit CONFIG, press Enter. It signs + POSTs to /api/wearables/webhook.
 *   4. Check the response, then verify rows landed with the SQL in step 4 of the
 *      setup file.
 */
(async () => {
  const CONFIG = {
    webhookSecret: 'PASTE_THE_SAME_WEARABLES_WEBHOOK_SECRET',
    aggregator: 'garmin-test',          // must equal WEARABLES_AGGREGATOR + the SQL row's aggregator
    aggregatorUserId: 'garmin-test-me', // must equal the SQL row's aggregator_user_id

    // YOUR REAL GARMIN READINGS. `metric` must be one of:
    //   steps, heart_rate, resting_heart_rate, sleep_duration, hrv,
    //   spo2, respiration, stress, calories, distance
    // and must be present in the connection's `metrics` allowlist (see the SQL).
    // `start` is ISO-8601 UTC. `end` optional (for ranges like steps/sleep).
    samples: [
      { metric: 'resting_heart_rate', value: 52,   unit: 'bpm',   start: '2026-06-29T07:00:00Z' },
      { metric: 'heart_rate',         value: 71,   unit: 'bpm',   start: '2026-06-29T08:15:00Z' },
      { metric: 'steps',              value: 8243, unit: 'steps', start: '2026-06-29T00:00:00Z', end: '2026-06-29T23:59:59Z' },
      { metric: 'sleep_duration',     value: 462,  unit: 'min',   start: '2026-06-29T23:00:00Z', end: '2026-06-30T06:42:00Z' },
    ],
  };

  const payload = {
    type: 'data',
    user_id: CONFIG.aggregatorUserId,
    data: CONFIG.samples.map((s, i) => ({
      metric: s.metric,
      value: s.value,
      unit: s.unit,
      start: s.start,
      end: s.end,
      id: s.id ?? `selftest-${Date.now()}-${i}`,  // external_id -> dedup key
      device: 'garmin-self-test',
    })),
  };

  // The signed bytes MUST equal the sent bytes, so sign the exact string we POST.
  const body = JSON.stringify(payload);

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(CONFIG.webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const sig = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

  const res = await fetch('/api/wearables/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-wearables-signature': sig },
    body,
  });

  let parsed;
  try { parsed = await res.json(); } catch { parsed = await res.text(); }
  console.log('[wearable-test] HTTP', res.status, parsed);
  if (res.status === 200) console.log('[wearable-test] ingested:', parsed.ingested, '— now run the verify SQL.');
  else console.warn('[wearable-test] not 200 — check: env vars set on THIS preview? secret matches? connection row CONNECTED with matching aggregator/aggregator_user_id?');
})();
