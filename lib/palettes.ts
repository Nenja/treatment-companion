/**
 * Production colour palettes.
 *
 * Appearance is two independent choices:
 *
 *   1. THEME — a colour identity in a day or night form. Three
 *      identities ship, each genuinely distinct (not tints of one
 *      colour):
 *        green — the original calm sage identity. Default.
 *        blue  — a cool slate-blue identity.
 *        clay  — a warm terracotta/clay identity.
 *      Each has a day form and a night form: six themes in total.
 *
 *   2. HIGH CONTRAST — an on/off accessibility toggle. When on, a
 *      single dedicated high-contrast palette is applied INSTEAD of the
 *      theme (light or dark form, matching the theme's day/night).
 *      High contrast is a visual need, not another colour — so it
 *      layers on top of any theme, and the theme's identity steps
 *      aside while it is on.
 *
 * Every palette defines the same fourteen CSS custom properties the app
 * themes from. The variable NAMES are fixed; only their values change.
 * The accent role is carried by `--color-sage*` — the name is
 * historical; in the blue and clay themes those variables hold blue
 * and clay values. No component has to change.
 *
 * Two deliberate constraints on every theme's accent:
 *   - It must stay clearly distinct from the amber `--color-amber-*`
 *     used for the "poor end" of the rating scale, so the two signals
 *     never blur.
 *   - It must not be a red/alarm hue — this is a calm patient tool.
 *
 * Contrast: in every theme, body text (ink / ink-soft) on the
 * backgrounds (cream / cream-soft) clears WCAG AA (4.5:1). The two
 * high-contrast palettes target AAA (7:1+). ink-muted is tertiary text
 * only (timestamps, hints) — never used for anything a user must read
 * to act.
 */

export type ThemeId =
  | 'green-day'
  | 'green-night'
  | 'blue-day'
  | 'blue-night'
  | 'clay-day'
  | 'clay-night';

export type ThemeFamily = 'green' | 'blue' | 'clay';

export interface Theme {
  id: ThemeId;
  family: ThemeFamily;
  isDark: boolean;
  /** Display name of the colour identity (e.g. "Green"). */
  name: string;
  colors: Record<string, string>;
}

export const THEMES: Theme[] = [
  // ---- GREEN — the original sage identity ---------------------------
  {
    id: 'green-day',
    family: 'green',
    isDark: false,
    name: 'Green',
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
    id: 'green-night',
    family: 'green',
    isDark: true,
    name: 'Green',
    colors: {
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
  // ---- BLUE — cool slate-blue identity ------------------------------
  {
    id: 'blue-day',
    family: 'blue',
    isDark: false,
    name: 'Blue',
    colors: {
      // Soft cool-grey surfaces with a faint blue cast.
      '--color-cream': '#eef1f5',
      '--color-cream-soft': '#f7f9fc',
      '--color-ink': '#1d2530',
      '--color-ink-soft': '#465061',
      '--color-ink-muted': '#646d7d',
      // Accent: a clear mid blue. sage-deep is the button fill — dark
      // enough that white-ish on-accent text clears AA on it.
      '--color-sage': '#3f6f9e',
      '--color-sage-deep': '#2b5077',
      '--color-sage-soft': '#d6e2ee',
      // Amber kept as-is so the "poor end" signal stays warm and
      // unmistakably separate from the blue accent.
      '--color-amber-soft': '#e8d5a0',
      '--color-amber-deep': '#705619',
      '--color-stone': '#dde2e9',
      '--color-focus': '#1f4c8a',
      '--color-on-accent': '#f7f9fc',
      '--color-stone-soft': '#e8ebf0'
    }
  },
  {
    id: 'blue-night',
    family: 'blue',
    isDark: true,
    name: 'Blue',
    colors: {
      // Deep slate-blue backgrounds — not pure black.
      '--color-cream': '#161a21',
      '--color-cream-soft': '#1f242d',
      '--color-ink': '#e6e9ee',
      '--color-ink-soft': '#b2b9c4',
      '--color-ink-muted': '#888f9c',
      // Accent lifted so it reads on the dark ground.
      '--color-sage': '#6f9fc9',
      '--color-sage-deep': '#4f7ba8',
      '--color-sage-soft': '#243140',
      '--color-amber-soft': '#3d3526',
      '--color-amber-deep': '#d8bd80',
      '--color-stone': '#343b46',
      '--color-focus': '#8fc0e6',
      '--color-on-accent': '#0a131c',
      '--color-stone-soft': '#2a313b'
    }
  },
  // ---- CLAY — warm terracotta identity ------------------------------
  {
    id: 'clay-day',
    family: 'clay',
    isDark: false,
    name: 'Clay',
    colors: {
      // Warm, slightly pink-tinted neutral surfaces.
      '--color-cream': '#f4ece6',
      '--color-cream-soft': '#fbf6f1',
      '--color-ink': '#2a221e',
      '--color-ink-soft': '#574b44',
      '--color-ink-muted': '#766860',
      // Accent: a muted terracotta. Distinct from the amber/gold of
      // the rating "poor end" — clay is redder and more muted, amber
      // is yellower; placed side by side they stay separable.
      '--color-sage': '#b06245',
      '--color-sage-deep': '#8a4630',
      '--color-sage-soft': '#ecd9cf',
      // Amber shifted slightly more yellow-gold here to hold its
      // distance from the terracotta accent.
      '--color-amber-soft': '#e9d29a',
      '--color-amber-deep': '#6e5410',
      '--color-stone': '#e6dbd2',
      '--color-focus': '#2f5563',
      '--color-on-accent': '#fbf6f1',
      '--color-stone-soft': '#efe6dd'
    }
  },
  {
    id: 'clay-night',
    family: 'clay',
    isDark: true,
    name: 'Clay',
    colors: {
      // Warm dark brown-charcoal backgrounds.
      '--color-cream': '#201b18',
      '--color-cream-soft': '#2b2522',
      '--color-ink': '#ede4dc',
      '--color-ink-soft': '#bdb2a9',
      '--color-ink-muted': '#938880',
      // Terracotta lifted to read on the dark ground.
      '--color-sage': '#cf8568',
      '--color-sage-deep': '#b06245',
      '--color-sage-soft': '#3a2c25',
      '--color-amber-soft': '#3d3526',
      '--color-amber-deep': '#dcc086',
      '--color-stone': '#3f3833',
      '--color-focus': '#9cc7d6',
      '--color-on-accent': '#1a0f0a',
      '--color-stone-soft': '#332c27'
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

const DEFAULT_THEME: ThemeId = 'green-day';

/**
 * Map a stored color_scheme value to a theme id. Accepts the six theme
 * ids and also legacy values saved before the appearance work, so an
 * un-migrated or stale value still resolves cleanly.
 */
export function resolveThemeId(stored: string | null | undefined): ThemeId {
  switch (stored) {
    case 'green-day':
    case 'green-night':
    case 'blue-day':
    case 'blue-night':
    case 'clay-day':
    case 'clay-night':
      return stored;
    // Legacy values — the original four flat schemes, and the
    // intermediate warm/cool ids. All map onto the green identity,
    // since green is the original look.
    case 'light':
    case 'high-contrast':
    case 'warm-day':
    case 'cool-day':
      return 'green-day';
    case 'dark':
    case 'high-contrast-dark':
    case 'warm-night':
    case 'cool-night':
      return 'green-night';
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
  return prefersDark ? 'green-night' : 'green-day';
}
