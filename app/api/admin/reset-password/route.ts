import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import { generateTempPassword } from '@/lib/supabase/admin';
import { writeAdminAudit } from '@/lib/supabase/adminAudit';

/**
 * Admin endpoint: reset an account's password to a fresh temporary one.
 *
 * Caller must be an admin. The service-role client sets a new random
 * temporary password on the auth user and flags the profile so the
 * account is routed through the set-password screen on next login.
 *
 * This mirrors account creation: rather than depend on a working
 * production email pipeline (still pending), the admin is given the
 * new temporary password to share with the user, who then replaces it
 * with one of their own. When email is configured, this could instead
 * trigger a recovery email — the contract (admin triggers, user must
 * change) stays the same.
 *
 * Request body:  { profileId: string }
 * Response:      { profileId, tempPassword }
 * Errors: 401 not signed in, 403 not admin, 400 validation, 500 other.
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

  let body: { profileId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const profileId = body.profileId;
  if (!profileId) {
    return NextResponse.json(
      { error: 'profileId is required' },
      { status: 400 }
    );
  }

  const admin = createSupabaseServiceClient();
  const tempPassword = generateTempPassword();

  const { error: authErr } = await admin.auth.admin.updateUserById(profileId, {
    password: tempPassword
  });
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  // Route the account through the set-password screen on next login.
  const { error: profileErr } = await admin
    .from('profile')
    .update({ must_change_password: true })
    .eq('id', profileId);
  if (profileErr) {
    return NextResponse.json(
      {
        error: 'Password reset, but failed to flag the account. Try again.',
        detail: profileErr.message
      },
      { status: 500 }
    );
  }

  await writeAdminAudit(
    admin,
    userResp.user.id,
    callerProfile.role,
    'admin_password_reset',
    'profile',
    profileId
  );

  return NextResponse.json({ profileId, tempPassword });
}
