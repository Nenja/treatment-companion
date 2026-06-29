import crypto from 'node:crypto';
import type { WearableEvent, WearableSample } from './types';

/**
 * ──────────────────────────────────────────────────────────────────────────
 *  AGGREGATOR ADAPTER — the only file that knows the aggregator's wire format.
 * ──────────────────────────────────────────────────────────────────────────
 *
 *  This is written to a REPRESENTATIVE EU-aggregator contract (the pattern
 *  Terra / Thryve / Vitalera / Rook all share: create a hosted connect
 *  session that returns a redirect URL; receive HMAC-signed webhooks carrying
 *  auth + data events). The exact endpoint paths, request/response field
 *  names, the signature header, and the webhook JSON shape WILL differ per
 *  vendor — reconcile this file against your chosen aggregator's live docs and
 *  set the env vars below. Nothing outside this file needs to change.
 *
 *  Server-only: imports node:crypto and reads secret env. Never import from a
 *  client component.
 *
 *  Env (Vercel, server-only unless prefixed NEXT_PUBLIC_):
 *    WEARABLES_AGGREGATOR        e.g. "thryve" — stored on each connection
 *    WEARABLES_API_BASE_URL      aggregator REST base, no trailing slash
 *    WEARABLES_API_KEY           server credential for REST calls
 *    WEARABLES_WEBHOOK_SECRET    shared secret for HMAC-SHA256 verification
 *    WEARABLES_PROVIDER_DEFAULT  default provider to connect, e.g. "garmin"
 */

export interface AggregatorConfig {
  aggregator: string;
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  defaultProvider: string;
}

export function isAggregatorConfigured(): boolean {
  return Boolean(
    process.env.WEARABLES_API_BASE_URL &&
      process.env.WEARABLES_API_KEY &&
      process.env.WEARABLES_WEBHOOK_SECRET
  );
}

export function aggregatorConfig(): AggregatorConfig {
  const baseUrl = process.env.WEARABLES_API_BASE_URL;
  const apiKey = process.env.WEARABLES_API_KEY;
  const webhookSecret = process.env.WEARABLES_WEBHOOK_SECRET;
  if (!baseUrl || !apiKey || !webhookSecret) {
    throw new Error('Wearables aggregator env vars are not configured');
  }
  return {
    aggregator: process.env.WEARABLES_AGGREGATOR || 'aggregator',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKey,
    webhookSecret,
    defaultProvider: process.env.WEARABLES_PROVIDER_DEFAULT || 'garmin'
  };
}

/**
 * Asks the aggregator for a hosted connect/authorization URL for one patient.
 * We pass our connection id as the reference so the aggregator echoes it back
 * on the auth webhook, letting us mark the right connection 'connected'.
 *
 * CONTRACT (adjust to your aggregator): POST {base}/connect/session with the
 * API key, body { provider, reference_id, redirect_url } → { url }.
 */
export async function createConnectSession(opts: {
  connectionId: string;
  provider: string;
  redirectUrl: string;
}): Promise<{ url: string }> {
  const cfg = aggregatorConfig();
  const res = await fetch(`${cfg.baseUrl}/connect/session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({
      provider: opts.provider,
      reference_id: opts.connectionId,
      redirect_url: opts.redirectUrl
    })
  });
  if (!res.ok) {
    throw new Error(`Aggregator connect session failed: ${res.status}`);
  }
  const data = (await res.json()) as Record<string, unknown>;
  const url = (data.url ?? data.connect_url ?? data.widget_url) as
    | string
    | undefined;
  if (!url) throw new Error('Aggregator connect session returned no URL');
  return { url };
}

/**
 * Tells the aggregator to revoke a link (best-effort; the local connection is
 * marked revoked regardless). CONTRACT: POST {base}/connect/disconnect.
 */
export async function deauthorize(aggregatorUserId: string): Promise<void> {
  const cfg = aggregatorConfig();
  await fetch(`${cfg.baseUrl}/connect/disconnect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify({ user_id: aggregatorUserId })
  }).catch(() => {
    /* best-effort; local revoke is the source of truth */
  });
}

/** The header the aggregator signs the webhook body with (adjust to docs). */
export const WEBHOOK_SIGNATURE_HEADER = 'x-wearables-signature';

/**
 * Verifies an HMAC-SHA256 signature over the raw request body, constant-time.
 * CONTRACT: signature is the hex digest of HMAC(secret, rawBody). Some
 * aggregators prefix the scheme ("sha256=") or sign a timestamp+body — adjust.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null
): boolean {
  if (!signature) return false;
  const cfg = aggregatorConfig();
  const provided = signature.replace(/^sha256=/i, '').trim();
  const expected = crypto
    .createHmac('sha256', cfg.webhookSecret)
    .update(rawBody, 'utf8')
    .digest('hex');
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Parses the aggregator's webhook JSON into internal events.
 *
 * CONTRACT (adjust to your aggregator's schema): the body is either a single
 * event object or { events: [...] }. Each event has a `type`:
 *   - "auth"   → { reference_id, user_id, status }     (link confirmed/failed)
 *   - "deauth" → { user_id }                           (user disconnected)
 *   - "data"   → { user_id, data: [{ metric, value, unit?, start, end?,
 *                  id?, device? }] }                    (measurements)
 * Unknown event types are ignored.
 */
export function parseWebhookEvents(payload: unknown): WearableEvent[] {
  const root = payload as Record<string, unknown> | null;
  if (!root || typeof root !== 'object') return [];
  const rawEvents = Array.isArray(root.events)
    ? (root.events as unknown[])
    : [root];

  const events: WearableEvent[] = [];
  for (const raw of rawEvents) {
    const e = raw as Record<string, unknown>;
    const type = String(e.type ?? '');
    const userId = String(e.user_id ?? e.aggregator_user_id ?? '');

    if (type === 'auth') {
      const connectionId = String(e.reference_id ?? e.reference ?? '');
      if (!connectionId) continue;
      const ok = String(e.status ?? 'connected') !== 'error';
      events.push({
        kind: 'auth',
        connectionId,
        aggregatorUserId: userId,
        status: ok ? 'connected' : 'error'
      });
    } else if (type === 'deauth' || type === 'disconnect') {
      if (!userId) continue;
      events.push({ kind: 'deauth', aggregatorUserId: userId });
    } else if (type === 'data') {
      if (!userId) continue;
      const data = Array.isArray(e.data) ? (e.data as unknown[]) : [];
      const samples: WearableSample[] = [];
      for (const d of data) {
        const s = d as Record<string, unknown>;
        const metric = String(s.metric ?? s.type ?? '');
        const value = Number(s.value);
        const start = String(s.start ?? s.timestamp ?? s.effective_time ?? '');
        if (!metric || !Number.isFinite(value) || !start) continue;
        samples.push({
          metric,
          value,
          unit: s.unit != null ? String(s.unit) : undefined,
          start,
          end: s.end != null ? String(s.end) : undefined,
          externalId: s.id != null ? String(s.id) : undefined,
          deviceLabel: s.device != null ? String(s.device) : undefined,
          raw: s
        });
      }
      events.push({ kind: 'data', aggregatorUserId: userId, samples });
    }
  }
  return events;
}
