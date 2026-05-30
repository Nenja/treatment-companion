'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useSetTextScale } from '@/lib/supabase/textScale';
import { useSetNightMode } from '@/lib/supabase/colorScheme';
import { useSetLayoutPreference } from '@/lib/supabase/layoutPreference';
import { professionLabel } from '@/lib/professionLabel';

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
  const tAppearance = useTranslations('appearance');
  const tProfile = useTranslations('profile');

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

  // For the non-physician professional role, show the specific
  // profession (Physiotherapist, Occupational therapist, …) rather than
  // the generic role name. Falls back to "Professional" if no
  // profession is set.
  const baseRoleLabel =
    profile.role === 'clinician'
      ? 'Physician'
      : profile.role === 'physiotherapist'
      ? professionLabel(
          profile.profession,
          profile.professionOther,
          locale as 'en' | 'da'
        ) ?? 'Professional'
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
        className="flex h-11 w-11 items-center justify-center rounded-full border border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft focus:outline-none focus:ring-2 focus:ring-sage/40"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
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

          {/* Text size picker. Stays in the menu — an accessibility
              control a struggling reader needs immediately, without
              navigating to the profile page. Colour appearance has
              moved to the profile page. */}
          <div className="border-b border-stone/70 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-soft">
              {tAppearance('textSize')}
            </p>
            <div className="mt-2 flex gap-1.5">
              <TextScaleButton scale={1.0} label="A" />
              <TextScaleButton scale={1.25} label="A+" />
              <TextScaleButton scale={1.5} label="A++" />
              <TextScaleButton scale={2.0} label="A+++" />
            </div>
          </div>

          {/* Night mode quick toggle. The full palette picker lives on
              the profile page; this is just the day/night switch,
              surfaced here for one-tap access. */}
          <div className="border-b border-stone/70 px-4 py-3">
            <p className="text-[13px] font-semibold text-ink-soft">
              {tAppearance('nightModeLabel')}
            </p>
            <div className="mt-2 flex gap-1.5">
              <NightModeButton
                night={false}
                label={tAppearance('dayOption')}
              />
              <NightModeButton
                night={true}
                label={tAppearance('nightOption')}
              />
            </div>
          </div>

          {/* Layout density toggle. Only meaningful on large screens
              (the two-pane layout needs the width), so the whole
              section is hidden below lg via CSS. Patients never get a
              two-pane layout, so it's hidden for them too. */}
          {profile.role !== 'patient' && (
            <div className="hidden border-b border-stone/70 px-4 py-3 lg:block">
              <p className="text-[13px] font-semibold text-ink-soft">
                {tAppearance('layoutLabel')}
              </p>
              <div className="mt-2 flex gap-1.5">
                <LayoutButton
                  preference="wide"
                  label={tAppearance('layoutWide')}
                />
                <LayoutButton
                  preference="compact"
                  label={tAppearance('layoutCompact')}
                />
              </div>
            </div>
          )}

          {/* Profile & settings — name, email, password, profession,
              and colour appearance all live there. */}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push(
                locale === 'en' ? '/profile' : `/${locale}/profile`
              );
            }}
            role="menuitem"
            className="block w-full border-b border-stone/70 px-4 py-3 text-left text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {tProfile('menuLink')}
          </button>

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

function NightModeButton({
  night,
  label
}: {
  night: boolean;
  label: string;
}) {
  const { profile } = useAuth();
  const setNight = useSetNightMode();
  const isCurrent = Boolean(profile?.nightMode) === night;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isCurrent}
      onClick={() =>
        setNight.mutate({
          night,
          currentPalette: profile?.colorScheme ?? null
        })
      }
      className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border text-[14px] font-semibold ${
        isCurrent
          ? 'border-sage bg-sage-soft text-sage-deep'
          : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
      }`}
    >
      {label}
    </button>
  );
}

function LayoutButton({
  preference,
  label
}: {
  preference: 'wide' | 'compact';
  label: string;
}) {
  const { profile } = useAuth();
  const setLayout = useSetLayoutPreference();
  const current = profile?.layoutPreference ?? 'wide';
  const isCurrent = current === preference;
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={isCurrent}
      onClick={() => setLayout.mutate({ preference })}
      className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border text-[14px] font-semibold ${
        isCurrent
          ? 'border-sage bg-sage-soft text-sage-deep'
          : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
      }`}
    >
      {label}
    </button>
  );
}
