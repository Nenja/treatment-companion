import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Persist a push subscription for the signed-in user.
 *
 * The endpoint is unique per (browser, device). If the user subscribes
 * twice from the same browser (e.g. denied then later granted), we
 * upsert by endpoint so we don't accumulate duplicates.
 *
 * Body: { endpoint, p256dh, auth, locale }
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: {
    endpoint?: string;
    p256dh?: string;
    auth?: string;
    locale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.endpoint || !body.p256dh || !body.auth) {
    return NextResponse.json(
      { error: 'endpoint, p256dh, and auth are required' },
      { status: 400 }
    );
  }

  const locale = body.locale === 'da' ? 'da' : 'en';

  // Upsert by endpoint. If the same browser already subscribed (perhaps
  // under a different account), overwrite to point to the current user.
  const { error } = await supabase.from('push_subscription').upsert(
    {
      profile_id: userResp.user.id,
      endpoint: body.endpoint,
      p256dh: body.p256dh,
      auth: body.auth,
      locale,
      last_seen_at: new Date().toISOString()
    },
    { onConflict: 'endpoint' }
  );

  if (error) {
    return NextResponse.json(
      { error: 'Failed to save subscription', detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
