'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useDismissIntro } from '@/lib/supabase/intro';
import { useSetTextScale } from '@/lib/supabase/textScale';
import { useSetNightMode } from '@/lib/supabase/colorScheme';
import { useSetLayoutPreference } from '@/lib/supabase/layoutPreference';

/**
 * One-time onboarding wizard.
 *
 * Replaces the older single-panel IntroPanel. Shown inline at the top
 * of a role's main screen the first time the account is used, then
 * never again (profile.has_seen_intro, same flag as before — finishing
 * or skipping sets it).
 *
 * Depth varies by role, deliberately:
 *   - Patient: lighter. Two steps — what the app is, then a calm
 *     "make it comfortable to read" step. Patients in this group may
 *     be fatigued or cognitively loaded (stroke/TBI/MS), so the flow
 *     is short and every step has an obvious Skip.
 *   - Clinician / therapist: fuller. Three steps — what the app is,
 *     how it works (visit codes / session / what they do here), and
 *     the comfort step. Professionals can absorb more and there is
 *     genuinely more to explain.
 *
 * It is pure orientation plus optional comfort settings — it collects
 * no consent and gates nothing. The comfort step reuses the same
 * preference hooks as the account menu, and points the person at that
 * menu for changing things later.
 *
 * Copy is localised via the `intro` namespace.
 */
export function OnboardingWizard({
  role
}: {
  role: 'patient' | 'physiotherapist' | 'clinician';
}) {
  const { profile } = useAuth();
  const dismiss = useDismissIntro();
  const t = useTranslations('intro');
  const [hidden, setHidden] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);

  if (!profile || profile.hasSeenIntro || hidden) return null;
  // Only show for the role whose screen this is.
  if (profile.role !== role) return null;

  const isProfessional = role === 'clinician' || role === 'physiotherapist';

  // Step ids in order. Patients: intro + comfort. Professionals:
  // intro + how + comfort.
  const steps: Array<'intro' | 'how' | 'comfort'> = isProfessional
    ? ['intro', 'how', 'comfort']
    : ['intro', 'comfort'];

  const total = steps.length;
  const current = steps[stepIndex];
  const isLast = stepIndex === total - 1;

  const finish = () => {
    setHidden(true); // instant — don't wait on the network
    dismiss.mutate();
  };

  const goNext = () => {
    if (isLast) {
      finish();
    } else {
      setStepIndex((i) => i + 1);
    }
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  // Step body content.
  let title = '';
  let body: React.ReactNode = null;
  if (current === 'intro') {
    title = t(`${role}Title`);
    body = (
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {t(`${role}Body`)}
      </p>
    );
  } else if (current === 'how') {
    // Only professionals reach this step.
    title = t(`${role}HowTitle`);
    body = (
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {t(`${role}HowBody`)}
      </p>
    );
  } else {
    title = t('comfortTitle');
    body = (
      <div className="mt-2">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {t('comfortBody')}
        </p>
        <div className="mt-4 space-y-4">
          <ComfortTextSize label={t('comfortTextSize')} />
          <ComfortBrightness
            label={t('comfortBrightness')}
            dayLabel={t('comfortDay')}
            nightLabel={t('comfortNight')}
          />
          {/* Layout preference only matters on large screens, and only
              for professionals (patients never get a wide layout). */}
          {isProfessional && (
            <div className="hidden lg:block">
              <ComfortLayout
                label={t('comfortLayout')}
                wideLabel={t('comfortWide')}
                compactLabel={t('comfortCompact')}
              />
            </div>
          )}
        </div>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">
          {t('comfortWhereHint')}
        </p>
      </div>
    );
  }

  return (
    <section
      className="mb-6 rounded-[var(--radius-card)] border border-sage/40 bg-sage-soft/60 p-5"
      aria-label={title}
    >
      {/* Step counter — small, only shown when there's more than one
          step (so the patient's 2-step flow still feels light). */}
      {total > 1 && (
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('stepLabel', { current: stepIndex + 1, total })}
        </div>
      )}

      <h2 className="font-display text-[18px] leading-snug text-ink">
        {title}
      </h2>
      {body}

      <div className="mt-5 flex items-center justify-between gap-3">
        {/* Left side: Back (when past the first step) or Skip. */}
        {stepIndex > 0 ? (
          <button
            type="button"
            onClick={goBack}
            className="flex h-11 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('back')}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            className="text-[14px] font-semibold text-ink-muted hover:text-ink-soft"
          >
            {t('skip')}
          </button>
        )}

        {/* Right side: Next, or Get started on the last step. */}
        <button
          type="button"
          onClick={goNext}
          className="flex h-11 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-6 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
        >
          {isLast ? t('finish') : t('next')}
        </button>
      </div>
    </section>
  );
}

