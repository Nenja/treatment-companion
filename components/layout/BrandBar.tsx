'use client';

import { useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Slim, brand-only strip shown at the very top of every page (rendered
 * once in the locale layout). Carries just the mark + product name so the
 * brand is consistent everywhere; account / help / page controls stay in
 * each page's own header below this strip.
 *
 * Alignment: every page renders its content inside a centred <main> whose
 * width varies (480 / 720 / 1080 / page-specific pixel widths). To line
 * the mark up exactly with the content column on every page, we measure
 * the live <main> box and match the strip's inner row to its left offset
 * and width. Because <main> shares the same `px-5` inset, the mark lands
 * precisely at the content's left edge. Falls back to a centred mid-width
 * row before measurement (and if no <main> is found).
 *
 * Intentionally a plain <div> (not <header>) and non-interactive, so it
 * adds no extra banner landmark and never precedes a page's
 * skip-to-content link in the tab order.
 */
export function BrandBar() {
  const t = useTranslations('app');
  const pathname = usePathname();
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    const measure = () => {
      const main = document.querySelector('main');
      if (!main) return;
      const r = main.getBoundingClientRect();
      setBox((prev) =>
        prev && prev.left === r.left && prev.width === r.width
          ? prev
          : { left: r.left, width: r.width }
      );
    };
    // Measure after layout for the current route, plus a short safety
    // re-measure to catch a loading→content swap that changes <main>.
    const raf = requestAnimationFrame(measure);
    const timer = window.setTimeout(measure, 250);
    // <main>'s width/left only change with the viewport (its size is
    // driven by CSS max-width, not content), so a resize listener covers
    // all steady-state changes; route changes are handled by the
    // pathname dependency.
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener('resize', measure);
    };
  }, [pathname]);

  return (
    <div className="border-b border-stone/70 bg-cream-soft">
      <div
        className="mx-auto flex max-w-[var(--max-w-page-mid)] items-center gap-2.5 px-5 py-2.5"
        style={
          box
            ? { marginLeft: box.left, marginRight: 0, width: box.width, maxWidth: 'none' }
            : undefined
        }
      >
        {/* Mark: a soft sage chevron — quiet visual identity, no logotype */}
        <svg
          aria-hidden
          width="22"
          height="22"
          viewBox="0 0 22 22"
          className="shrink-0 text-sage-deep"
        >
          <path
            d="M3 13 L11 5 L19 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3 17.5 L11 9.5 L19 17.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.35"
          />
        </svg>
        <span className="font-display text-[17px] tracking-tight text-ink">
          {t('name')}
        </span>
      </div>
    </div>
  );
}
