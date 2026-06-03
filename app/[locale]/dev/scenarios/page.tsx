'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DEV_SCENARIOS } from '@/lib/dev/scenarios';

/**
 * DEV-ONLY scenario launcher. Pick a scenario → it (optionally) resets the
 * demo data, signs you in as the right account, opens the clinician session
 * where needed, and drops you on the screen. Gated by
 * NEXT_PUBLIC_ENABLE_DEV_TOOLS so it never appears in production builds; the
 * backing route is independently gated by ENABLE_DEV_TOOLS.
 */
export default function DevScenariosPage() {
  const router = useRouter();
  const locale = useLocale();
  const [resetFirst, setResetFirst] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const enabled = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === '1';

  const lp = (p: string) => (locale === 'en' ? p : `/${locale}${p}`);

  if (!enabled) {
    return (
      <main className="mx-auto max-w-[600px] px-5 py-16">
        <h1 className="font-display text-[24px] text-ink">Dev tools disabled</h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          Set <code>NEXT_PUBLIC_ENABLE_DEV_TOOLS=1</code> (and{' '}
          <code>ENABLE_DEV_TOOLS=1</code> on the server) to use the scenario
          launcher. Leave them unset in production.
        </p>
      </main>
    );
  }

  const launch = async (scenarioId: string) => {
    setError(null);
    setNote(null);
    setBusy(scenarioId);
    try {
      const res = await fetch('/api/dev/scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ scenarioId, reseed: resetFirst })
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Request failed (${res.status})`);
        return;
      }
      const supabase = createSupabaseBrowserClient();
      // Drop any current session so we sign in cleanly as the test account.
      await supabase.auth.signOut();
      const { error: vErr } = await supabase.auth.verifyOtp({
        token_hash: j.tokenHash,
        type: 'magiclink'
      });
      if (vErr) {
        setError(`Sign-in failed: ${vErr.message}`);
        return;
      }
      if (j.landAs === 'patient') {
        router.push(lp('/'));
        return;
      }
      const { error: uErr } = await supabase.rpc('unlock_with_visit_code', {
        p_code: j.visitCode
      });
      if (uErr) {
        setError(`Unlock failed: ${uErr.message}`);
        return;
      }
      router.push(lp(j.landAs === 'physio' ? '/physio/patient' : '/clinician/patient'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  const resetOnly = async () => {
    setError(null);
    setNote(null);
    setBusy('__reset__');
    try {
      const res = await fetch('/api/dev/scenario', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reseedOnly: true })
      });
      const j = await res.json();
      if (!res.ok) {
        setError(j.error ?? `Request failed (${res.status})`);
        return;
      }
      setNote('Demo data reset.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto max-w-[680px] px-5 py-10">
      <h1 className="font-display text-[26px] leading-tight text-ink">
        Scenarios (dev)
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Pick a scenario to reset the data (optional), sign in as the right
        account, and land on the screen — no visit codes or clicking around.
        Demo accounts and at least one clinician must already exist.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={resetFirst}
            onChange={(e) => setResetFirst(e.target.checked)}
            className="h-4 w-4"
          />
          Reset all demo data before launching
        </label>
        <button
          type="button"
          onClick={resetOnly}
          disabled={busy !== null}
          className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-60"
        >
          {busy === '__reset__' ? 'Resetting…' : 'Reset demo data now'}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft/40 px-3 py-2 text-[14px] text-amber-deep">
          {error}
        </p>
      )}
      {note && (
        <p className="mt-4 rounded-[var(--radius-button)] border border-sage/40 bg-sage-soft/50 px-3 py-2 text-[14px] text-sage-deep">
          {note}
        </p>
      )}

      <ul className="mt-6 space-y-3">
        {DEV_SCENARIOS.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-4 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
          >
            <div className="min-w-0">
              <p className="font-display text-[16px] leading-snug text-ink">
                {s.title}
              </p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
                {s.description}
              </p>
            </div>
            <button
              type="button"
              onClick={() => launch(s.id)}
              disabled={busy !== null}
              className="shrink-0 rounded-[var(--radius-button)] bg-sage-deep px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-60"
            >
              {busy === s.id ? 'Launching…' : 'Launch'}
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