/* ---- Comfort step controls. These reuse the same persistence hooks
   as the account menu, so a change here is saved to the profile and
   reflected everywhere immediately. ---- */

function ComfortTextSize({ label }: { label: string }) {
  const { profile } = useAuth();
  const setScale = useSetTextScale();
  const current = profile?.textScale ?? 1.0;
  const options: Array<{ scale: 1.0 | 1.25 | 1.5 | 2.0; glyph: string }> = [
    { scale: 1.0, glyph: 'A' },
    { scale: 1.25, glyph: 'A+' },
    { scale: 1.5, glyph: 'A++' },
    { scale: 2.0, glyph: 'A+++' }
  ];
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-soft">{label}</p>
      <div className="mt-2 flex gap-1.5">
        {options.map((o) => {
          const isCurrent = Math.abs(current - o.scale) < 0.01;
          return (
            <button
              key={o.scale}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => setScale.mutate(o.scale)}
              className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border font-semibold ${
                isCurrent
                  ? 'border-sage bg-sage-soft text-sage-deep'
                  : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
              }`}
              style={{ fontSize: `${14 * o.scale}px` }}
            >
              {o.glyph}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ComfortBrightness({
  label,
  dayLabel,
  nightLabel
}: {
  label: string;
  dayLabel: string;
  nightLabel: string;
}) {
  const { profile } = useAuth();
  const setNight = useSetNightMode();
  const isNight = Boolean(profile?.nightMode);
  const opts: Array<{ night: boolean; text: string }> = [
    { night: false, text: dayLabel },
    { night: true, text: nightLabel }
  ];
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-soft">{label}</p>
      <div className="mt-2 flex gap-1.5">
        {opts.map((o) => {
          const isCurrent = isNight === o.night;
          return (
            <button
              key={o.text}
              type="button"
              aria-pressed={isCurrent}
              onClick={() =>
                setNight.mutate({
                  night: o.night,
                  currentPalette: profile?.colorScheme ?? null
                })
              }
              className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border text-[14px] font-semibold ${
                isCurrent
                  ? 'border-sage bg-sage-soft text-sage-deep'
                  : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ComfortLayout({
  label,
  wideLabel,
  compactLabel
}: {
  label: string;
  wideLabel: string;
  compactLabel: string;
}) {
  const { profile } = useAuth();
  const setLayout = useSetLayoutPreference();
  const current = profile?.layoutPreference ?? 'wide';
  const opts: Array<{ pref: 'wide' | 'compact'; text: string }> = [
    { pref: 'wide', text: wideLabel },
    { pref: 'compact', text: compactLabel }
  ];
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-soft">{label}</p>
      <div className="mt-2 flex gap-1.5">
        {opts.map((o) => {
          const isCurrent = current === o.pref;
          return (
            <button
              key={o.pref}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => setLayout.mutate({ preference: o.pref })}
              className={`flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border text-[14px] font-semibold ${
                isCurrent
                  ? 'border-sage bg-sage-soft text-sage-deep'
                  : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {o.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
