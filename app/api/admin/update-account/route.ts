import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import type { TablesUpdate } from '@/lib/database.types';

/**
 * Admin endpoint: edit an existing account's display name and (for
 * therapist accounts) profession.
 *
 * DELIBERATELY does NOT change role. Role determines which
 * role-specific rows exist (a `patient` row, or a `clinician` row) and
 * what clinical data can attach to the account. Switching a role after
 * the fact — especially patient <-> professional — risks orphaning
 * cycles, check-ins, or sessions. For a pilot the safe path is to
 * deactivate a wrong-role account and create a fresh one, so role is
 * intentionally read-only here.
 *
 * Caller must be an admin.
 *
 * Request body:
 *   { profileId: string,
 *     displayName: string,
 *     profession?: string | null,
 *     professionOther?: string | null }
 * Response: { profileId }
 */
export async function POST(req: NextRequest) {
  const anon = await createSupabaseServerClient();
  const { data: userResp } = await anon.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }

  const { data: callerProfile } = await anon
    .from('profile')
    .select('is_admin')
    .eq('id', userResp.user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.is_admin !== true) {
    return NextResponse.json(
      { error: 'Forbidden: admins only' },
      { status: 403 }
    );
  }

  let body: {
    profileId?: string;
    displayName?: string;
    profession?: string | null;
    professionOther?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const profileId = body.profileId;
  const displayName = (body.displayName ?? '').trim();
  if (!profileId || displayName.length === 0) {
    return NextResponse.json(
      { error: 'profileId and a non-empty displayName are required' },
      { status: 400 }
    );
  }
  if (displayName.length > 80) {
    return NextResponse.json(
      { error: 'Name is too long.' },
      { status: 400 }
    );
  }

  const admin = createSupabaseServiceClient();

  // Read the target's role — profession only applies to therapists.
  const { data: target } = await admin
    .from('profile')
    .select('role')
    .eq('id', profileId)
    .maybeSingle();
  if (!target) {
    return NextResponse.json(
      { error: 'Account not found.' },
      { status: 404 }
    );
  }

  const patch: TablesUpdate<'profile'> = { display_name: displayName };

  if (target.role === 'physiotherapist') {
    // Profession is editable for therapist accounts.
    const profession = body.profession ?? null;
    const professionOther =
      body.profession === 'other'
        ? (body.professionOther ?? '').trim() || null
        : null;
    if (body.profession === 'other' && !professionOther) {
      return NextResponse.json(
        { error: 'Describe the profession when choosing "Other".' },
        { status: 400 }
      );
    }
    patch.profession = profession;
    patch.profession_other = professionOther;
  }

  const { error: updErr } = await admin
    .from('profile')
    .update(patch)
    .eq('id', profileId);
  if (updErr) {
    return NextResponse.json(
      { error: 'Could not update the account.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ profileId });
}
