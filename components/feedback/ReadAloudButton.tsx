'use client';

import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useSpeak } from '@/lib/useSpeak';

/**
 * A small speaker button that reads the given text aloud on tap.
 *
 * Self-gating: it renders nothing unless the signed-in user has turned
 * on the read-aloud preference AND the device supports speech synthesis
 * AND the device has a voice for the current language (so it never reads in
 * the wrong-language fallback voice) AND there is text to read. That means callers can drop it in next to
 * any patient-facing text without their own conditional — it simply
 * disappears for everyone who hasn't opted in.
 */
export function ReadAloudButton({
  text,
  className = ''
}: {
  text: string;
  className?: string;
}) {
  const { profile } = useAuth();
  const { speak, supported, hasVoice } = useSpeak();
  const tA11y = useTranslations('a11y');

  if (!profile?.readAloud || !supported || !hasVoice || !text?.trim())
    return null;

  return (
    <button
      type="button"
      onClick={() => speak(text)}
      aria-label={tA11y('readAloud')}
      title={tA11y('readAloud')}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-sage/40 bg-cream text-sage-deep hover:bg-sage-soft ${className}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.5 5.5a9 9 0 0 1 0 13" />
      </svg>
    </button>
  );
}
