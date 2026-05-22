'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth';

/**
 * Routes an account that is still on its clinic-issued temporary
 * password (profile.must_change_password) to the set-password screen,
 * and keeps them there until they choose their own password.
 *
 * Mounted once near the root, after AuthProvider. It does nothing for
 * normal accounts. The check is intentionally a redirect rather than
 * blocking render, so the rest of the app is never partially shown to
 * a must-change account.
 *
 * The reset-password page itself is exempt (otherwise it would redirect
 * to itself forever), as are login/forgot-password (a must-change user
 * isn't normally there, but we don't want to fight the auth flow).
 */
export function PasswordChangeGuard() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !profile) return;
    if (!profile.mustChangePassword) return;

    // Pages where we must NOT redirect.
    const exempt = ['/reset-password', '/login', '/forgot-password'];
    const onExemptPage = exempt.some((p) => pathname.endsWith(p));
    if (onExemptPage) return;

    // Preserve the locale prefix from the current path.
    const localeMatch = pathname.match(/^\/([a-z]{2})(\/|$)/);
    const prefix =
      localeMatch && localeMatch[1] !== 'en' ? `/${localeMatch[1]}` : '';
    router.replace(`${prefix}/reset-password`);
  }, [loading, profile, pathname, router]);

  return null;
}
