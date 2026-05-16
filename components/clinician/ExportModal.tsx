'use client';

import { useEffect, useState } from 'react';

interface ExportModalProps {
  initialText: string;
  onClose: () => void;
}

/**
 * Modal that displays the EHR-paste text in an editable textarea with a
 * "Copy to clipboard" button. The clinician can edit the text inline
 * before copying — useful when their EHR has different conventions for
 * date formats, muscle names, abbreviations, etc.
 */
export function ExportModal({ initialText, onClose }: ExportModalProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 p-4 sm:items-center">
      <div className="flex w-full max-w-[560px] flex-col rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl">
        <div className="flex items-center justify-between border-b border-stone/70 px-5 py-3">
          <h2 className="font-display text-[18px] text-ink">
            Export for EHR
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md px-2 py-1 text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-3 p-5">
          <p className="text-[13px] text-ink-muted">
            Edit if needed, then copy. Nothing here is sent anywhere — copy
            it into your EHR yourself.
          </p>
          <textarea
            id="export-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={16}
            className="block w-full flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft p-3 font-mono text-[13px] leading-relaxed text-ink focus:border-sage focus:outline-none"
            spellCheck={false}
          />
          <div className="flex items-center justify-between gap-3">
            <span
              className={`text-[13px] font-semibold ${copied ? 'text-sage-deep' : 'text-transparent'}`}
              aria-live="polite"
            >
              {copied ? 'Copied to clipboard' : 'placeholder'}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                Close
              </button>
              <button
                type="button"
                onClick={copy}
                className="flex h-11 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-cream-soft hover:bg-ink-soft"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
