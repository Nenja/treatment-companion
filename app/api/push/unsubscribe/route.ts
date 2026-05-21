import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Remove a push subscription. The caller passes the endpoint URL;
 * we delete the matching row. RLS ensures the user can only delete
 * their own.
 */
export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  let body: { endpoint?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body.endpoint) {
    return NextResponse.json(
      { error: 'endpoint required' },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from('push_subscription')
    .delete()
    .eq('endpoint', body.endpoint);

  if (error) {
    return NextResponse.json(
      { error: 'Failed to remove subscription', detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
