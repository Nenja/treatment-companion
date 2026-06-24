import { NextRequest, NextResponse } from 'next/server';
import { runRedcapSync } from '@/lib/redcap/runSync';

/**
 * Scheduled trigger: Vercel Cron calls this on a schedule (see vercel.json).
 *
 * Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET
 * env var is set; we require it so the endpoint can't be invoked by anyone
 * else. No user session here (the scheduler has none) — auth is the secret.
 *
 * Runs the same full-snapshot sync as the admin button.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.REDCAP_API_URL || !process.env.REDCAP_API_TOKEN) {
    return NextResponse.json(
      { error: 'REDCap is not configured (set REDCAP_API_URL and REDCAP_API_TOKEN in Vercel).' },
      { status: 400 }
    );
  }
  try {
    const summary = await runRedcapSync();
    return NextResponse.json(summary, { status: summary.errors.length ? 207 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error)?.message ?? 'REDCap sync failed' },
      { status: 500 }
    );
  }
}
