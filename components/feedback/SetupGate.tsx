'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth';
import { OnboardingWizard } from './OnboardingWizard';

/**
 * Mandatory first-run setup gate. Mounted once near the root (after
 * AuthProvider, alongside PasswordChangeGuard).
 *
 * When a freshly-created account has not yet completed setup
 * (profile.has_seen_intro is false), this covers the whole app with the
 * role-tailored first-run wizard, with no skip — so accessibility
 * settings (and, for patients, the sex / date-of-birth details step)
 * are chosen before the app is used.
 *
 * Ordering & exemptions:
 *   - Defers while mustChangePassword is true, so PasswordChangeGuard
 *     sends the user to set their password first.
 *   - Auth pages are exempt so sign-in / reset is never blocked.
 *   - Admin accounts have no setup flow and are skipped.
 *
 * On finish the wizard calls onComplete, so we reveal the app instantly
 * rather than waiting on the profile refetch (has_seen_intro also flips
 * to true, which keeps the gate closed thereafter).
 */
export function SetupGate() {
  const { profile, loading } = useAuth();
  const pathname = usePathname();
  const [done, setDone] = useState(false);

  if (done) return null;
  if (loading || !profile) return null;
  if (profile.mustChangePassword) return null; // password change goes first
  if (profile.hasSeenIntro) return null; // already completed
  if (profile.role === 'admin') return null; // no setup flow for admins

  const exempt = ['/login', '/signup', '/forgot-password', '/reset-password', '/support'];
  if (exempt.some((p) => pathname.endsWith(p))) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-cream">
      <div className="mx-auto max-w-[520px] px-5 py-8">
        <OnboardingWizard
          role={profile.role}
          mandatory
          onComplete={() => setDone(true)}
        />
      </div>
    </div>
  );
}
