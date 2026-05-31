import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import { writeAdminAudit } from '@/lib/supabase/adminAudit';

/**
 * Admin endpoint: grant or revoke the is_admin flag on an existing
 * account.
 *
 * Caller must themselves be an admin. The service-role client performs
 * the update so it isn't subject to the caller's own RLS.
 *
 * Request body: { profileId: string, isAdmin: boolean }
 * Response: { profileId, isAdmin }
 *
 * Guard rails:
 *   - a caller cannot remove their OWN admin flag (prevents an admin
 *     accidentally locking themselves out mid-session).
 *   - revoking the last remaining admin is refused, so the system can
 *     never end up with zero admins.
 */
export async function POST(req: NextRequest) {
  const anon = await createSupabaseServerClient();
  const { data: userResp } = await anon.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: callerProfile } = await anon
    .from('profile')
    .select('is_admin, role')
    .eq('id', userResp.user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.is_admin !== true) {
    return NextResponse.json(
      { error: 'Forbidden: admins only' },
      { status: 403 }
    );
  }

  let body: { profileId?: string; isAdmin?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const profileId = body.profileId;
  const isAdmin = body.isAdmin;
  if (!profileId || typeof isAdmin !== 'boolean') {
    return NextResponse.json(
      { error: 'profileId and isAdmin are required' },
      { status: 400 }
    );
  }

  // A caller may not revoke their own admin flag.
  if (profileId === userResp.user.id && isAdmin === false) {
    return NextResponse.json(
      { error: 'You cannot remove your own admin access.' },
      { status: 400 }
    );
  }

  const admin = createSupabaseServiceClient();

  // Refuse to remove the last admin in the system.
  if (isAdmin === false) {
    const { count } = await admin
      .from('profile')
      .select('id', { count: 'exact', head: true })
      .eq('is_admin', true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'At least one admin must remain.' },
        { status: 400 }
      );
    }
  }

  const { error: updErr } = await admin
    .from('profile')
    .update({ is_admin: isAdmin })
    .eq('id', profileId);

  if (updErr) {
    return NextResponse.json(
      { error: 'Could not update admin status.' },
      { status: 500 }
    );
  }

  await writeAdminAudit(
    admin,
    userResp.user.id,
    callerProfile.role,
    isAdmin ? 'admin_granted' : 'admin_revoked',
    'profile',
    profileId
  );

  return NextResponse.json({ profileId, isAdmin });
}
