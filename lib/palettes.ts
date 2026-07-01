/**
 * Production colour palettes.
 *
 * Appearance is two independent choices:
 *
 *   1. DAY / NIGHT — a toggle. Independent of the colour choice.
 *
 *   2. PALETTE — one of:
 *        green          — the original calm sage identity. Default.
 *        plum           — a soft plum / purple identity.
 *        slate          — a cool slate-blue identity.
 *        clay           — a warm terracotta / clay identity.
 *        high-contrast  — a dedicated maximum-legibility palette for
 *                         low vision. Not a colour identity: choosing
 *                         it deliberately drops the colour personality
 *                         in favour of clarity. It still honours the
 *                         day/night toggle (light or dark form).
 *
 * The four colour identities each define a `day` and a `night` set of
 * the fourteen CSS custom properties the app themes from. The variable
 * NAMES are fixed; only the values change. The accent role is carried
 * by `--color-sage*` — the name is historical; in the plum, slate, and
 * clay palettes those variables hold plum, slate, and clay values. No
 * component has to change.
 *
 * NOTE: this set is intentionally broad — it exists so the team can
 * compare the identities on real screens and remove some later. Each
 * identity is one self-contained block below, so deleting one is a
 * small, safe edit. To remove an identity: delete its block from
 * PALETTES, remove its id from PaletteId, and remove its legacy
 * mappings if any.
 *
 * Two deliberate constraints on every accent:
 *   - It must stay clearly distinct from the amber `--color-amber-*`
 *     used for the "poor end" of the rating scale.
 *   - It must not be a red/alarm hue — this is a calm patient tool.
 *
 * Contrast: in every palette, body text (ink / ink-soft) on the
 * backgrounds (cream / cream-soft) clears WCAG AA (4.5:1). The
 * high-contrast palette targets AAA (7:1+). ink-muted is tertiary text
 * only — never used for anything a user must read to act.
 */

export type PaletteId = 'green' | 'clay' | 'high-contrast';

/** The selectable options, in picker order. */
export const PALETTE_IDS: PaletteId[] = ['green', 'clay', 'high-contrast'];

export interface Palette {
  id: PaletteId;
  /** Display name for the picker. */
  name: string;
  /** True for the high-contrast palette — the picker can mark it as an
   *  accessibility option rather than a colour. */
  isAccessibility: boolean;
  /** Colour variables for the day form and the night form. */
  day: Record<string, string>;
  night: Record<string, string>;
}

