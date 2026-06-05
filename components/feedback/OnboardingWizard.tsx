'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useDismissIntro } from '@/lib/supabase/intro';
import { useSetTextScale } from '@/lib/supabase/textScale';
import { useSetReadAloud } from '@/lib/supabase/readAloud';
import { useSetNightMode } from '@/lib/supabase/colorScheme';
import { useSetLayoutPreference } from '@/lib/supabase/layoutPreference';
import {
  useOwnSex,
  useSetOwnSex,
  useOwnDateOfBirth,
  useSetOwnDateOfBirth,
  type Sex
} from '@/lib/supabase/patientInfo';
import { BirthdatePicker } from '@/components/forms/BirthdatePicker';
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
  | 'details'
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
  role,
  mandatory = false,
  replayOnly = false,
  onComplete
}: {
  role: 'patient' | 'physiotherapist' | 'clinician';
  /** Hide the "skip" affordance so the only way out is finishing.
   *  Used by SetupGate for the mandatory first-run. */
  mandatory?: boolean;
  /** Per-page mounts pass this so they only show an explicitly
   *  requested replay — the mandatory first-run is owned by SetupGate. */
  replayOnly?: boolean;
  /** Called when the wizard is finished, so a host (SetupGate) can
   *  reveal the app immediately without waiting on the profile refetch. */
  onComplete?: () => void;
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
  // Per-page mounts only handle an explicitly requested replay; the
  // mandatory first-run is shown full-screen by SetupGate.
  if (replayOnly && !replay) return null;
  // Show when the account hasn't seen it yet, OR a replay was asked
  // for. (Replay wins over the persistent flag.)
  if (profile.hasSeenIntro && !replay) return null;

  const isProfessional = role === 'clinician' || role === 'physiotherapist';

  // Per-role step lists.
  const steps: StepId[] =
    role === 'patient'
      ? ['intro', 'details', 'checkin', 'comfort']
      : ['intro', 'how', 'graph', 'actions', 'record', 'comfort'];

  const total = steps.length;
  const current = steps[stepIndex];
  const isLast = stepIndex === total - 1;

  const finish = () => {
    setHidden(true); // instant — don't wait on the network
    clearTutorialReplay();
    dismiss.mutate();
    onComplete?.();
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
  } else if (current === 'details') {
    // Patient-only: collect sex + birthday. Renders its own nav (it
    // needs to save before advancing), so the shared footer is hidden
    // for this step.
    title = t('detailsTitle');
    body = (
      <DetailsStep
        onAdvance={goNext}
        labels={{
          intro: t('detailsBody'),
          sexLabel: t('detailsSexLabel'),
          sexUnset: t('detailsSexUnset'),
          dobLabel: t('detailsDobLabel'),
          day: t('detailsDobDay'),
          month: t('detailsDobMonth'),
          year: t('detailsDobYear'),
          months: [
            t('m1'), t('m2'), t('m3'), t('m4'), t('m5'), t('m6'),
            t('m7'), t('m8'), t('m9'), t('m10'), t('m11'), t('m12')
          ],
          sexOptions: {
            female: t('sexFemale'),
            male: t('sexMale'),
            other: t('sexOther'),
            preferNotToSay: t('sexPreferNotToSay')
          },
          skip: t('detailsSkip'),
          save: t('next'),
          saving: t('detailsSaving')
        }}
      />
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

        {/* NRS goals: the raw 0–10 the patient reported, no bands. */}
        <p className="mt-4 text-[14px] font-semibold text-ink">
          {t('graphNrsLabel')}
        </p>
        <div className="mt-2 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3">
          <GoalProgressView
            goalText={t('graphSampleGoalNrs')}
            kind="nrs"
            currentWeek={8}
            ratings={SAMPLE_RATINGS}
            physioRatings={SAMPLE_PHYSIO}
            nrsDirection="higherIsBetter"
          />
        </div>

        {/* GAS goals: descriptive bands. The illustration is the legend;
            the live chart below matches the real component. */}
        <p className="mt-4 text-[14px] font-semibold text-ink">
          {t('graphGasLabel')}
        </p>
        <div className="mt-2">
          <GraphBandsIllustration
            betterLabel={t('graphBetter')}
            expectedLabel={t('graphExpected')}
            belowLabel={t('graphBelow')}
            patientLabel={t('graphPatientLine')}
            therapistLabel={t('graphTherapistLine')}
          />
        </div>
        <div className="mt-2 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3">
          <GoalProgressView
            goalText={t('graphSampleGoal')}
            kind="gas"
            currentWeek={8}
            ratings={SAMPLE_RATINGS}
            physioRatings={SAMPLE_PHYSIO}
          />
        </div>

        {/* "Tap a dot" is literally true for both live charts above. */}
        <p className="mt-4 text-[14px] font-semibold text-ink">
          {t('graphTryTitle')}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {t('graphTryHint')}
        </p>
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
          <ComfortReadAloud
            label={t('comfortReadAloud')}
            onLabel={t('comfortReadAloudOn')}
            offLabel={t('comfortReadAloudOff')}
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

      {current !== 'details' && (
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
        ) : mandatory ? (
          <span aria-hidden />
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
      )}
    </section>
  );
}

/* ---- Patient details step: self-reported sex + date of birth. Saves
   via the patient-scoped own-field RPCs. Optional and skippable — the
   app works fine with these empty — and replay-safe: it pre-fills from
   whatever is already stored, so re-running the tutorial never wipes or
   nags. Renders its own Skip / Next so it can save before advancing. ---- */

function DetailsStep({
  onAdvance,
  labels
}: {
  onAdvance: () => void;
  labels: {
    intro: string;
    sexLabel: string;
    sexUnset: string;
    dobLabel: string;
    day: string;
    month: string;
    year: string;
    months: string[];
    sexOptions: Record<Sex, string>;
    skip: string;
    save: string;
    saving: string;
  };
}) {
  const ownSex = useOwnSex(true);
  const ownDob = useOwnDateOfBirth(true);
  const setSex = useSetOwnSex();
  const setDob = useSetOwnDateOfBirth();

  const [sex, setSexLocal] = useState<Sex | ''>('');
  const [dob, setDobLocal] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seed once from stored values (replay-safe pre-fill).
  useEffect(() => {
    if (!seeded && !ownSex.isLoading && !ownDob.isLoading) {
      setSexLocal((ownSex.data as Sex | null) ?? '');
      setDobLocal(ownDob.data ?? '');
      setSeeded(true);
    }
  }, [seeded, ownSex.isLoading, ownSex.data, ownDob.isLoading, ownDob.data]);

  const sexValues: Sex[] = ['female', 'male', 'other', 'preferNotToSay'];
  const saving = setSex.isPending || setDob.isPending;

  const saveAndAdvance = async () => {
    // Persist only what changed; both fields are optional. Failures are
    // swallowed to a console error rather than blocking onboarding —
    // the patient can always set these later in their profile.
    try {
      const nextSex = (sex || null) as Sex | null;
      if (nextSex !== ((ownSex.data as Sex | null) ?? null)) {
        await setSex.mutateAsync(nextSex);
      }
      const nextDob = dob || null;
      if (nextDob !== (ownDob.data ?? null)) {
        await setDob.mutateAsync(nextDob);
      }
    } catch (err) {
      console.error('Could not save onboarding details', err);
    } finally {
      onAdvance();
    }
  };

  const selectClass =
    'block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[15px] text-ink focus:border-sage focus:outline-none';

  return (
    <div className="mt-2">
      <p className="text-[15px] leading-relaxed text-ink-soft">
        {labels.intro}
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-[14px] font-semibold text-ink">
            {labels.sexLabel}
          </label>
          <select
            value={sex}
            onChange={(e) => setSexLocal(e.target.value as Sex | '')}
            className={`mt-1 ${selectClass}`}
          >
            <option value="">{labels.sexUnset}</option>
            {sexValues.map((v) => (
              <option key={v} value={v}>
                {labels.sexOptions[v]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[14px] font-semibold text-ink">
            {labels.dobLabel}
          </label>
          <div className="mt-1">
            <BirthdatePicker
              value={dob}
              onChange={setDobLocal}
              monthLabels={labels.months}
              labels={{
                day: labels.day,
                month: labels.month,
                year: labels.year
              }}
            />
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onAdvance}
          disabled={saving}
          className="text-[14px] font-semibold text-ink-muted hover:text-ink-soft disabled:opacity-60"
        >
          {labels.skip}
        </button>
        <button
          type="button"
          onClick={saveAndAdvance}
          disabled={saving}
          className="flex h-11 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-6 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-60"
        >
          {saving ? labels.saving : labels.save}
        </button>
      </div>
    </div>
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

function ComfortReadAloud({
  label,
  onLabel,
  offLabel
}: {
  label: string;
  onLabel: string;
  offLabel: string;
}) {
  const { profile } = useAuth();
  const setReadAloud = useSetReadAloud();
  const on = Boolean(profile?.readAloud);
  const opts: Array<{ value: boolean; text: string }> = [
    { value: false, text: offLabel },
    { value: true, text: onLabel }
  ];
  return (
    <div>
      <p className="text-[13px] font-semibold text-ink-soft">{label}</p>
      <div className="mt-2 flex gap-1.5">
        {opts.map((o) => {
          const isCurrent = on === o.value;
          return (
            <button
              key={o.text}
              type="button"
              aria-pressed={isCurrent}
              onClick={() => setReadAloud.mutate(o.value)}
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
