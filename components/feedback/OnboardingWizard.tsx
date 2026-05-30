'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useDismissIntro } from '@/lib/supabase/intro';
import { useSetTextScale } from '@/lib/supabase/textScale';
import { useSetNightMode } from '@/lib/supabase/colorScheme';
import { useSetLayoutPreference } from '@/lib/supabase/layoutPreference';
import {
  isTutorialReplayRequested,
  clearTutorialReplay
} from '@/lib/tutorialReplay';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import {
  GraphBandsIllustration,
  ActionRowIllustration,
  RecordIllustration,
  CheckinScaleIllustration
} from '@/components/feedback/onboardingIllustrations';

/**
 * Onboarding wizard.
 *
 * Shown at the top of a role's main screen the first time the account
 * is used (profile.has_seen_intro), or any time the user asks to redo
 * it from the account menu (a transient replay flag — see
 * lib/tutorialReplay). Finishing or skipping persists has_seen_intro
 * and clears the replay flag.
 *
 * Each role gets illustrated steps showing the features they'll use:
 *   - Patient: what it is → how a weekly check-in works (illustrated
 *     0–10 scale) → comfort. Patients don't read progress graphs (the
 *     app is no-scorekeeping for them by design), so their feature
 *     illustration is the check-in.
 *   - Clinician: what it is → how it works → reading the graph
 *     (bands + two lines, then a live tappable sample) → the action
 *     row → recording a treatment → comfort.
 *   - Therapist: what it is → how it works → reading the graph → the
 *     action row → recording progress → comfort.
 *
 * The graph-reading step pairs a stylised bands diagram (what the
 * colours and lines mean) with a live, tappable GoalProgressView on
 * sample data (so "tap a dot" is literally true and always matches
 * the real component).
 *
 * Illustrations use the app's own colour tokens and respond to night
 * mode; all their text is passed in for localisation. Copy is in the
 * `intro` namespace.
 */
type StepId =
  | 'intro'
  | 'how'
  | 'graph'
  | 'actions'
  | 'record'
  | 'checkin'
  | 'comfort';

/* Sample data for the live mini-graph in the graph-reading step.
   Chosen so every teaching point is visible at once: several reported
   weeks (filled dots + line), one week with a comment (speech bubble),
   one skipped week (line breaks, grey ring), and a couple of therapist
   assessment points (second line). Values are GAS levels (−2..+2);
   nrs is the raw 0–10 the patient reported. */
const SAMPLE_RATINGS = [
  { weekNumber: 1, value: 0 as const, nrs: 5, reported: true },
  {
    weekNumber: 2,
    value: 1 as const,
    nrs: 7,
    reported: true,
    comment: 'Holding the cup feels steadier this week.',
    submitterLabel: 'self' as const
  },
  { weekNumber: 3, value: 1 as const, nrs: 7, reported: true },
  { weekNumber: 4, value: null, nrs: null, reported: false },
  { weekNumber: 5, value: 2 as const, nrs: 9, reported: true },
  { weekNumber: 6, value: 1 as const, nrs: 8, reported: true }
];

const SAMPLE_PHYSIO = [
  { weekNumber: 3, nrs: 6, value: 0 as const, note: null },
  { weekNumber: 6, nrs: 8, value: 1 as const, note: 'Good carryover into daily tasks.' }
];

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
  // Whether a redo was requested. Initialised eagerly from the flag so
  // it's caught on first render, and also re-checked on mount. (Lazy
  // initialiser runs once per mount, before paint.)
  const [replay, setReplay] = useState(() => isTutorialReplayRequested());
  useEffect(() => {
    if (isTutorialReplayRequested()) setReplay(true);
  }, []);

  if (!profile || hidden) return null;
  // Only show for the role whose screen this is.
  if (profile.role !== role) return null;
  // Show when the account hasn't seen it yet, OR a replay was asked
  // for. (Replay wins over the persistent flag.)
  if (profile.hasSeenIntro && !replay) return null;

  const isProfessional = role === 'clinician' || role === 'physiotherapist';

  // Per-role step lists.
  const steps: StepId[] =
    role === 'patient'
      ? ['intro', 'checkin', 'comfort']
      : ['intro', 'how', 'graph', 'actions', 'record', 'comfort'];

  const total = steps.length;
  const current = steps[stepIndex];
  const isLast = stepIndex === total - 1;

  const finish = () => {
    setHidden(true); // instant — don't wait on the network
    clearTutorialReplay();
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
    title = t(`${role}HowTitle`);
    body = (
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        {t(`${role}HowBody`)}
      </p>
    );
  } else if (current === 'graph') {
    title = t('graphTitle');
    body = (
      <div className="mt-2">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {t('graphBody')}
        </p>
        <div className="mt-4">
          <GraphBandsIllustration
            betterLabel={t('graphBetter')}
            expectedLabel={t('graphExpected')}
            belowLabel={t('graphBelow')}
            patientLabel={t('graphPatientLine')}
            therapistLabel={t('graphTherapistLine')}
          />
        </div>
        {/* Live, tappable sample of the real chart so "tap a dot" is
            literally true and always matches the actual component. */}
        <p className="mt-4 text-[14px] font-semibold text-ink">
          {t('graphTryTitle')}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {t('graphTryHint')}
        </p>
        <div className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3">
          <GoalProgressView
            goalText={t('graphSampleGoal')}
            currentWeek={8}
            ratings={SAMPLE_RATINGS}
            physioRatings={SAMPLE_PHYSIO}
          />
        </div>
      </div>
    );
  } else if (current === 'actions') {
    title = t('actionsTitle');
    body = (
      <div className="mt-2">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {role === 'clinician' ? t('actionsBodyClinician') : t('actionsBodyTherapist')}
        </p>
        <div className="mt-4">
          <ActionRowIllustration
            labels={
              role === 'clinician'
                ? [
                    t('actionSuggestions'),
                    t('actionTherapist'),
                    t('actionHistory'),
                    t('actionExport')
                  ]
                : [t('actionProgress'), t('actionSuggest'), t('actionPlan')]
            }
          />
        </div>
      </div>
    );
  } else if (current === 'record') {
    title = role === 'clinician' ? t('recordTitleClinician') : t('recordTitleTherapist');
    body = (
      <div className="mt-2">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {role === 'clinician' ? t('recordBodyClinician') : t('recordBodyTherapist')}
        </p>
        <div className="mt-4">
          <RecordIllustration
            fieldLabels={
              role === 'clinician'
                ? [t('recordF1'), t('recordF2'), t('recordF3')]
                : [t('recordPF1'), t('recordPF2')]
            }
            buttonLabel={
              role === 'clinician' ? t('recordSaveClinician') : t('recordSaveTherapist')
            }
          />
        </div>
      </div>
    );
  } else if (current === 'checkin') {
    title = t('checkinTitle');
    body = (
      <div className="mt-2">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {t('checkinBody')}
        </p>
        <div className="mt-4">
          <CheckinScaleIllustration
            lowLabel={t('checkinLow')}
            highLabel={t('checkinHigh')}
          />
        </div>
      </div>
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