export const PALETTES: Palette[] = [
  // ---- GREEN — the original sage identity ---------------------------
  {
    id: 'green',
    name: 'Green',
    isAccessibility: false,
    day: {
      '--color-cream': '#f6f1e8',
      '--color-cream-soft': '#fbf8f2',
      '--color-ink': '#1f2421',
      '--color-ink-soft': '#4b5450',
      '--color-ink-muted': '#5c605c',
      '--color-sage': '#5c7a6a',
      '--color-sage-deep': '#3f5a4b',
      '--color-sage-soft': '#dce6de',
      '--color-amber-soft': '#e8d5a0',
      '--color-amber-deep': '#705619',
      '--color-stone': '#e5dfd3',
      '--color-focus': '#2f5563',
      '--color-on-accent': '#fbf8f2',
      '--color-stone-soft': '#efeae0',
      '--color-field-border': '#8a7e64'
    },
    night: {
      '--color-cream': '#1c1f1d',
      '--color-cream-soft': '#262a27',
      '--color-ink': '#ece7dd',
      '--color-ink-soft': '#b9bdb6',
      '--color-ink-muted': '#a1a7a0',
      '--color-sage': '#7fa08e',
      '--color-sage-deep': '#5c7a6a',
      '--color-sage-soft': '#2f3a34',
      '--color-amber-soft': '#3d3526',
      '--color-amber-deep': '#d8bd80',
      '--color-stone': '#3a3f3b',
      '--color-focus': '#9cc7d6',
      '--color-on-accent': '#ffffff',
      '--color-stone-soft': '#30342f',
      '--color-field-border': '#787c77'
    }
  },
  // ---- CLAY — warm terracotta identity ------------------------------
  {
    id: 'clay',
    name: 'Clay',
    isAccessibility: false,
    day: {
      '--color-cream': '#f4ece6',
      '--color-cream-soft': '#fbf6f1',
      '--color-ink': '#2a221e',
      '--color-ink-soft': '#574b44',
      '--color-ink-muted': '#685a52',
      '--color-sage': '#b06245',
      '--color-sage-deep': '#8a4630',
      '--color-sage-soft': '#ecd9cf',
      // Amber nudged more yellow-gold to hold distance from terracotta.
      '--color-amber-soft': '#e9d29a',
      '--color-amber-deep': '#6e5410',
      '--color-stone': '#e6dbd2',
      '--color-focus': '#2f5563',
      '--color-on-accent': '#fbf6f1',
      '--color-stone-soft': '#efe6dd',
      '--color-field-border': '#8a7d62'
    },
    night: {
      '--color-cream': '#201b18',
      '--color-cream-soft': '#2b2522',
      '--color-ink': '#ede4dc',
      '--color-ink-soft': '#bdb2a9',
      '--color-ink-muted': '#a49a91',
      '--color-sage': '#cf8568',
      '--color-sage-deep': '#bd6e50',
      '--color-sage-soft': '#3a2c25',
      '--color-amber-soft': '#3d3526',
      '--color-amber-deep': '#dcc086',
      '--color-stone': '#3f3833',
      '--color-focus': '#9cc7d6',
      '--color-on-accent': '#1a0f0a',
      '--color-stone-soft': '#332c27',
      '--color-field-border': '#7f7a72'
    }
  },
  // ---- HIGH CONTRAST — dedicated low-vision palette -----------------
  {
    id: 'high-contrast',
    name: 'High contrast',
    isAccessibility: true,
    day: {
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
      '--color-stone-soft': '#e0e0e0',
      '--color-field-border': '#595959'
    },
    night: {
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
      '--color-stone-soft': '#1f1f1f',
      '--color-field-border': '#8a8a8a'
    }
  }
];

const DEFAULT_PALETTE: PaletteId = 'green';

/**
 * Map a stored palette value to a PaletteId. Accepts the five current
 * ids and also legacy values saved before this structure, so an
 * un-migrated or stale value still resolves cleanly.
 */
export function resolvePaletteId(
  stored: string | null | undefined
): PaletteId {
  switch (stored) {
    case 'green':
    case 'clay':
    case 'high-contrast':
      return stored;
    // Legacy: the original flat schemes and the day/night-suffixed ids.
    case 'light':
    case 'green-day':
    case 'green-night':
    case 'warm-day':
    case 'warm-night':
      return 'green';
    case 'dark':
      return 'green';
    case 'blue-day':
    case 'blue-night':
    case 'cool-day':
    case 'cool-night':
      return 'green';
    case 'clay-day':
    case 'clay-night':
      return 'clay';
    case 'high-contrast-dark':
      return 'high-contrast';
    default:
      return DEFAULT_PALETTE;
  }
}

/** True if a stored (possibly legacy) value implies a night/dark form —
 *  used to seed the day/night toggle for rows saved before the toggle
 *  existed. */
export function legacyValueIsNight(
  stored: string | null | undefined
): boolean {
  return (
    stored === 'dark' ||
    stored === 'high-contrast-dark' ||
    stored === 'green-night' ||
    stored === 'blue-night' ||
    stored === 'clay-night' ||
    stored === 'warm-night' ||
    stored === 'cool-night'
  );
}

export function getPalette(id: string | null | undefined): Palette {
  const pid = resolvePaletteId(id);
  return PALETTES.find((p) => p.id === pid) ?? PALETTES[0];
}

/**
 * Resolve a palette choice + day/night into the actual CSS variables
 * to apply.
 */
export function resolveColors(
  paletteIdOrLegacy: string | null | undefined,
  night: boolean
): { colors: Record<string, string>; isDark: boolean; appliedId: string } {
  const palette = getPalette(paletteIdOrLegacy);
  const colors = night ? palette.night : palette.day;
  return {
    colors,
    isDark: night,
    appliedId: `${palette.id}-${night ? 'night' : 'day'}`
  };
}
