'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';

/**
 * Account menu button. Designed to be placed inline in a page header
 * (not fixed-positioned) so it composes with other header actions.
 * Pages mount it wherever they want.
 *
 * Renders nothing when no user is signed in.
 *
 * Tap the initials avatar → popover with display name, email, role,
 * and Sign out. Closes on outside click / Escape.
 */
export function AccountMenu() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const locale = useLocale();

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user || !profile) return null;

  const initials =
    (profile.displayName ?? user.email ?? '?')
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '·';

  const roleLabel =
    profile.role === 'clinician'
      ? 'Clinician'
      : profile.role === 'patient'
      ? 'Patient'
      : profile.role;

  const doSignOut = async () => {
    setOpen(false);
    await signOut();
    router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-stone bg-cream-soft text-[12px] font-semibold text-ink-soft hover:bg-stone-soft focus:outline-none focus:ring-2 focus:ring-sage/40"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[240px] overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream shadow-lg"
        >
          <div className="border-b border-stone/70 px-4 py-3">
            <p className="font-display text-[15px] leading-tight text-ink">
              {profile.displayName ?? 'Account'}
            </p>
            {user.email && (
              <p className="mt-0.5 truncate text-[12px] text-ink-muted">
                {user.email}
              </p>
            )}
            <p className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-muted">
              {roleLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={doSignOut}
            role="menuitem"
            className="block w-full px-4 py-3 text-left text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
