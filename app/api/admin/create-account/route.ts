import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';

/**
 * Admin endpoint: create a new patient or clinician account.
 *
 * Caller must be a signed-in clinician. We verify by reading the
 * caller's session cookie (anon client) and checking their profile
 * role. Once verified, the service-role client creates the auth user,
 * then explicitly updates the auto-created profile row's role and
 * display_name, and inserts the matching patient/clinician row.
 *
 * Request body:
 *   { role: 'patient' | 'clinician',
 *     email: string,
 *     displayName: string,
 *     tempPassword: string }
 *
 * Response: { profileId, email, role, displayName }
 *
 * Errors: 401 not signed in, 403 not a clinician, 400 validation,
 * 409 email already in use, 500 anything else.
 */
export async function POST(req: NextRequest) {
  // 1. Identify the caller from the session cookie.
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

  // 2. Parse + validate input.
  let body: {
    role?: string;
    email?: string;
    displayName?: string;
    tempPassword?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const role = body.role;
  const email = body.email?.trim().toLowerCase();
  const displayName = body.displayName?.trim();
  const tempPassword = body.tempPassword;

  if (role !== 'patient' && role !== 'clinician') {
    return NextResponse.json(
      { error: 'role must be "patient" or "clinician"' },
      { status: 400 }
    );
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 });
  }
  if (!displayName || displayName.length === 0) {
    return NextResponse.json(
      { error: 'displayName is required' },
      { status: 400 }
    );
  }
  if (!tempPassword || tempPassword.length < 8) {
    return NextResponse.json(
      { error: 'tempPassword must be at least 8 characters' },
      { status: 400 }
    );
  }

  // 3. Create the auth user with the service role client.
  const admin = createSupabaseServiceClient();
  const { data: createResp, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { display_name: displayName }
    });

  if (createErr) {
    // Supabase returns 'User already registered' for duplicate emails.
    const isDuplicate = /already (registered|exists)/i.test(createErr.message);
    return NextResponse.json(
      { error: createErr.message },
      { status: isDuplicate ? 409 : 500 }
    );
  }

  const newUserId = createResp.user?.id;
  if (!newUserId) {
    return NextResponse.json(
      { error: 'Auth user created but no id returned' },
      { status: 500 }
    );
  }

  // 4. The auth signup trigger creates a profile row with role 'patient'
  //    by default. Update its role + display_name to match the request.
  const { error: profileErr } = await admin
    .from('profile')
    .update({ role, display_name: displayName })
    .eq('id', newUserId);

  if (profileErr) {
    return NextResponse.json(
      {
        error: 'Created auth user but failed to update profile',
        detail: profileErr.message
      },
      { status: 500 }
    );
  }

  // 5. Insert the matching role-specific row.
  if (role === 'patient') {
    const { error: pErr } = await admin
      .from('patient')
      .insert({ profile_id: newUserId });
    if (pErr) {
      return NextResponse.json(
        { error: 'Failed to create patient row', detail: pErr.message },
        { status: 500 }
      );
    }
  } else {
    const { error: cErr } = await admin
      .from('clinician')
      .insert({ profile_id: newUserId });
    if (cErr) {
      return NextResponse.json(
        { error: 'Failed to create clinician row', detail: cErr.message },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    profileId: newUserId,
    email,
    role,
    displayName
  });
}
