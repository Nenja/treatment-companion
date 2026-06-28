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
    .select('is_admin')
    .eq('id', userResp.user.id)
    .maybeSingle();

  if (!callerProfile || callerProfile.is_admin !== true) {
    return NextResponse.json(
      { error: 'Forbidden: admins only' },
      { status: 403 }
    );
  }

  const admin = createSupabaseServiceClient();
  const { data, error } = await admin
    .from('profile')
    .select(
      // patient(id) is an embedded reverse lookup: patient.profile_id -> profile.id
      // (unique, so at most one). Lets the admin panel surface the patient RECORD
      // id (distinct from this profile id) for things like questionnaire assignment.
      'id, email, display_name, role, is_admin, created_at, deactivated_at, profession, profession_other, patient(id)'
    )
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: 'Failed to list profiles', detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    accounts: (data ?? []).map((p) => {
      // Embedded patient may arrive as an object or a single-element array
      // depending on how PostgREST resolves the to-one relationship.
      const pat = (p as { patient?: { id: string } | { id: string }[] | null })
        .patient;
      const patientId = Array.isArray(pat) ? (pat[0]?.id ?? null) : (pat?.id ?? null);
      return {
        id: p.id as string,
        email: p.email as string,
        displayName: (p.display_name as string | null) ?? '',
        role: p.role as string,
        isAdmin: Boolean(p.is_admin),
        createdAt: p.created_at as string,
        deactivatedAt: (p.deactivated_at as string | null) ?? null,
        profession: (p.profession as string | null) ?? null,
        professionOther: (p.profession_other as string | null) ?? null,
        patientId
      };
    })
  });
}
