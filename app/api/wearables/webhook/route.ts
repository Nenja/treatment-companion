import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import {
  WEBHOOK_SIGNATURE_HEADER,
  aggregatorConfig,
  isAggregatorConfigured,
  parseWebhookEvents,
  verifyWebhookSignature,
} from "@/lib/wearables/aggregator";
import { toObservationElements } from "@/lib/wearables/normalize";
import type { Json } from "@/lib/database.types";

export const runtime = "nodejs";

/** Reject bodies larger than this — a public endpoint shouldn't accept an
 *  unbounded payload. Generous for a normal sync batch; adjust if the
 *  aggregator sends larger batches (they usually paginate instead). */
const MAX_BODY_BYTES = 2_000_000;

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
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  // Reject oversized payloads early (header first, then the actual body).
  const declaredLength = Number(req.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

  const signature = req.headers.get(WEBHOOK_SIGNATURE_HEADER);
  if (!verifyWebhookSignature(raw, signature)) {
    // A request hitting this endpoint without a valid signature is worth
    // seeing (probing / misconfiguration). No body is logged.
    Sentry.captureMessage("wearable webhook: signature verification failed", {
      level: "warning",
    });
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    Sentry.captureMessage(
      "wearable webhook: invalid JSON after valid signature",
      {
        level: "warning",
      },
    );
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const events = parseWebhookEvents(payload);
  const cfg = aggregatorConfig();
  const supabase = createSupabaseServiceClient();
  let ingested = 0;

  try {
    for (const event of events) {
      if (event.kind === "auth") {
        await supabase.rpc("set_wearable_connection_status", {
          p_connection_id: event.connectionId,
          p_aggregator_user_id: event.aggregatorUserId,
          p_status: event.status,
        });
      } else if (event.kind === "deauth") {
        const { data: conn } = await supabase
          .from("wearable_connection")
          .select("id")
          .eq("aggregator", cfg.aggregator)
          .eq("aggregator_user_id", event.aggregatorUserId)
          .maybeSingle();
        if (conn) {
          await supabase.rpc("set_wearable_connection_status", {
            p_connection_id: conn.id,
            p_aggregator_user_id: "",
            p_status: "revoked",
          });
        }
      } else if (event.kind === "data") {
        // The connection's allowlist decides what we keep. Drop everything else
        // before it ever reaches the store (clinician choice + data-minimisation).
        const { data: conn } = await supabase
          .from("wearable_connection")
          .select("metrics")
          .eq("aggregator", cfg.aggregator)
          .eq("aggregator_user_id", event.aggregatorUserId)
          .eq("status", "connected")
          .maybeSingle();
        if (!conn) continue; // no live connection for this end-user
        const allow = new Set((conn.metrics as string[] | null) ?? []);
        if (allow.size === 0) continue; // nothing selected → import nothing
        const selected = event.samples.filter((s) => allow.has(s.metric));
        const elements = toObservationElements(selected);
        if (elements.length === 0) continue;
        const { data: n } = await supabase.rpc("ingest_wearable_observations", {
          p_aggregator: cfg.aggregator,
          p_aggregator_user_id: event.aggregatorUserId,
          p_observations: elements as unknown as Json,
        });
        ingested += (n as number | null) ?? 0;
      }
    }
  } catch (err) {
    // Idempotent writes (dedup + connection-keyed) make a retry safe, so a 5xx
    // lets the aggregator redeliver rather than dropping the batch silently.
    Sentry.captureException(err);
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ingested });
}
