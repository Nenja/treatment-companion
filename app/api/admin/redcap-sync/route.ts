import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import { writeAdminAudit } from '@/lib/supabase/adminAudit';
import { runRedcapSync } from '@/lib/redcap/runSync';
import { rateLimit } from '@/lib/rateLimit';

/**
 * Admin trigger: push the research dataset to REDCap now.
 *
 * Caller must be a signed-in admin (same gate as the other admin routes:
 * verify the session cookie, then profile.is_admin). The work runs through
 * the service-role client + the REDCap API token (server-only env vars).
 *
 * Response: the sync summary { patients, rows, configured, chunks, imported,
 * errors }. 200 clean, 207 if some chunks errored, 400 if REDCap isn't
 * configured, 401/403 auth, 500 otherwise.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // large snapshots; effective limit depends on plan

export async function POST(_req: NextRequest) {
  const anon = await createSupabaseServerClient();
  const { data: userResp } = await anon.auth.getUser();
  if (!userResp.user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  }
  const { data: caller } = await anon
    .from('profile')
    .select('is_admin, role')
    .eq('id', userResp.user.id)
    .maybeSingle();
  if (!caller || caller.is_admin !== true) {
    return NextResponse.json({ error: 'Forbidden: admins only' }, { status: 403 });
  }

  // A full sync is expensive; cap how often one admin can trigger it.
  const rl = rateLimit(`redcap-sync:${userResp.user.id}`, 5, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many sync attempts — please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    );
  }

  if (!process.env.REDCAP_API_URL || !process.env.REDCAP_API_TOKEN) {
    return NextResponse.json(
      { error: 'REDCap is not configured (set REDCAP_API_URL and REDCAP_API_TOKEN in Vercel).' },
      { status: 400 }
    );
  }

  try {
    const summary = await runRedcapSync();
    const svc = createSupabaseServiceClient();
    await writeAdminAudit(
      svc,
      userResp.user.id,
      caller.role ?? 'clinician',
      'redcap_sync',
      'study',
      'redcap',
      {
        trigger: 'admin',
        patients: summary.patients,
        rows: summary.rows,
        imported: summary.imported,
        chunks: summary.chunks,
        errorCount: summary.errors.length
      }
    );
    return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? 'REDCap sync failed' },
      { status: 500 }
    );
  }
}
