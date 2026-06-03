import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/serviceClient';
import { DEV_SCENARIOS, type ScenarioRole } from '@/lib/dev/scenarios';

/**
 * DEV-ONLY. Backs the Scenarios launcher. Gated by the server env var
 * ENABLE_DEV_TOOLS — if it isn't '1', this route 404s, so it can never run
 * in production even if someone hits the URL.
 *
 * Two modes (body):
 *   { reseedOnly: true }                  -> just run dev_reseed_all().
 *   { scenarioId: string, reseed?: bool } -> optionally reseed, then return
 *       everything the client needs to land on the scenario's screen:
 *         - tokenHash: a magic-link token for the account to sign in as
 *           (the client calls verifyOtp with it).
 *         - landAs: 'patient' | 'clinician' | 'physio'.
 *         - visitCode: a reusable visit code for the patient (clinician/
 *           physio scenarios) so the client can call unlock_with_visit_code.
 *         - patientId: the demo patient's id (for reference).
 *
 * Everything uses the service-role client, which bypasses RLS — acceptable
 * because the route is dev-gated and only ever touches the test accounts.
 */

function isEnabled(): boolean {
  return process.env.ENABLE_DEV_TOOLS === '1';
}

function randomCode(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function POST(req: NextRequest) {
  if (!isEnabled()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: { scenarioId?: string; reseed?: boolean; reseedOnly?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const svc = createSupabaseServiceClient();

  // Reset-only: just rebuild the demo data.
  if (body.reseedOnly) {
    const { error } = await svc.rpc('dev_reseed_all');
    if (error) {
      return NextResponse.json(
        { error: `Reseed failed: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  const scenario = DEV_SCENARIOS.find((s) => s.id === body.scenarioId);
  if (!scenario) {
    return NextResponse.json({ error: 'Unknown scenario' }, { status: 400 });
  }

  if (body.reseed) {
    const { error } = await svc.rpc('dev_reseed_all');
    if (error) {
      return NextResponse.json(
        { error: `Reseed failed: ${error.message}` },
        { status: 500 }
      );
    }
  }

  // 1. Which account do we sign in as?
  let signInEmail: string;
  if (scenario.landAs === 'patient') {
    signInEmail = scenario.patientEmail;
  } else {
    const role: string =
      scenario.landAs === 'physio' ? 'physiotherapist' : 'clinician';
    const { data: acct, error: acctErr } = await svc
      .from('profile')
      .select('email')
      .eq('role', role)
      .order('email', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (acctErr) {
      return NextResponse.json({ error: acctErr.message }, { status: 500 });
    }
    if (!acct?.email) {
      return NextResponse.json(
        { error: `No ${role} account exists — create one first.` },
        { status: 409 }
      );
    }
    signInEmail = acct.email as string;
  }

  // 2. Mint a sign-in token for that account.
  const { data: link, error: linkErr } = await svc.auth.admin.generateLink({
    type: 'magiclink',
    email: signInEmail
  });
  const tokenHash = link?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json(
      { error: linkErr?.message ?? 'Could not generate sign-in token' },
      { status: 500 }
    );
  }

  // 3. For professional scenarios, mint a reusable visit code so the client
  //    can open a session for the patient via the real unlock RPC.
  let visitCode: string | null = null;
  let patientId: string | null = null;
  if (scenario.landAs !== 'patient') {
    const { data: prof } = await svc
      .from('profile')
      .select('id')
      .eq('email', scenario.patientEmail)
      .maybeSingle();
    if (!prof?.id) {
      return NextResponse.json(
        { error: `Patient account ${scenario.patientEmail} is missing.` },
        { status: 409 }
      );
    }
    const { data: pat } = await svc
      .from('patient')
      .select('id')
      .eq('profile_id', prof.id)
      .maybeSingle();
    if (!pat?.id) {
      return NextResponse.json(
        { error: 'Patient row missing — run "Reset demo data" first.' },
        { status: 409 }
      );
    }
    patientId = pat.id as string;
    visitCode = randomCode();
    const { error: vcErr } = await svc.from('visit_code').insert({
      code: visitCode,
      patient_id: patientId,
      expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      is_reusable: true
    });
    if (vcErr) {
      return NextResponse.json(
        { error: `Could not create visit code: ${vcErr.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    tokenHash,
    landAs: scenario.landAs as ScenarioRole,
    visitCode,
    patientId,
    signInEmail
  });
}
