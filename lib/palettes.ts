/**
 * Production colour schemes.
 *
 * Four schemes, each a genuine accessibility accommodation for this
 * patient group (adults with spasticity — older skew, frequent
 * co-occurring vision differences):
 *
 *   light          — default. Warm, calm, soft contrast. Good vision,
 *                     good lighting.
 *   dark           — for light sensitivity / photophobia (common after
 *                     stroke and with MS) and low-light use.
 *   high-contrast       — maximum text/background separation for low
 *                     vision; trades the calm soft contrast for
 *                     legibility on purpose.
 *   high-contrast-dark  — low vision AND light sensitivity together.
 *
 * Each scheme defines the same twelve CSS custom properties the app
 * themes from (globals.css :root). The variable NAMES are fixed; only
 * their values change. In dark schemes the roles invert — `cream` is a
 * dark background, `ink` is light text — but the names stay so no
 * component has to change.
 *
 * Contrast: in every scheme, body text (ink / ink-soft) on the
 * backgrounds (cream / cream-soft) clears WCAG AA (4.5:1); the
 * high-contrast schemes target AAA (7:1+). ink-muted is tertiary text
 * only (timestamps, hints) — kept at AA, never used for anything a
 * user must read to act.
 */

export type SchemeId =
  | 'light'
  | 'dark'
  | 'high-contrast'
  | 'high-contrast-dark';

export interface Scheme {
  id: SchemeId;
  name: string;
  /** One-line description for the picker. */
  note: string;
  /** Whether this scheme is dark-on-light's opposite — used so the
   *  picker can group, and so OS prefers-color-scheme can pick one. */
  isDark: boolean;
  colors: Record<string, string>;
}

export const SCHEMES: Scheme[] = [
  {
    id: 'light',
    name: 'Light',
    note: 'Warm and calm. The standard appearance.',
    isDark: false,
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
    id: 'dark',
    name: 'Dark',
    note: 'Easier on the eyes in low light or with light sensitivity.',
    isDark: true,
    colors: {
      // Warm dark backgrounds — not pure black, to keep the calm feel.
      '--color-cream': '#1c1f1d',
      '--color-cream-soft': '#262a27',
      // Light text. ink is the brightest; muted is dim but still AA.
      '--color-ink': '#ece7dd',
      '--color-ink-soft': '#b9bdb6',
      '--color-ink-muted': '#8f948d',
      // Sage accent lifted so it reads on a dark ground; sage-deep is
      // the button fill and must contrast with light button text.
      '--color-sage': '#7fa08e',
      '--color-sage-deep': '#5c7a6a',
      '--color-sage-soft': '#2f3a34',
      // Amber accent: soft is a dim fill, deep is light enough to read
      // as text on the dark ground.
      '--color-amber-soft': '#3d3526',
      '--color-amber-deep': '#d8bd80',
      // Borders / subtle fills — low-contrast separators.
      '--color-stone': '#3a3f3b',
      '--color-focus': '#9cc7d6',
      '--color-on-accent': '#f3efe6',
      '--color-stone-soft': '#30342f'
    }
  },
  {
    id: 'high-contrast',
    name: 'High contrast',
    note: 'Maximum clarity — strong dark text on white.',
    isDark: false,
    colors: {
      // Pure-white backgrounds, both the same: high contrast removes
      // the soft surface layering in favour of clarity.
      '--color-cream': '#ffffff',
      '--color-cream-soft': '#ffffff',
      // Near-black text. ink is pure black; even ink-muted is dark
      // enough to clear AAA — nothing is faint here.
      '--color-ink': '#000000',
      '--color-ink-soft': '#1a1a1a',
      '--color-ink-muted': '#333333',
      // Accents: dark and saturated so they pass as text on white and
      // are unmistakably distinct from each other.
      '--color-sage': '#1f5138',
      '--color-sage-deep': '#0f3a24',
      '--color-sage-soft': '#d4e6db',
      '--color-amber-soft': '#f2e2b0',
      '--color-amber-deep': '#5a3d00',
      // Borders are dark and visible — no faint hairlines.
      '--color-stone': '#6b6b6b',
      '--color-focus': '#0033aa',
      '--color-on-accent': '#ffffff',
      '--color-stone-soft': '#e0e0e0'
    }
  },
  {
    id: 'high-contrast-dark',
    name: 'High contrast (dark)',
    note: 'Maximum clarity without a bright screen.',
    isDark: true,
    colors: {
      // True-black backgrounds for maximum separation.
      '--color-cream': '#000000',
      '--color-cream-soft': '#000000',
      // Pure-white and near-white text.
      '--color-ink': '#ffffff',
      '--color-ink-soft': '#e6e6e6',
      '--color-ink-muted': '#cccccc',
      // Bright accents that pop hard against black.
      '--color-sage': '#9ed4b4',
      '--color-sage-deep': '#7fbf9c',
      '--color-sage-soft': '#16271d',
      '--color-amber-soft': '#2a2410',
      '--color-amber-deep': '#f0d488',
      // Bright, clearly visible borders.
      '--color-stone': '#8a8a8a',
      '--color-focus': '#7fd4ff',
      '--color-on-accent': '#06140d',
      '--color-stone-soft': '#1f1f1f'
    }
  }
];

/** First-run default for a given OS prefers-color-scheme. */
export function schemeForOsPreference(prefersDark: boolean): SchemeId {
  return prefersDark ? 'dark' : 'light';
}

export function getScheme(id: string): Scheme {
  return SCHEMES.find((s) => s.id === id) ?? SCHEMES[0];
}
