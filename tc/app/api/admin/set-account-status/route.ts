import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import { writeAdminAudit } from '@/lib/supabase/adminAudit';

/**
 * Admin endpoint: deactivate or reactivate an account.
 *
 * Deactivation is the safe, REVERSIBLE way to take an account out of
 * use — nothing is deleted. It does two things:
 *   - sets profile.deactivated_at (a timestamp, or null to reactivate)
 *   - bans / un-bans the Supabase auth user, so a deactivated account
 *     genuinely cannot sign in.
 *
 * Caller must be an admin. Guard rails mirror set-admin:
 *   - you cannot deactivate your own account (lock-out protection)
 *   - the last remaining ACTIVE admin cannot be deactivated.
 *
 * Request body: { profileId: string, deactivate: boolean }
 * Response: { profileId, deactivated: boolean }
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

  let body: { profileId?: string; deactivate?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const profileId = body.profileId;
  const deactivate = body.deactivate;
  if (!profileId || typeof deactivate !== 'boolean') {
    return NextResponse.json(
      { error: 'profileId and deactivate are required' },
      { status: 400 }
    );
  }

  // A caller may not deactivate their own account.
  if (profileId === userResp.user.id && deactivate) {
    return NextResponse.json(
      { error: 'You cannot deactivate your own account.' },
      { status: 400 }
    );
  }

  const admin = createSupabaseServiceClient();

  // Refuse to deactivate the last active admin.
  if (deactivate) {
    const { data: target } = await admin
      .from('profile')
      .select('is_admin')
      .eq('id', profileId)
      .maybeSingle();
    if (target?.is_admin === true) {
      const { count } = await admin
        .from('profile')
        .select('id', { count: 'exact', head: true })
        .eq('is_admin', true)
        .is('deactivated_at', null);
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: 'At least one active admin must remain.' },
          { status: 400 }
        );
      }
    }
  }

  // Update the profile flag.
  const { error: updErr } = await admin
    .from('profile')
    .update({ deactivated_at: deactivate ? new Date().toISOString() : null })
    .eq('id', profileId);
  if (updErr) {
    return NextResponse.json(
      { error: 'Could not update the account.' },
      { status: 500 }
    );
  }

  // Ban / un-ban the auth user so a deactivated account cannot sign
  // in. A long ban duration acts as an indefinite block; 'none'
  // lifts it on reactivation.
  const { error: authErr } = await admin.auth.admin.updateUserById(
    profileId,
    { ban_duration: deactivate ? '876000h' : 'none' } // ~100 years
  );
  if (authErr) {
    // The profile flag is already set; report the partial failure so
    // the admin knows sign-in blocking may not have applied.
    return NextResponse.json(
      {
        error:
          'Account flag updated, but sign-in block may not have applied. Try again.'
      },
      { status: 500 }
    );
  }

  await writeAdminAudit(
    admin,
    userResp.user.id,
    callerProfile.role,
    deactivate ? 'admin_account_deactivated' : 'admin_account_reactivated',
    'profile',
    profileId
  );

  return NextResponse.json({ profileId, deactivated: deactivate });
}
