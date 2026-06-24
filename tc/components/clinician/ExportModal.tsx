'use client';

import { useTranslations } from 'next-intl';

import { useEffect, useState } from 'react';
import { useModalA11y } from '@/lib/useModalA11y';

interface ExportModalProps {
  initialText: string;
  /** Optional per-goal chart downloads, shown as a "Goal response charts"
   *  section with a PNG button each. The parent owns the renderer. */
  goalCharts?: { id: string; goalText: string; onDownload: () => void | Promise<void> }[];
  onClose: () => void;
}

/**
 * Modal that displays the EHR-paste text in an editable textarea with a
 * "Copy to clipboard" button. The clinician can edit the text inline
 * before copying — useful when their EHR has different conventions for
 * date formats, muscle names, abbreviations, etc.
 */
export function ExportModal({ initialText, goalCharts, onClose }: ExportModalProps) {
  const tA11y = useTranslations('a11y');
  const t = useTranslations('clinician.export');
  const [text, setText] = useState(initialText);
  const [copied, setCopied] = useState(false);

  // Reset the copied confirmation after a moment.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        return;
      } catch {
        // Fall through to manual select.
      }
    }
    // Fallback: select the textarea so the user can Ctrl/Cmd+C.
    const el = document.getElementById('export-text') as HTMLTextAreaElement | null;
    if (el) {
      el.focus();
      el.select();
    }
  };

  const containerRef = useModalA11y(onClose);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="flex w-full max-w-[560px] flex-col rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-stone/70 px-5 py-3">
          <h2 id="export-modal-title" className="font-display text-[18px] text-ink">
            {t('title')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tA11y('close')}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <p className="text-[14px] text-ink-muted">
            {t('intro')}
          </p>
          <textarea
            id="export-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="block w-full flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-3 font-mono text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
            spellCheck={false}
          />
          {goalCharts && goalCharts.length > 0 && (
            <div className="rounded-[var(--radius-button)] border border-stone bg-cream-soft/60 p-3">
              <p className="eyebrow">{t('chartsHeading')}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {goalCharts.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-[14px] text-ink">
                      {g.goalText}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void g.onDownload();
                      }}
                      className="flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream px-3 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M12 3v12" />
                        <path d="M7 10l5 5 5-5" />
                        <path d="M5 21h14" />
                      </svg>
                      PNG
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span
              className={`text-[14px] font-semibold ${copied ? 'text-sage-deep' : 'text-transparent'}`}
              aria-live="polite"
            >
              {copied ? t('copied') : '\u00A0'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                {t('close')}
              </button>
              <button
                type="button"
                onClick={copy}
                className="flex h-11 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
              >
                {t('copy')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
