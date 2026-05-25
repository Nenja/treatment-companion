/**
 * Production colour palettes.
 *
 * Appearance is two independent choices:
 *
 *   1. THEME — a colour palette in a day or night form. Four ship:
 *        warm-day    — the original warm sage look. Default.
 *        warm-night  — the warm palette, dark.
 *        cool-day    — a cooler blue-green palette, light.
 *        cool-night  — the cool palette, dark.
 *
 *   2. HIGH CONTRAST — an on/off accessibility toggle. When on, a
 *      single dedicated high-contrast palette is applied INSTEAD of the
 *      theme (in a light or dark form, matching whether the chosen
 *      theme is a day or night theme). High contrast is a visual need,
 *      not a fifth colour — so it layers on top of any theme, and the
 *      theme's personality deliberately steps aside while it is on.
 *
 * Every palette defines the same fourteen CSS custom properties the app
 * themes from. The variable NAMES are fixed; only their values change.
 * In night/dark palettes the roles invert — `cream` is a dark
 * background, `ink` is light text — but the names stay, so no component
 * has to change.
 *
 * Contrast: in every theme, body text (ink / ink-soft) on the
 * backgrounds (cream / cream-soft) clears WCAG AA (4.5:1). The two
 * high-contrast palettes target AAA (7:1+). ink-muted is tertiary text
 * only (timestamps, hints) — never used for anything a user must read
 * to act.
 */

export type ThemeId = 'warm-day' | 'warm-night' | 'cool-day' | 'cool-night';

export interface Theme {
  id: ThemeId;
  /** Palette family — 'warm' or 'cool'. */
  family: 'warm' | 'cool';
  /** Day or night form. */
  isDark: boolean;
  /** Display name for the picker. */
  name: string;
  colors: Record<string, string>;
}

export const THEMES: Theme[] = [
  {
    id: 'warm-day',
    family: 'warm',
    isDark: false,
    name: 'Warm',
    colors: {
      '--color-cream': '#f6f1e8',
      '--color-cream-soft': '#fbf8f2',
      '--color-ink': '#1f2421',
      '--color-ink-soft': '#4b5450',
      '--color-ink-muted': '#686d69',
      '--color-sage': '#5c7a6a',
      '--color-sage-deep': '#3f5a4b',
      '--color-sage-soft': '#dce6de',
      '--color-amber-soft': '#e8d5a0',
      '--color-amber-deep': '#705619',
      '--color-stone': '#e5dfd3',
      '--color-focus': '#2f5563',
      '--color-on-accent': '#fbf8f2',
      '--color-stone-soft': '#efeae0'
    }
  },
  {
    id: 'warm-night',
    family: 'warm',
    isDark: true,
    name: 'Warm',
    colors: {
      // Warm dark backgrounds — not pure black, to keep the calm feel.
      '--color-cream': '#1c1f1d',
      '--color-cream-soft': '#262a27',
      '--color-ink': '#ece7dd',
      '--color-ink-soft': '#b9bdb6',
      '--color-ink-muted': '#8f948d',
      '--color-sage': '#7fa08e',
      '--color-sage-deep': '#5c7a6a',
      '--color-sage-soft': '#2f3a34',
      '--color-amber-soft': '#3d3526',
      '--color-amber-deep': '#d8bd80',
      '--color-stone': '#3a3f3b',
      '--color-focus': '#9cc7d6',
      '--color-on-accent': '#f3efe6',
      '--color-stone-soft': '#30342f'
    }
  },
  {
    id: 'cool-day',
    family: 'cool',
    isDark: false,
    name: 'Cool',
    colors: {
      // A cooler palette — soft blue-grey surfaces, a teal-leaning
      // accent. Same calm, soft-contrast intent as the warm theme.
      '--color-cream': '#eef1f3',
      '--color-cream-soft': '#f7f9fa',
      '--color-ink': '#1c2426',
      '--color-ink-soft': '#46514f',
      '--color-ink-muted': '#65706f',
      '--color-sage': '#4f7d80',
      '--color-sage-deep': '#365e61',
      '--color-sage-soft': '#d6e4e4',
      '--color-amber-soft': '#e6d6ad',
      '--color-amber-deep': '#6c5320',
      '--color-stone': '#dbe1e3',
      '--color-focus': '#2f5563',
      '--color-on-accent': '#f7f9fa',
      '--color-stone-soft': '#e7ebed'
    }
  },
  {
    id: 'cool-night',
    family: 'cool',
    isDark: true,
    name: 'Cool',
    colors: {
      // Cool dark — slate-blue backgrounds, a lifted teal accent.
      '--color-cream': '#181c1e',
      '--color-cream-soft': '#222729',
      '--color-ink': '#e6eae9',
      '--color-ink-soft': '#b3bbba',
      '--color-ink-muted': '#8a9291',
      '--color-sage': '#74a3a5',
      '--color-sage-deep': '#4f7d80',
      '--color-sage-soft': '#283538',
      '--color-amber-soft': '#332c1e',
      '--color-amber-deep': '#d6bd84',
      '--color-stone': '#363c3e',
      '--color-focus': '#9cc7d6',
      '--color-on-accent': '#06140d',
      '--color-stone-soft': '#2b3133'
    }
  }
];

