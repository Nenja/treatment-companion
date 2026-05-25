'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useDismissIntro } from '@/lib/supabase/intro';

/**
 * One-time orientation panel.
 *
 * Shown inline at the top of a role's main screen the first time that
 * account is used, then never again. It explains, in a few calm
 * sentences, what the app is and what the person will do — no carousel,
 * no steps, nothing to complete. A single dismiss button closes it.
 *
 * Visibility is profile-backed (profile.has_seen_intro). On dismiss we
 * both hide it locally (instant) and persist the flag (so it stays
 * gone on every device). If the persist call fails the panel still
 * hides for this session — worst case it reappears next login, which
 * is harmless.
 *
 * Copy is localised via the `intro` message namespace, so it follows
 * the app's English/Danish locale like everything else.
 *
 * Renders nothing when the user has already seen it, or while auth is
 * still resolving.
 */
export function IntroPanel({
  role
}: {
  role: 'patient' | 'physiotherapist' | 'clinician';
}) {
  const { profile } = useAuth();
  const dismiss = useDismissIntro();
  const t = useTranslations('intro');
  const [hidden, setHidden] = useState(false);

  if (!profile || profile.hasSeenIntro || hidden) return null;
  // Only show the panel for the role whose screen this is — guards
  // against, e.g., a physician somehow landing on the patient home.
  if (profile.role !== role) return null;

  // Role-specific title/body keys, e.g. patientTitle / patientBody.
  const title = t(`${role}Title`);
  const body = t(`${role}Body`);

  const onDismiss = () => {
    setHidden(true); // instant — don't wait on the network
    dismiss.mutate();
  };

  return (
    <section
      className="mb-6 rounded-[var(--radius-card)] border border-sage/40 bg-sage-soft/60 p-5"
      aria-label={title}
    >
      <h2 className="font-display text-[18px] leading-snug text-ink">
        {title}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {body}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 flex h-11 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-6 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
      >
        {t('dismiss')}
      </button>
    </section>
  );
}
