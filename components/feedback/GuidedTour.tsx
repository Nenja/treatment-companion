'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ModalPortal } from '@/components/feedback/ModalPortal';

/**
 * A guided "spotlight" tour. Given an ordered list of steps, it dims the
 * screen, cuts a hole over one target element at a time (the classic
 * box-shadow spotlight), and shows a caption card explaining that one
 * feature, with Back / Next / Done and a step counter.
 *
 * Targets are CSS selectors (use a `data-tour="…"` attribute on the
 * element). A page may render the same logical control in more than one
 * layout variant (e.g. a sidebar vs a body row); resolveTarget picks the
 * first VISIBLE match, so the spotlight always lands on what the user can
 * actually see.
 *
 * Keyboard: →/Enter advance, ← goes back, Esc exits. The card takes focus
 * each step. Honours prefers-reduced-motion (no smooth scroll / transition).
 * Colours come from the theme tokens, so it follows palette + design.
 *
 * Positioning is computed from getBoundingClientRect at runtime — it can't
 * be verified here, so it is a live QA item per page.
 */
export interface TourStep {
  /** CSS selector for the element to highlight (e.g. '[data-tour="goals"]'). */
  target: string;
  title: string;
  body: string;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

function resolveTarget(selector: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && el.offsetParent !== null) return el;
  }
  return els[0] ?? null;
}

export function GuidedTour({
  steps,
  onClose
}: {
  steps: TourStep[];
  onClose: () => void;
}) {
  const t = useTranslations('tour');
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;
  const next = useCallback(
    () => (isLast ? onClose() : setIndex((n) => n + 1)),
    [isLast, onClose]
  );
  const back = useCallback(
    () => setIndex((n) => Math.max(0, n - 1)),
    []
  );

  const measure = useCallback(() => {
    if (!step) return;
    const el = resolveTarget(step.target);
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // On each step: scroll the target into view, then measure.
  useEffect(() => {
    if (!step) return;
    const el = resolveTarget(step.target);
    el?.scrollIntoView({
      block: 'center',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
    const id = window.setTimeout(measure, prefersReducedMotion() ? 0 : 300);
    return () => window.clearTimeout(id);
  }, [step, measure]);

  // Keep the spotlight glued to the target as the page scrolls/resizes.
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [measure]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onClose]);

  if (!step) return null;

  const PAD = 6;
  const spot = box
    ? {
        top: box.top - PAD,
        left: box.left - PAD,
        width: box.width + PAD * 2,
        height: box.height + PAD * 2
      }
    : null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
  const CARD_W = Math.min(360, vw - 24);
  const CARD_EST_H = 190;
  let cardTop = Math.max(12, (vh - CARD_EST_H) / 2);
  let cardLeft = (vw - CARD_W) / 2;
  if (spot) {
    const below = spot.top + spot.height + 12;
    const placeAbove = below + CARD_EST_H > vh && spot.top - CARD_EST_H - 12 > 0;
    cardTop = placeAbove ? spot.top - CARD_EST_H - 12 : Math.min(below, vh - CARD_EST_H - 12);
    cardTop = Math.max(12, cardTop);
    cardLeft = Math.min(
      Math.max(12, spot.left + spot.width / 2 - CARD_W / 2),
      Math.max(12, vw - CARD_W - 12)
    );
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[200]"
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
      >
        {/* Spotlight (or full dim if the target isn't on screen). */}
        {spot ? (
          <div
            aria-hidden
            style={{
              position: 'fixed',
              top: spot.top,
              left: spot.left,
              width: spot.width,
              height: spot.height,
              borderRadius: 'var(--radius-button)',
              boxShadow: '0 0 0 9999px rgba(20, 20, 20, 0.55)',
              outline: '2px solid var(--color-sage-deep)',
              transition: prefersReducedMotion() ? 'none' : 'all 0.2s ease',
              pointerEvents: 'none'
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(20, 20, 20, 0.55)'
            }}
          />
        )}

        {/* Transparent blocker: keeps the page behind non-interactive while
            the tour runs. Sits under the card (declared before it). */}
        <div aria-hidden style={{ position: 'fixed', inset: 0 }} />

        <div
          ref={cardRef}
          tabIndex={-1}
          className="fixed w-[min(360px,calc(100vw-24px))] rounded-[var(--radius-card)] border border-stone bg-cream p-4 shadow-xl outline-none"
          style={{ top: cardTop, left: cardLeft }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {t('step', { current: index + 1, total: steps.length })}
          </p>
          <h2 className="mt-1 font-display text-[18px] leading-tight text-ink">
            {step.title}
          </h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            {step.body}
          </p>
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-[13px] font-semibold text-ink-muted hover:text-ink"
            >
              {t('skip')}
            </button>
            <div className="flex gap-2">
              {!isFirst && (
                <button
                  type="button"
                  onClick={back}
                  className="flex h-10 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
                >
                  {t('back')}
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
              >
                {isLast ? t('done') : t('next')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
