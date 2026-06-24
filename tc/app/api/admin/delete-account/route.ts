import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import { writeAdminAudit } from '@/lib/supabase/adminAudit';

/**
 * Admin endpoint: PERMANENTLY delete an account. Destructive and
 * irreversible — prefer deactivation in almost all cases.
 *
 * What gets destroyed: deleting the profile row cascades through the
 * foreign keys — a patient account takes its `patient` row and ALL of
 * that patient's treatment cycles, treatments, goals, and weekly
 * check-ins with it. A professional account takes its `clinician`
 * row. The auth user is deleted too, so the email can be reused.
 *
 * What is kept: audit_event rows reference the actor with ON DELETE
 * SET NULL — so the audit trail itself survives, but the deleted
 * person's actions become attributed to "no longer in system".
 *
 * Caller must be an admin. Guard rails:
 *   - you cannot delete your own account
 *   - the last remaining admin cannot be deleted
 *   - the request must include confirm: true (a deliberate extra step;
 *     the UI also has its own typed confirmation).
 *
 * Request body: { profileId: string, confirm: true }
 * Response: { profileId, deleted: true }
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

  let body: { profileId?: string; confirm?: boolean };
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
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: 'Deletion must be explicitly confirmed.' },
      { status: 400 }
    );
  }

  // You cannot delete your own account.
  if (profileId === userResp.user.id) {
    return NextResponse.json(
      { error: 'You cannot delete your own account.' },
      { status: 400 }
    );
  }

  const admin = createSupabaseServiceClient();

  // Refuse to delete the last admin.
  const { data: target } = await admin
    .from('profile')
    .select('is_admin')
    .eq('id', profileId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: 'Account not found.' },
      { status: 404 }
    );
  }
  if (target.is_admin === true) {
    const { count } = await admin
      .from('profile')
      .select('id', { count: 'exact', head: true })
      .eq('is_admin', true);
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'The last admin cannot be deleted.' },
        { status: 400 }
      );
    }
  }

  // Delete the profile row first. FK cascades remove the patient /
  // clinician row and everything downstream.
  const { error: profErr } = await admin
    .from('profile')
    .delete()
    .eq('id', profileId);
  if (profErr) {
    return NextResponse.json(
      { error: 'Could not delete the account data.', detail: profErr.message },
      { status: 500 }
    );
  }

  // Then delete the auth user, so the email can be reused. If this
  // fails the profile is already gone; report it so the admin knows
  // a stray auth user may remain.
  const { error: authErr } = await admin.auth.admin.deleteUser(profileId);
  if (authErr) {
    return NextResponse.json(
      {
        error:
          'Account data deleted, but the sign-in user may remain. Contact support if the email cannot be reused.'
      },
      { status: 500 }
    );
  }

  await writeAdminAudit(
    admin,
    userResp.user.id,
    callerProfile.role,
    'admin_account_deleted',
    'profile',
    profileId
  );

  return NextResponse.json({ profileId, deleted: true });
}
