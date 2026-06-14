'use client';

import { useLocale } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/supabase/auth';
import { useSetPreferredLocale, type AppLocale } from '@/lib/supabase/locale';

/**
 * Language picker. Two presentations of the same control:
 *   - `segmented` — a compact EN · DA · SV · NB strip for the login
 *     screen, where there is no profile yet, so it only switches the
 *     URL locale (the page re-renders in that language).
 *   - `cards` — endonym cards (English / Dansk / Svenska / Norsk) for
 *     the profile/settings page; switches the URL locale AND persists
 *     `preferred_locale` so the choice survives the next sign-in.
 *
 * Like the appearance controls, this applies live and is never part of
 * the save-gated profile form, so it can't trip the unsaved-changes
 * guard.
 *
 * Language names are endonyms (the language's own name), so they read
 * the same in every locale and need no translation.
 */

const LANGS: { code: AppLocale; short: string; name: string }[] = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'da', short: 'DA', name: 'Dansk' },
  { code: 'sv', short: 'SV', name: 'Svenska' },
  { code: 'nb', short: 'NB', name: 'Norsk' }
];

/**
 * Rewrite the current path for a new locale, honouring the
 * `localePrefix: 'as-needed'` scheme: English has no prefix, the others
 * carry `/<locale>`. Strips the current prefix, then adds the target's.
 */
function switchLocalePath(
  pathname: string,
  current: string,
  target: string
): string {
  let bare = pathname;
  if (
    current !== 'en' &&
    (pathname === `/${current}` || pathname.startsWith(`/${current}/`))
  ) {
    bare = pathname.slice(current.length + 1) || '/';
  }
  if (!bare.startsWith('/')) bare = `/${bare}`;
  if (target === 'en') return bare;
  return bare === '/' ? `/${target}` : `/${target}${bare}`;
}

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18" />
    </svg>
  );
}

export function LanguageSelect({
  variant
}: {
  variant: 'segmented' | 'cards';
}) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const setPreferredLocale = useSetPreferredLocale();

  const choose = (target: AppLocale) => {
    if (target === locale) return;
    // On the settings cards (signed in), remember the choice for next time.
    if (variant === 'cards' && user) {
      setPreferredLocale.mutate(target);
    }
    router.replace(switchLocalePath(pathname, locale, target));
  };

  if (variant === 'segmented') {
    return (
      <div
        role="group"
        aria-label="Language"
        className="inline-flex items-center gap-0.5 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-0.5"
      >
        <GlobeIcon className="ml-1 mr-0.5 h-3.5 w-3.5 text-ink-muted" />
        {LANGS.map((l) => {
          const current = l.code === locale;
          return (
            <button
              key={l.code}
              type="button"
              aria-pressed={current}
              onClick={() => choose(l.code)}
              className={`rounded-[calc(var(--radius-button)-2px)] px-2 py-1 text-[12px] font-semibold ${
                current
                  ? 'bg-sage-deep text-on-accent'
                  : 'text-ink-soft hover:text-ink'
              }`}
            >
              {l.short}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label="Language" className="grid grid-cols-2 gap-1.5">
      {LANGS.map((l) => {
        const current = l.code === locale;
        return (
          <button
            key={l.code}
            type="button"
            role="radio"
            aria-checked={current}
            onClick={() => choose(l.code)}
            className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] border px-3 py-1.5 text-left ${
              current
                ? 'border-sage bg-sage-soft'
                : 'border-stone bg-cream-soft hover:bg-stone-soft'
            }`}
          >
            <GlobeIcon
              className={`h-4 w-4 shrink-0 ${
                current ? 'text-sage-deep' : 'text-ink-muted'
              }`}
            />
            <span
              className={`text-[13px] font-semibold leading-tight ${
                current ? 'text-sage-deep' : 'text-ink-soft'
              }`}
            >
              {l.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}
