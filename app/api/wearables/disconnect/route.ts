import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deauthorize, isAggregatorConfigured } from '@/lib/wearables/aggregator';

export const runtime = 'nodejs';

/**
 * POST /api/wearables/disconnect  { connectionId: string }
 *
 * The signed-in patient revokes a link. RLS guarantees they can only update
 * their own connection. We mark it revoked locally (source of truth) and make
 * a best-effort deauthorize call to the aggregator.
 */
export async function POST(req: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let connectionId = '';
  try {
    const body = (await req.json()) as { connectionId?: string };
    connectionId = body?.connectionId ?? '';
  } catch {
    /* handled below */
  }
  if (!connectionId) {
    return NextResponse.json({ error: 'connectionId required' }, { status: 400 });
  }

  // Read the aggregator id first (for best-effort remote revoke); RLS scopes
  // this to the patient's own rows.
  const { data: conn } = await supabase
    .from('wearable_connection')
    .select('aggregator_user_id')
    .eq('id', connectionId)
    .maybeSingle();

  const { error } = await supabase
    .from('wearable_connection')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('id', connectionId);
  if (error) {
    return NextResponse.json({ error: 'Could not disconnect' }, { status: 500 });
  }

  if (isAggregatorConfigured() && conn?.aggregator_user_id) {
    await deauthorize(conn.aggregator_user_id);
  }

  return NextResponse.json({ ok: true });
}
