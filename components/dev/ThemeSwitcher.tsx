'use client';

import { useEffect, useState } from 'react';
import { PALETTES } from '@/lib/palettes';

/**
 * Floating theme switcher — FOR USER TESTING ONLY.
 *
 * Lets a tester switch the whole app between candidate palettes live,
 * while using real screens. It overrides the colour CSS variables on
 * <html>; every screen re-themes instantly because the entire app
 * reads those variables (see globals.css and lib/palettes.ts).
 *
 * ── REMOVING THIS BEFORE THE REAL PILOT ──────────────────────────────
 * This must NOT be in front of real patients. To remove it, set
 * THEME_SWITCHER_ENABLED to false (one line) — the component then
 * renders nothing and applies no overrides. Or delete the <ThemeSwitcher/>
 * line from the layout. The chosen palette can then be baked into
 * globals.css :root permanently.
 * ─────────────────────────────────────────────────────────────────────
 *
 * The selection is kept in component state only — intentionally not
 * persisted, so every tester/session starts from the real (current)
 * palette and the choice is deliberate each time.
 */
const THEME_SWITCHER_ENABLED = true;

export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState('current');

  // Apply the selected palette's variables to <html>. The 'current'
  // palette's values equal globals.css, so selecting it is a no-op
  // visually — but we still set them, so switching back works.
  useEffect(() => {
    if (!THEME_SWITCHER_ENABLED) return;
    const palette = PALETTES.find((p) => p.id === activeId);
    if (!palette) return;
    const root = document.documentElement;
    for (const [key, value] of Object.entries(palette.colors)) {
      root.style.setProperty(key, value);
    }
  }, [activeId]);

  if (!THEME_SWITCHER_ENABLED) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100]">
      {open ? (
        <div className="w-[260px] rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3 shadow-xl">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold uppercase tracking-wider text-ink-muted">
              Theme (testing)
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close theme switcher"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-stone-soft"
            >
              ×
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {PALETTES.map((p) => {
              const selected = p.id === activeId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className={`w-full rounded-[var(--radius-button)] border p-2 text-left ${
                      selected
                        ? 'border-sage-deep bg-sage-soft'
                        : 'border-stone bg-cream hover:bg-stone-soft'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {/* Swatch trio: background, sage, amber. */}
                      <span className="flex shrink-0 gap-0.5">
                        {['--color-cream', '--color-sage-deep', '--color-amber-deep'].map(
                          (k) => (
                            <span
                              key={k}
                              className="h-4 w-4 rounded-sm border border-ink/10"
                              style={{ background: p.colors[k] }}
                            />
                          )
                        )}
                      </span>
                      <span className="text-[14px] font-semibold text-ink">
                        {p.name}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-snug text-ink-muted">
                      {p.note}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-11 items-center gap-2 rounded-full border border-stone bg-cream-soft px-4 text-[13px] font-semibold text-ink-soft shadow-lg hover:bg-stone-soft"
        >
          <span aria-hidden>🎨</span>
          Theme
        </button>
      )}
    </div>
  );
}
