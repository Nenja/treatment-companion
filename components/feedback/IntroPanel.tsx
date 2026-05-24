'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/supabase/auth';
import { useDismissIntro } from '@/lib/supabase/intro';

/**
 * One-time orientation panel.
 *
 * Shown inline at the top of a role's main screen the first time that
 * account is used, then never again. It explains, in a few calm
 * sentences, what the app is and what the person will do — no carousel,
 * no steps, nothing to complete. A single "Got it" dismisses it.
 *
 * Visibility is profile-backed (profile.has_seen_intro). On dismiss we
 * both hide it locally (instant) and persist the flag (so it stays
 * gone on every device). If the persist call fails the panel still
 * hides for this session — worst case it reappears next login, which
 * is harmless.
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
  const [hidden, setHidden] = useState(false);

  if (!profile || profile.hasSeenIntro || hidden) return null;
  // Only show the panel for the role whose screen this is — guards
  // against, e.g., a physician somehow landing on the patient home.
  if (profile.role !== role) return null;

  const copy = COPY[role];

  const onDismiss = () => {
    setHidden(true); // instant — don't wait on the network
    dismiss.mutate();
  };

  return (
    <section
      className="mb-6 rounded-[var(--radius-card)] border border-sage/40 bg-sage-soft/60 p-5"
      aria-label="Welcome"
    >
      <h2 className="font-display text-[18px] leading-snug text-ink">
        {copy.title}
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {copy.body}
      </p>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-4 flex h-11 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-6 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
      >
        Got it
      </button>
    </section>
  );
}

/**
 * Role-specific copy. Kept short on purpose — the goal is a few seconds
 * of orientation, not a manual. English only for now; if the app's
 * Danish reviewer wants these localised they move into the message
 * files like everything else.
 */
const COPY: Record<
  'patient' | 'physiotherapist' | 'clinician',
  { title: string; body: string }
> = {
  patient: {
    title: 'Welcome to your treatment companion',
    body: 'This is where you check in on your treatment goals — usually once a week. Each check-in takes a couple of minutes, and your clinic sees your answers so they can adjust your care. When something is due, you’ll see it right here on this screen.'
  },
  physiotherapist: {
    title: 'Welcome',
    body: 'Unlock a patient with the visit code they show you. You can then record how their treatment goals are progressing, suggest new goals, and flag muscles for the physician to consider at the next injection visit.'
  },
  clinician: {
    title: 'Welcome',
    body: 'Unlock a patient with their visit code to review goals, record a treatment, and see how the patient and their physiotherapist have rated progress. Patient and physiotherapist suggestions appear on the patient’s page for you to act on.'
  }
};
