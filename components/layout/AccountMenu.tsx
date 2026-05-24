'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useSetTextScale } from '@/lib/supabase/textScale';
import { useSetColorScheme } from '@/lib/supabase/colorScheme';
import { SCHEMES, type Scheme } from '@/lib/palettes';

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

  const baseRoleLabel =
    profile.role === 'clinician'
      ? 'Physician'
      : profile.role === 'physiotherapist'
      ? 'Physiotherapist'
      : profile.role === 'patient'
      ? 'Patient'
      : profile.role;
  // Admin is orthogonal to the base role — shown as a suffix, not
  // instead of the role.
  const roleLabel = profile.isAdmin
    ? `${baseRoleLabel} · Admin`
    : baseRoleLabel;

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
        className="flex h-11 w-11 items-center justify-center rounded-full border border-stone bg-cream-soft text-[14px] font-semibold text-ink-soft hover:bg-stone-soft focus:outline-none focus:ring-2 focus:ring-sage/40"
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-40 w-[260px] overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream shadow-lg"
        >
          <div className="border-b border-stone/70 px-4 py-3">
            <p className="font-display text-[15px] leading-tight text-ink">
              {profile.displayName ?? 'Account'}
            </p>
            {user.email && (
              <p className="mt-0.5 truncate text-[14px] text-ink-muted">
                {user.email}
              </p>
            )}
            <p className="mt-0.5 text-[14px] uppercase tracking-wider text-ink-muted">
              {roleLabel}
            </p>
          </div>

          {/* Text size picker. Three preset sizes. The current
              selection is highlighted; tapping a non-current one
              applies the new scale immediately and saves it to the
              profile. */}
          <div className="border-b border-stone/70 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-soft">
              Text size
            </p>
            <div className="mt-2 flex gap-1.5">
              <TextScaleButton scale={1.0} label="A" />
              <TextScaleButton scale={1.25} label="A+" />
              <TextScaleButton scale={1.5} label="A++" />
              <TextScaleButton scale={2.0} label="A+++" />
            </div>
          </div>

          {/* Appearance — colour scheme. An accessibility setting:
              dark for light sensitivity, high-contrast for low vision. */}
          <div className="border-b border-stone/70 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-soft">
              Appearance
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {SCHEMES.map((s) => (
                <SchemeButton key={s.id} scheme={s} />
              ))}
            </div>
          </div>

          {/* Visit code — patient-only. A utility used at clinic
              appointments, so it lives in the menu rather than on the
              daily home screen. Clearly labelled so a patient can find
              it quickly at the clinic counter. */}
          {profile.role === 'patient' && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push(
                  locale === 'en' ? '/visit-code' : `/${locale}/visit-code`
                );
              }}
              role="menuitem"
              className="block w-full border-t border-stone/70 px-4 py-3 text-left text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              Visit code for your clinic
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(
                locale === 'en' ? '/privacy' : `/${locale}/privacy`
              );
            }}
            role="menuitem"
            className="block w-full border-t border-stone/70 px-4 py-3 text-left text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Your data &amp; privacy
          </button>

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

function SchemeButton({ scheme }: { scheme: Scheme }) {
  const { profile } = useAuth();
  const setScheme = useSetColorScheme();
  // The current scheme: the saved choice, or — if none — whichever the
  // OS resolves to. We mark a button current only when it matches an
  // explicit saved choice, so an unsaved user sees no false selection.
  const isCurrent = profile?.colorScheme === scheme.id;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isCurrent}
      onClick={() => setScheme.mutate(scheme.id)}
      className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] border px-2 py-1.5 text-left ${
        isCurrent
          ? 'border-sage bg-sage-soft'
          : 'border-stone bg-cream-soft hover:bg-stone-soft'
      }`}
    >
      {/* Swatch: the scheme's background with its sage accent, so the
          button previews the actual appearance. */}
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink/15"
        style={{ background: scheme.colors['--color-cream'] }}
      >
        <span
          className="h-3 w-3 rounded-sm"
          style={{ background: scheme.colors['--color-sage-deep'] }}
        />
      </span>
      <span
        className={`text-[13px] font-semibold leading-tight ${
          isCurrent ? 'text-sage-deep' : 'text-ink-soft'
        }`}
      >
        {scheme.name}
      </span>
    </button>
  );
}

function TextScaleButton({
  scale,
  label
}: {
  scale: 1.0 | 1.25 | 1.5 | 2.0;
  label: string;
}) {
  const { profile } = useAuth();
  const setScale = useSetTextScale();
  const current = profile?.textScale ?? 1.0;
  // Use small epsilon since numeric comparison can be fragile.
  const isCurrent = Math.abs(current - scale) < 0.01;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isCurrent}
      onClick={() => setScale.mutate(scale)}
      className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border font-semibold ${
        isCurrent
          ? 'border-sage bg-sage-soft text-sage-deep'
          : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
      }`}
      style={{
        // The label itself should reflect the visual outcome of the
        // choice — bigger button = bigger sample. Set inline so it
        // overrides the button's inherited font-size.
        fontSize: `${14 * scale}px`
      }}
    >
      {label}
    </button>
  );
}
