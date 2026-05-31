import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';

/**
 * Admin endpoint: list currently-active access sessions.
 *
 * Access to a patient's record happens through a `clinician_session`:
 * a clinician or therapist opens a patient via a visit code, and that
 * session stays active until it ends or times out (1-hour inactivity).
 * This endpoint surfaces, for an admin or auditor, *who currently has
 * access to whom* — the live answer to "who can see patient data right
 * now", which the account list alone does not show.
 *
 * Read-only. Caller must be an admin. Uses the service-role client to
 * read across all sessions (RLS would otherwise scope to the caller).
 *
 * Response: { sessions: [{ sessionId, professionalName, professionalRole,
 *             patientName, startedAt, lastActivityAt }] }
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

  // Active sessions: not ended, and within the 1-hour activity window
  // that the database itself enforces for access.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: sessions, error: sessErr } = await admin
    .from('clinician_session')
    .select('id, clinician_id, patient_id, started_at, last_activity_at')
    .is('ended_at', null)
    .gt('last_activity_at', cutoff)
    .order('last_activity_at', { ascending: false });

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  // Resolve clinician + patient names. clinician/patient rows link to
  // profile via profile_id; we map ids → profile in two small queries.
  const clinicianIds = [...new Set(sessions.map((s) => s.clinician_id))];
  const patientIds = [...new Set(sessions.map((s) => s.patient_id))];

  const [{ data: clinicians }, { data: patients }] = await Promise.all([
    admin.from('clinician').select('id, profile_id').in('id', clinicianIds),
    admin.from('patient').select('id, profile_id').in('id', patientIds)
  ]);

  const profileIds = [
    ...new Set([
      ...(clinicians ?? []).map((c) => c.profile_id),
      ...(patients ?? []).map((p) => p.profile_id)
    ])
  ];
  const { data: profiles } = await admin
    .from('profile')
    .select('id, display_name, role')
    .in('id', profileIds);

  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, p])
  );
  const clinicianProfile = new Map(
    (clinicians ?? []).map((c) => [c.id, profileById.get(c.profile_id)])
  );
  const patientProfile = new Map(
    (patients ?? []).map((p) => [p.id, profileById.get(p.profile_id)])
  );

  const result = sessions.map((s) => {
    const cp = clinicianProfile.get(s.clinician_id);
    const pp = patientProfile.get(s.patient_id);
    return {
      sessionId: s.id,
      professionalName: cp?.display_name ?? '(unknown)',
      professionalRole: cp?.role ?? 'clinician',
      patientName: pp?.display_name ?? '(unknown)',
      startedAt: s.started_at,
      lastActivityAt: s.last_activity_at
    };
  });

  return NextResponse.json({ sessions: result });
}
