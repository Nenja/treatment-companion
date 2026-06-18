import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/version';

/**
 * Liveness endpoint for an external uptime monitor (UptimeRobot / Better Uptime
 * / Vercel monitoring). Deliberately cheap and dependency-free: it confirms the
 * app process is up and serving, and reports the build version. It does NOT hit
 * the database — a liveness probe shouldn't fail (or page someone) because of a
 * transient DB blip; add a separate /api/health/deep later if a readiness probe
 * is wanted.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(
    { status: 'ok', version: APP_VERSION, time: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
