import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import {
  WEBHOOK_SIGNATURE_HEADER,
  aggregatorConfig,
  isAggregatorConfigured,
  parseWebhookEvents,
  verifyWebhookSignature
} from '@/lib/wearables/aggregator';
import { toObservationElements } from '@/lib/wearables/normalize';
import type { Json } from '@/lib/database.types';

export const runtime = 'nodejs';

/**
 * POST /api/wearables/webhook
 *
 * The aggregator's server-to-server callback. We verify the HMAC signature
 * over the raw body, then route events:
 *   - auth   → mark the connection connected/error + store the aggregator id
 *   - deauth → mark the connection revoked
 *   - data   → normalize samples and ingest into `observation`
 *
 * All writes use the service role via the SECURITY DEFINER RPCs (0120), which
 * authorize by the connection mapping, not a user session. We always ack 2xx
 * after a valid signature so the aggregator doesn't retry indefinitely.
 */
export async function POST(req: Request) {
  if (!isAggregatorConfigured()) {
    return NextResponse.json({ error: 'not configured' }, { status: 503 });
  }

  const raw = await req.text();
  const signature = req.headers.get(WEBHOOK_SIGNATURE_HEADER);
  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const events = parseWebhookEvents(payload);
  const cfg = aggregatorConfig();
  const supabase = createSupabaseServiceClient();
  let ingested = 0;

  for (const event of events) {
    if (event.kind === 'auth') {
      await supabase.rpc('set_wearable_connection_status', {
        p_connection_id: event.connectionId,
        p_aggregator_user_id: event.aggregatorUserId,
        p_status: event.status
      });
    } else if (event.kind === 'deauth') {
      const { data: conn } = await supabase
        .from('wearable_connection')
        .select('id')
        .eq('aggregator', cfg.aggregator)
        .eq('aggregator_user_id', event.aggregatorUserId)
        .maybeSingle();
      if (conn) {
        await supabase.rpc('set_wearable_connection_status', {
          p_connection_id: conn.id,
          p_aggregator_user_id: '',
          p_status: 'revoked'
        });
      }
    } else if (event.kind === 'data') {
      const elements = toObservationElements(event.samples);
      if (elements.length === 0) continue;
      const { data: n } = await supabase.rpc('ingest_wearable_observations', {
        p_aggregator: cfg.aggregator,
        p_aggregator_user_id: event.aggregatorUserId,
        p_observations: elements as unknown as Json
      });
      ingested += (n as number | null) ?? 0;
    }
  }

  return NextResponse.json({ ok: true, ingested });
}
