'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useSetPalette, useSetNightMode } from '@/lib/supabase/colorScheme';
import { PALETTES, resolvePaletteId, type Palette } from '@/lib/palettes';

/**
 * Colour-appearance settings — the palette grid plus the night-mode
 * toggle. Lives on the profile page (a settled-once preference, unlike
 * text size which stays in the account menu as an always-reachable
 * accessibility control).
 *
 * Extracted into its own component so there is one implementation, not
 * a copy in the menu and another on the profile page.
 */
export function AppearanceSettings() {
  return (
    <div>
      <NightModeToggle />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {PALETTES.map((p) => (
          <PaletteButton key={p.id} palette={p} />
        ))}
      </div>
    </div>
  );
}

function PaletteButton({ palette }: { palette: Palette }) {
  const { profile } = useAuth();
  const setPalette = useSetPalette();
  const tAppearance = useTranslations('appearance');
  // Marked current only when the profile has an explicit color_scheme
  // that resolves to this palette — an unsaved user sees no selection.
  const isCurrent =
    profile?.colorScheme != null &&
    resolvePaletteId(profile.colorScheme) === palette.id;
  // Preview the palette in whichever day/night form is currently set.
  const night = profile?.nightMode ?? false;
  const preview = night ? palette.night : palette.day;
  // Localised display name, keyed by palette id (e.g. paletteGreen).
  const nameKey =
    'palette' +
    palette.id
      .split('-')
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join('');
  const displayName = tAppearance(nameKey);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={isCurrent}
      onClick={() =>
        setPalette.mutate({ paletteId: palette.id, currentNight: night })
      }
      className={`flex min-h-11 items-center gap-2 rounded-[var(--radius-button)] border px-2 py-1.5 text-left ${
        isCurrent
          ? 'border-sage bg-sage-soft'
          : 'border-stone bg-cream-soft hover:bg-stone-soft'
      }`}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-ink/15"
        style={{ background: preview['--color-cream'] }}
      >
        <span
          className="h-3 w-3 rounded-sm"
          style={{ background: preview['--color-sage-deep'] }}
        />
      </span>
      <span
        className={`text-[13px] font-semibold leading-tight ${
          isCurrent ? 'text-sage-deep' : 'text-ink-soft'
        }`}
      >
        {displayName}
      </span>
    </button>
  );
}

function NightModeToggle() {
  const { profile } = useAuth();
  const setNightMode = useSetNightMode();
  const tAppearance = useTranslations('appearance');
  const on = profile?.nightMode ?? false;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={() =>
        setNightMode.mutate({
          night: !on,
          currentPalette: profile?.colorScheme ?? null
        })
      }
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-left hover:bg-stone-soft"
    >
      <span className="flex flex-col">
        <span className="text-[13px] font-semibold text-ink-soft">
          {tAppearance('nightMode')}
        </span>
        <span className="text-[12px] text-ink-muted">
          {tAppearance('nightModeHint')}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
          on ? 'bg-sage-deep' : 'bg-stone'
        }`}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-cream-soft transition-transform ${
            on ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}
