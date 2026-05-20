import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';

/**
 * Admin endpoint: list all profiles in the system.
 *
 * Caller must be a signed-in clinician. Uses the service-role client
 * to read the full profile table (RLS would otherwise restrict the
 * clinician to seeing patients they have an active session with).
 *
 * Response: { accounts: [{ id, email, displayName, role, createdAt }] }
 */
export async function GET() {
  const anon = await createSupabaseServerClient();
  const { data: userResp } = await anon.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: callerProfile } = await anon
    .from('profile')
    .select('role')
    .eq('id', userResp.user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.role !== 'clinician') {
    return NextResponse.json(
      { error: 'Forbidden: clinicians only' },
      { status: 403 }
    );
  }

  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from('profile')
    .select('id, email, display_name, role, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to list profiles', detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    accounts: (data ?? []).map((p) => ({
      id: p.id as string,
      email: p.email as string,
      displayName: (p.display_name as string | null) ?? '',
      role: p.role as string,
      createdAt: p.created_at as string
    }))
  });
}
