/**
 * Candidate colour palettes for user testing.
 *
 * Each palette defines the same twelve CSS custom properties the app
 * themes from (see globals.css :root). The ThemeSwitcher overrides
 * these on <html> at runtime, so switching re-themes every screen
 * instantly with no component changes.
 *
 * Design constraints every candidate respects, for this patient group
 * (adults with spasticity — often older, some with low vision):
 *   - body text on background clears WCAG AA (4.5:1); ink-muted and
 *     amber-deep are kept dark enough to pass on their backgrounds.
 *   - a calm, warm, non-clinical feel — no stark white, no hospital
 *     blue-grey.
 *   - "good" (sage family) and "attention" (amber family) stay clearly
 *     distinct, because the 0-10 rating control colour-codes by them.
 *
 * This file and the switcher are test-only — see ThemeSwitcher for how
 * to remove them before the real pilot.
 */

export interface Palette {
  id: string;
  name: string;
  /** One-line description for the picker. */
  note: string;
  colors: Record<string, string>;
}

export const PALETTES: Palette[] = [
  {
    id: 'current',
    name: 'Current — Warm Sage',
    note: 'The palette in use today: cream, sage green, warm ink.',
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
      '--color-stone-soft': '#efeae0'
    }
  },
  {
    id: 'mist',
    name: 'Cool Mist',
    note: 'Soft blue-grey and teal — calm and slightly more clinical.',
    colors: {
      '--color-cream': '#eef1f2',
      '--color-cream-soft': '#f7f9fa',
      '--color-ink': '#1d2528',
      '--color-ink-soft': '#46535a',
      '--color-ink-muted': '#5f6b71',
      '--color-sage': '#4f7d80',
      '--color-sage-deep': '#355c5f',
      '--color-sage-soft': '#d6e4e4',
      '--color-amber-soft': '#e7d2a6',
      '--color-amber-deep': '#6e5418',
      '--color-stone': '#dde2e4',
      '--color-stone-soft': '#e9edee'
    }
  },
  {
    id: 'clay',
    name: 'Warm Clay',
    note: 'Warmer still — terracotta-leaning neutrals, soft green accent.',
    colors: {
      '--color-cream': '#f4ede4',
      '--color-cream-soft': '#fbf6ee',
      '--color-ink': '#2a221c',
      '--color-ink-soft': '#574b41',
      '--color-ink-muted': '#6f6256',
      '--color-sage': '#6a7c5d',
      '--color-sage-deep': '#48583d',
      '--color-sage-soft': '#dfe4d4',
      '--color-amber-soft': '#e8cfa2',
      '--color-amber-deep': '#7a5320',
      '--color-stone': '#e6dccd',
      '--color-stone-soft': '#f0e8db'
    }
  },
  {
    id: 'slate',
    name: 'Quiet Slate',
    note: 'Cooler, lower-contrast neutrals with a deep green accent.',
    colors: {
      '--color-cream': '#eef0ee',
      '--color-cream-soft': '#f8f9f8',
      '--color-ink': '#212624',
      '--color-ink-soft': '#4a524e',
      '--color-ink-muted': '#626a66',
      '--color-sage': '#54776a',
      '--color-sage-deep': '#39564b',
      '--color-sage-soft': '#d9e3df',
      '--color-amber-soft': '#e6d3a4',
      '--color-amber-deep': '#6d5519',
      '--color-stone': '#dfe2e0',
      '--color-stone-soft': '#eaecea'
    }
  }
];