/**
 * The two high-contrast palettes. Not user-selectable as themes — the
 * high-contrast TOGGLE applies one of these, choosing the light form
 * for a day theme and the dark form for a night theme. One shared,
 * carefully tuned palette per form keeps the accessibility guarantee
 * reliable.
 */
export const HIGH_CONTRAST: Record<'light' | 'dark', Record<string, string>> = {
  light: {
    '--color-cream': '#ffffff',
    '--color-cream-soft': '#ffffff',
    '--color-ink': '#000000',
    '--color-ink-soft': '#1a1a1a',
    '--color-ink-muted': '#333333',
    '--color-sage': '#1f5138',
    '--color-sage-deep': '#0f3a24',
    '--color-sage-soft': '#d4e6db',
    '--color-amber-soft': '#f2e2b0',
    '--color-amber-deep': '#5a3d00',
    '--color-stone': '#6b6b6b',
    '--color-focus': '#0033aa',
    '--color-on-accent': '#ffffff',
    '--color-stone-soft': '#e0e0e0'
  },
  dark: {
    '--color-cream': '#000000',
    '--color-cream-soft': '#000000',
    '--color-ink': '#ffffff',
    '--color-ink-soft': '#e6e6e6',
    '--color-ink-muted': '#cccccc',
    '--color-sage': '#9ed4b4',
    '--color-sage-deep': '#7fbf9c',
    '--color-sage-soft': '#16271d',
    '--color-amber-soft': '#2a2410',
    '--color-amber-deep': '#f0d488',
    '--color-stone': '#8a8a8a',
    '--color-focus': '#7fd4ff',
    '--color-on-accent': '#06140d',
    '--color-stone-soft': '#1f1f1f'
  }
};

const DEFAULT_THEME: ThemeId = 'warm-day';

/**
 * Map a stored color_scheme value to a theme id. Accepts the four new
 * theme ids and also the four legacy scheme ids (saved before the
 * appearance split), so an un-migrated or stale value still resolves.
 */
export function resolveThemeId(stored: string | null | undefined): ThemeId {
  switch (stored) {
    case 'warm-day':
    case 'warm-night':
    case 'cool-day':
    case 'cool-night':
      return stored;
    // Legacy values.
    case 'light':
    case 'high-contrast':
      return 'warm-day';
    case 'dark':
    case 'high-contrast-dark':
      return 'warm-night';
    default:
      return DEFAULT_THEME;
  }
}

/** True if a stored (possibly legacy) color_scheme value was itself a
 *  high-contrast scheme — used so legacy rows keep high contrast on. */
export function legacyValueIsHighContrast(
  stored: string | null | undefined
): boolean {
  return stored === 'high-contrast' || stored === 'high-contrast-dark';
}

export function getTheme(id: string | null | undefined): Theme {
  const themeId = resolveThemeId(id);
  return THEMES.find((t) => t.id === themeId) ?? THEMES[0];
}

/**
 * Resolve a theme choice + high-contrast toggle into the actual set of
 * CSS variables to apply. When high contrast is on, the dedicated
 * high-contrast palette replaces the theme — light form for a day
 * theme, dark form for a night theme.
 */
export function resolveColors(
  themeIdOrLegacy: string | null | undefined,
  highContrast: boolean
): { colors: Record<string, string>; isDark: boolean; appliedId: string } {
  const theme = getTheme(themeIdOrLegacy);
  if (highContrast) {
    const form = theme.isDark ? 'dark' : 'light';
    return {
      colors: HIGH_CONTRAST[form],
      isDark: theme.isDark,
      appliedId: `high-contrast-${form}`
    };
  }
  return { colors: theme.colors, isDark: theme.isDark, appliedId: theme.id };
}

/** First-run default theme for a given OS prefers-color-scheme. */
export function themeForOsPreference(prefersDark: boolean): ThemeId {
  return prefersDark ? 'warm-night' : 'warm-day';
}
