import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  aggregatorConfig,
  createConnectSession,
  isAggregatorConfigured
} from '@/lib/wearables/aggregator';

export const runtime = 'nodejs';

/**
 * POST /api/wearables/connect  { provider?: string }
 *
 * The signed-in patient consents to link a wearable. We record a 'pending'
 * connection (consent is this action), ask the aggregator for a hosted
 * connect URL (passing our connection id as the reference), and return it for
 * the client to redirect to. The link is confirmed later by the auth webhook.
 */
export async function POST(req: Request) {
  if (!isAggregatorConfigured()) {
    return NextResponse.json(
      { error: 'Wearables are not configured' },
      { status: 503 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: patientRow } = await supabase
    .from('patient')
    .select('id')
    .eq('profile_id', userResp.user.id)
    .maybeSingle();
  if (!patientRow) {
    return NextResponse.json(
      { error: 'Only patients can connect a wearable' },
      { status: 403 }
    );
  }

  const cfg = aggregatorConfig();
  let provider = cfg.defaultProvider;
  try {
    const body = (await req.json()) as { provider?: string };
    if (body?.provider) provider = body.provider;
  } catch {
    /* no body → default provider */
  }

  // Upsert the connection (re-connecting reuses the row, reset to pending).
  const { data: conn, error: upsertErr } = await supabase
    .from('wearable_connection')
    .upsert(
      {
        patient_id: patientRow.id,
        aggregator: cfg.aggregator,
        provider,
        status: 'pending',
        consented_at: new Date().toISOString(),
        connected_at: null,
        revoked_at: null
      },
      { onConflict: 'patient_id,provider' }
    )
    .select('id')
    .single();
  if (upsertErr || !conn) {
    return NextResponse.json(
      { error: 'Could not start the connection' },
      { status: 500 }
    );
  }

  try {
    const redirectUrl = new URL(
      '/profile?wearable=connected',
      new URL(req.url).origin
    ).toString();
    const { url } = await createConnectSession({
      connectionId: conn.id,
      provider,
      redirectUrl
    });
    return NextResponse.json({ url });
  } catch {
    return NextResponse.json(
      { error: 'Aggregator did not return a connect link' },
      { status: 502 }
    );
  }
}
