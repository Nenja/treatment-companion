'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useTouchClinicianSession
} from '@/lib/supabase/clinicianSession';
import {
  useClinicianPatientData,
  useSaveTreatmentSession,
  useStartCycleWithTreatment,
  usePreviousTreatment,
  useSetPatientMedication,
  type ClinicianTreatmentRecord
} from '@/lib/supabase/clinicianPatient';
import { todayIso, isToday } from '@/lib/dates';
import { useSessionExpiryWarning } from '@/lib/useSessionExpiryWarning';
import {
  GUIDANCE_METHODS,
  INJECTION_SIDES,
  injectionSideLabel,
  type GuidanceMethod,
  type InjectionSide
} from '@/lib/types';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { useToast } from '@/components/feedback/Toast';
import { useModalA11y } from '@/lib/useModalA11y';
import { useWideLayout } from '@/lib/useWideLayout';
import { EndSessionButton } from '@/components/clinician/EndSessionButton';
import { isSessionEndingDeliberately } from '@/lib/sessionEndSignal';
import { classifyError } from '@/lib/feedback';

interface InjectionDraft {
  muscle: string;
  side: InjectionSide;
  doseUnits: string;
  note: string;
  /** UI-only: whether the per-muscle note input is revealed. Notes are
   *  hidden behind a small "+ add note" link by default, since most
   *  muscles don't need one. Set true automatically when an existing
   *  note is loaded; otherwise toggled when the clinician taps + add note. */
  noteOpen: boolean;
}

function emptyInjection(): InjectionDraft {
  return { muscle: '', side: 'left', doseUnits: '', note: '', noteOpen: false };
}

export default function TreatmentRecordPage() {
  // useSearchParams (read in the worker) requires a Suspense boundary
  // for the build to prerender this route — same pattern as the
  // new-goal / suggestion / checkin pages.
  return (
    <Suspense fallback={<div className="min-h-dvh bg-cream" />}>
      <TreatmentRecordInner />
    </Suspense>
  );
}

function TreatmentRecordInner() {
  const router = useRouter();
  const locale = useLocale();
  const { user, profile, loading: authLoading } = useAuth();
  const wide = useWideLayout();
  // Width of the header row and the main column. When the user
  // prefers the wide layout, both expand at the lg breakpoint;
  // otherwise they stay at the narrow width on every screen.
  const headerWidthClass = wide
    ? 'mx-auto flex max-w-[var(--max-w-page-narrow)] items-center justify-between px-5 py-4 lg:max-w-[var(--max-w-page-wide)]'
    : 'mx-auto flex max-w-[var(--max-w-page-narrow)] items-center justify-between px-5 py-4';
  const mainWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-24 pt-6 lg:max-w-[var(--max-w-page-wide)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-24 pt-6';
  // The two-pane grid wrapper. When wide, becomes a 340px + form grid
  // at lg; when compact, stays a plain block (single-column) so the
  // page reads top-to-bottom even on a large screen.
  const paneGridClass = wide
    ? 'lg:mt-6 lg:grid lg:grid-cols-[340px_1fr] lg:gap-6 lg:items-start'
    : '';
  const asideClass = wide ? 'lg:sticky lg:top-6' : '';
  // Reference cards container: stacks on mobile, row on sm, and when
  // wide also stacks again at lg (narrow aside). When compact, the
  // sm-row behaviour is kept (cards side-by-side) since there's no
  // narrow aside to fit into.
  const refCardsClass = wide
    ? 'mt-4 flex flex-col gap-3 sm:flex-row sm:items-start lg:flex-col lg:items-stretch'
    : 'mt-4 flex flex-col gap-3 sm:flex-row sm:items-start';
  // Muscle-row element classes. When wide, the row goes single-line at
  // lg (name flexes, side/units fixed width, × at the end). When
  // compact, it stays in the two-line mobile shape on every screen.
  const muscleRowClass = wide
    ? 'flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3'
    : 'flex flex-col gap-2';
  const muscleNameWrapClass = wide
    ? 'flex items-center gap-2 lg:flex-1'
    : 'flex items-center gap-2';
  const muscleSideUnitsWrapClass = wide
    ? 'flex gap-2 lg:gap-3 lg:shrink-0'
    : 'flex gap-2';
  const muscleSideLabelClass = wide
    ? 'flex flex-1 items-center gap-2 lg:flex-none'
    : 'flex flex-1 items-center gap-2';
  const muscleSelectClass = wide
    ? `${inputClasses} flex-1 lg:w-32 lg:flex-none`
    : `${inputClasses} flex-1`;
  const muscleUnitsInputClass = wide
    ? `${inputClasses} flex-1 lg:w-20 lg:flex-none`
    : `${inputClasses} flex-1`;
  // The × button homes: inline-with-name (shown on mobile, and also on
  // every screen when compact) vs end-of-row (shown only at lg when
  // wide). When compact there is no end-of-row ×, and the inline one
  // is always visible.
  const muscleRemoveInlineClass = wide
    ? '-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-stone-soft hover:text-ink lg:hidden'
    : '-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-stone-soft hover:text-ink';
  const muscleRemoveEndClass =
    '-m-1.5 hidden h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-stone-soft hover:text-ink lg:flex';
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const dataQuery = useClinicianPatientData(
    profile?.id ?? null,
    profile?.role,
    sessionQuery.data?.patientId ?? null
  );
  const save = useSaveTreatmentSession();
  const startCycleWithTreatment = useStartCycleWithTreatment();
  const touchSession = useTouchClinicianSession();
  const toast = useToast();
  const tFeedback = useTranslations('feedback');

  // New-cycle mode: reached from the "start new cycle" dialog, which
  // passes ?newCycle=1&date=YYYY-MM-DD. In this mode NO cycle exists
  // yet — it is created together with the treatment on save, so
  // cancelling here creates nothing. Otherwise we are editing the
  // current cycle's treatment.
  const searchParams = useSearchParams();
  const isNewCycle = searchParams.get('newCycle') === '1';
  const newCycleDate = searchParams.get('date');

  // Keep the unlock session alive while the clinician fills the form.
  // Filling a long treatment form IS activity and should count — but
  // we throttle to at most one touch per 60s so it isn't a request per
  // keystroke. Without this, a clinician spending many minutes on a
  // multi-muscle entry could have the session expire under them.
  const lastTouchRef = useRef(0);
  const touchActivity = useCallback(() => {
    const now = Date.now();
    if (now - lastTouchRef.current < 60_000) return;
    lastTouchRef.current = now;
    touchSession.mutate();
  }, [touchSession]);

  // Warn the clinician before the unlock session expires, as a safety
  // net for when they pause (a phone call mid-form). lastActivityAt is
  // refetched every 30s by the session query.
  const expiry = useSessionExpiryWarning(
    sessionQuery.data?.lastActivityAt
  );

  // Previous-cycle treatment for "Copy from previous". The hook only
  // fires once we know the current cycle's number (i.e. when dataQuery
  // resolves), and looks at all cycles with cycle_number < current.
  const previousTreatment = usePreviousTreatment(
    dataQuery.data?.patient.id ?? null,
    dataQuery.data?.cycle.cycleNumber ?? null,
    !!dataQuery.data
  );

  const [showCopyConfirm, setShowCopyConfirm] = useState(false);

  // Medication edit state. The view is read-only until the clinician
  // taps Edit; tapping Save calls set_patient_medication and exits
  // edit mode. Local-only state — server is the source of truth on
  // (re)load.
  const setMedication = useSetPatientMedication();
  const [editingMed, setEditingMed] = useState(false);
  const [medCurrent, setMedCurrent] = useState('');
  const [medPrevious, setMedPrevious] = useState('');
  // Compact-by-default: medication card is collapsed until the
  // clinician taps the summary line.
  const [medExpanded, setMedExpanded] = useState(false);
  // Last-treatment details modal — shown when the compact summary
  // line is tapped.
  const [showLastTreatmentModal, setShowLastTreatmentModal] =
    useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'clinician') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  // No session → unlock screen. Only on a SETTLED no-session result
  // (status 'success' + data null), never a transient null during a
  // background refetch — see the detailed note on the patient page.
  useEffect(() => {
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      // If the user is deliberately ending the session, the End
      // session flow handles navigation (with ?ended=1). Stand down so
      // we don't race it with a ?timeout=1 redirect.
      if (isSessionEndingDeliberately()) return;
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) +
          '?timeout=1'
      );
    }
  }, [sessionQuery.status, sessionQuery.data, router, locale]);

  // Form state.
  const [date, setDate] = useState(todayIso());
  const [drugProduct, setDrugProduct] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  const [dilution, setDilution] = useState('');
  const [guidance, setGuidance] = useState<GuidanceMethod>('ultrasound');
  const [notes, setNotes] = useState('');
  const [injections, setInjections] = useState<InjectionDraft[]>([
    emptyInjection()
  ]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (!dataQuery.data) return;

    if (isNewCycle) {
      // New cycle: start from a blank form (no prefill from the cycle
      // being closed), dated to the date chosen in the dialog. The
      // clinician can still "Copy from previous" inside the form.
      if (newCycleDate) setDate(newCycleDate);
      setHydrated(true);
      return;
    }

    // Editing the current cycle's treatment: prefill from it.
    const existing = dataQuery.data.treatment;
    if (existing) {
      setDate(existing.date);
      setDrugProduct(existing.drugProduct);
      setTotalUnits(String(existing.totalUnits));
      setDilution(existing.dilution ?? '');
      setGuidance(existing.guidance as GuidanceMethod);
      setNotes(existing.notes ?? '');
      setInjections(
        existing.injections.map((i) => ({
          muscle: i.muscle,
          side: i.side,
          doseUnits: String(i.doseUnits),
          note: i.note ?? '',
          noteOpen: !!(i.note && i.note.trim())
        }))
      );
    }
    setHydrated(true);
  }, [dataQuery.data, hydrated, isNewCycle, newCycleDate]);

  // Hydrate medication state separately from the form. Always reflect
  // the latest server values when NOT editing — so a clinician
  // returning to the page after a save sees their saved text. When
  // editing, we don't overwrite their in-progress changes.
  useEffect(() => {
    if (editingMed) return;
    if (!dataQuery.data) return;
    setMedCurrent(dataQuery.data.patient.currentAntispasticMedication ?? '');
    setMedPrevious(
      dataQuery.data.patient.previousAntispasticMedication ?? ''
    );
  }, [dataQuery.data, editingMed]);

  if (
    authLoading ||
    !profile ||
    profile.role !== 'clinician' ||
    sessionQuery.isLoading ||
    !sessionQuery.data ||
    dataQuery.isLoading ||
    !dataQuery.data
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  const { patient, cycle, treatment: existing } = dataQuery.data;

  // The treatment shown as "reference" and used by "copy from previous".
  // In new-cycle mode the most recent treatment is the CURRENT cycle's
  // (the one about to be closed) — usePreviousTreatment would return the
  // cycle before that, off by one. In edit mode it is the genuine
  // previous cycle.
  const referenceTreatment = isNewCycle
    ? existing
    : previousTreatment.data ?? null;

  const back = () =>
    router.push(
      locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`
    );

  /**
   * Fill all form fields from the reference treatment, EXCEPT the date
   * — that defaults to today (the new treatment is happening now, not
   * at the date of the previous session). Per-muscle notes are copied
   * verbatim along with everything else.
   */
  const doCopyFromPrevious = () => {
    const prev = referenceTreatment;
    if (!prev) return;
    setDate(isNewCycle && newCycleDate ? newCycleDate : todayIso());
    setDrugProduct(prev.drugProduct);
    setTotalUnits(String(prev.totalUnits));
    setDilution(prev.dilution ?? '');
    setGuidance(prev.guidance as GuidanceMethod);
    setNotes(prev.notes ?? '');
    setInjections(
      prev.injections.length > 0
        ? prev.injections.map((i) => ({
            muscle: i.muscle,
            side: i.side,
            doseUnits: String(i.doseUnits),
            note: i.note ?? '',
            noteOpen: !!(i.note && i.note.trim())
          }))
        : [emptyInjection()]
    );
    setShowCopyConfirm(false);
  };

  const updateInjection = (idx: number, patch: Partial<InjectionDraft>) => {
    setInjections((prev) =>
      prev.map((inj, i) => (i === idx ? { ...inj, ...patch } : inj))
    );
  };
  const removeInjection = (idx: number) =>
    setInjections((prev) => prev.filter((_, i) => i !== idx));
  const addInjection = () =>
    setInjections((prev) => [...prev, emptyInjection()]);

  const validInjections = injections.filter(
    (i) =>
      i.muscle.trim() &&
      i.doseUnits.trim() &&
      !Number.isNaN(parseFloat(i.doseUnits))
  );
  const totalUnitsNum = parseFloat(totalUnits);

  // Sum of the per-muscle doses entered so far. Shown to the clinician
  // as a plain figure — NOT compared to "Total units" and never
  // flagged. The app states the arithmetic; the clinician does the
  // reconciling. A comparison/warning would be the app passing
  // judgement on a clinical entry, which it deliberately does not do.
  const dosesSum = injections.reduce((sum, i) => {
    const n = parseFloat(i.doseUnits);
    return Number.isNaN(n) ? sum : sum + n;
  }, 0);
  // Tidy display: avoid a trailing ".0" on whole numbers.
  const dosesSumLabel = Number.isInteger(dosesSum)
    ? String(dosesSum)
    : String(Number(dosesSum.toFixed(2)));

  // A treatment record can be corrected only on the day it was
  // entered. In edit mode, if the existing treatment was recorded on an
  // earlier day, the form is locked — the only way to change treatment
  // after that is to start a new cycle. (New-cycle mode is never
  // locked: it is creating a fresh record now.)
  const editLocked =
    !isNewCycle && !!existing && !isToday(existing.recordedAt);

  const canSubmit =
    !editLocked &&
    date.trim() &&
    drugProduct.trim() &&
    totalUnits.trim() &&
    !Number.isNaN(totalUnitsNum) &&
    totalUnitsNum >= 0 &&
    validInjections.length > 0;

  // What the form still needs before it can be saved — so a disabled
  // Save button is never a silent dead end. Each item names a concrete
  // missing field; the clinician sees exactly what to fix.
  const missing: string[] = [];
  if (!date.trim()) missing.push('a treatment date');
  if (!drugProduct.trim()) missing.push('the drug product');
  if (!totalUnits.trim() || Number.isNaN(totalUnitsNum)) {
    missing.push('the total units');
  } else if (totalUnitsNum < 0) {
    missing.push('a total units value of zero or more');
  }
  if (validInjections.length === 0) {
    missing.push('at least one muscle with a name and a dose');
  }

  const submit = async () => {
    if (!canSubmit || save.isPending || startCycleWithTreatment.isPending) {
      return;
    }
    const injectionsPayload = validInjections.map((i) => ({
      muscle: i.muscle,
      side: i.side,
      doseUnits: parseFloat(i.doseUnits),
      note: i.note.trim() || undefined
    }));
    try {
      if (isNewCycle) {
        // Create the new cycle AND record the treatment atomically.
        // The cycle did not exist until this moment.
        await startCycleWithTreatment.mutateAsync({
          patientId: patient.id,
          date,
          drugProduct,
          totalUnits: totalUnitsNum,
          dilution: dilution.trim() || undefined,
          guidance,
          notes: notes.trim() || undefined,
          injections: injectionsPayload
        });
      } else {
        await save.mutateAsync({
          treatmentCycleId: cycle.id,
          date,
          drugProduct,
          totalUnits: totalUnitsNum,
          dilution: dilution.trim() || undefined,
          guidance,
          notes: notes.trim() || undefined,
          injections: injectionsPayload
        });
      }
      touchSession.mutate();
      toast.success(tFeedback('successTreatment'));
      back();
    } catch (err) {
      const key = classifyError(err);
      toast.error(tFeedback(key));
      // Unlock expired — kick back to the unlock screen with the
      // visit code so the clinician can re-enter and try again. The
      // form's data is lost, but that's accepted; the alternative is
      // keeping treatment data half-saved which is worse.
      if (key === 'errorClinicianUnlockExpired') {
        setTimeout(() => {
          router.push(
            locale === 'en' ? '/clinician' : `/${locale}/clinician`
          );
        }, 1500);
      }
    }
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className={headerWidthClass}>
          <button
            type="button"
            onClick={back}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            ← Back
          </button>
          <span className="eyebrow">Treatment record</span>
          <div className="flex items-center gap-2">
            <EndSessionButton role="clinician" />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main
        className={mainWidthClass}
        onInput={touchActivity}
      >
        <h1 className="font-display text-[24px] leading-tight text-ink">
          {isNewCycle
            ? 'Record treatment'
            : existing
              ? 'Edit treatment record'
              : 'Record treatment'}
        </h1>
        <p className="mt-1 text-[14px] text-ink-soft">
          {isNewCycle
            ? `For ${patient.displayName} · New cycle`
            : `For ${patient.displayName}`}
        </p>

        {/* Session-expiry warning. The unlock lasts one hour from the
            last activity; typing in this form extends it, but if the
            clinician pauses (an interruption mid-form) it can still run
            down. This banner gives clear lead time and a one-tap way to
            extend, so a long treatment entry isn't lost to a silent
            timeout. */}
        {expiry.state === 'expiring' && (
          <div
            role="alert"
            className="mt-5 rounded-[var(--radius-card)] border border-amber-deep/40 bg-amber-soft/40 p-4"
          >
            <p className="text-[15px] font-semibold text-ink">
              Your patient access is about to expire
            </p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              You have about {expiry.minutesLeft}{' '}
              {expiry.minutesLeft === 1 ? 'minute' : 'minutes'} left.
              Save this treatment, or keep your access open if you need
              more time.
            </p>
            <button
              type="button"
              onClick={() => {
                lastTouchRef.current = Date.now();
                touchSession.mutate(undefined, {
                  // Refetch the session so the new last_activity_at is
                  // picked up and the banner clears at once, rather
                  // than waiting up to 30s for the next poll.
                  onSuccess: () => sessionQuery.refetch()
                });
              }}
              disabled={touchSession.isPending}
              className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
            >
              Keep working
            </button>
          </div>
        )}

        {/* Two-pane layout on desktop (≥1024px). Reference cards live
            in a persistent left aside; the form sits on the right.
            On smaller screens, this collapses to the existing
            single-column flow — references on top, form below. The
            DOM order (references first, form second) is intentional
            so that mobile gets the same vertical order it has today. */}
        <div className={paneGridClass}>
          <aside className={asideClass}>
        {/* Reference cards — both compact and tappable. Medication
            expands inline (it's edited here, so the editing UI stays
            on-page). Last treatment opens a modal with full details
            and the Copy action. On mobile they stack; on sm+ they
            sit side-by-side to save vertical space. On lg+ (desktop
            two-pane), they stack again because the left aside is
            narrow. */}
        <div className={refCardsClass}>
          {/* Medication card */}
          <div className="flex-1 rounded-[var(--radius-card)] border border-stone bg-cream-soft">
            {!medExpanded ? (
              <button
                type="button"
                onClick={() => setMedExpanded(true)}
                className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-stone-soft/40"
              >
                <div className="min-w-0">
                  <div className="eyebrow">Anti-spastic medication</div>
                  <div className="mt-0.5 truncate text-[13px] text-ink-soft">
                    {dataQuery.data.patient.currentAntispasticMedication ?? (
                      <span className="text-ink-muted">
                        Not recorded — tap to add
                      </span>
                    )}
                  </div>
                </div>
                <span aria-hidden className="text-[14px] text-ink-muted">
                  ▾
                </span>
              </button>
            ) : (
              <div className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="eyebrow">Anti-spastic medication</div>
                  <div className="flex items-center gap-2">
                    {!editingMed && (
                      <button
                        type="button"
                        onClick={() => setEditingMed(true)}
                        className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (editingMed) return;
                        setMedExpanded(false);
                      }}
                      disabled={editingMed}
                      aria-label="Collapse"
                      className="-m-1.5 flex h-8 w-8 items-center justify-center rounded-full text-ink-muted hover:bg-stone-soft hover:text-ink disabled:opacity-30"
                    >
                      <span aria-hidden className="text-[14px]">
                        ▴
                      </span>
                    </button>
                  </div>
                </div>

                {!editingMed ? (
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="text-[12px] font-semibold text-ink-soft">
                        Current
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
                        {dataQuery.data.patient
                          .currentAntispasticMedication ?? (
                          <span className="text-ink-muted">
                            Not recorded yet.
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-ink-soft">
                        Previous
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
                        {dataQuery.data.patient
                          .previousAntispasticMedication ?? (
                          <span className="text-ink-muted">
                            Not recorded yet.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 space-y-3">
                    <div>
                      <label
                        htmlFor="med-current"
                        className="block text-[13px] font-semibold text-ink"
                      >
                        Current anti-spastic medication
                      </label>
                      <textarea
                        id="med-current"
                        value={medCurrent}
                        onChange={(e) => setMedCurrent(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="Drug, dose, frequency, start date (free text)"
                        className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="med-previous"
                        className="block text-[13px] font-semibold text-ink"
                      >
                        Previous anti-spastic medication
                      </label>
                      <textarea
                        id="med-previous"
                        value={medPrevious}
                        onChange={(e) => setMedPrevious(e.target.value)}
                        rows={3}
                        maxLength={4000}
                        placeholder="What was tried before, with reason for stopping if relevant"
                        className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMedication.mutate(
                            {
                              patientId: dataQuery.data!.patient.id,
                              currentAntispasticMedication:
                                medCurrent.trim() || null,
                              previousAntispasticMedication:
                                medPrevious.trim() || null
                            },
                            {
                              onSuccess: () => {
                                toast.success('Medication updated.');
                                setEditingMed(false);
                              },
                              onError: () =>
                                toast.error(
                                  'Could not save. Please try again.'
                                )
                            }
                          );
                        }}
                        disabled={setMedication.isPending}
                        className="rounded-[var(--radius-button)] bg-sage-deep px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
                      >
                        {setMedication.isPending ? '…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMedCurrent(
                            dataQuery.data?.patient
                              .currentAntispasticMedication ?? ''
                          );
                          setMedPrevious(
                            dataQuery.data?.patient
                              .previousAntispasticMedication ?? ''
                          );
                          setEditingMed(false);
                        }}
                        disabled={setMedication.isPending}
                        className="rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Last-treatment summary — tappable to open the full
              dialog. Only when one exists; otherwise the column is
              just empty space (which on mobile is invisible, and on
              sm+ is empty but balanced). */}
          {referenceTreatment && (
            <button
              type="button"
              onClick={() => setShowLastTreatmentModal(true)}
              className="flex-1 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3 text-left hover:bg-stone-soft/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="eyebrow">Last treatment</div>
                  <div className="mt-0.5 truncate text-[13px] text-ink-soft">
                    {referenceTreatment.drugProduct} ·{' '}
                    {referenceTreatment.totalUnits} units
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink-muted">
                    {referenceTreatment.injections.length}{' '}
                    {referenceTreatment.injections.length === 1
                      ? 'muscle'
                      : 'muscles'}{' '}
                    · tap for details
                  </div>
                </div>
                <span aria-hidden className="text-[14px] text-ink-muted">
                  ›
                </span>
              </div>
            </button>
          )}
        </div>
          </aside>

          {/* Right pane: the actual treatment form. */}
          <div>
        {/* Row 1: Date + Drug product — session setup fields entered
            before the per-muscle work begins. Total units has moved
            below the muscle list, since the physician records it once
            the injections are chosen (it's the conclusion, not the
            starting point). */}
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Field label="Date" inline>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label="Drug product" inline>
            <input
              type="text"
              value={drugProduct}
              onChange={(e) => setDrugProduct(e.target.value)}
              className={inputClasses}
              maxLength={60}
              placeholder="e.g. Botox"
            />
          </Field>
        </div>

        {/* Row 2: Dilution + Guidance — also session setup. */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Dilution" inline>
            <input
              type="text"
              value={dilution}
              onChange={(e) => setDilution(e.target.value)}
              className={inputClasses}
              maxLength={40}
              placeholder="250 IU/ml"
            />
          </Field>
          <Field label="Guidance" inline>
            <select
              value={guidance}
              onChange={(e) => setGuidance(e.target.value as GuidanceMethod)}
              className={inputClasses}
            >
              {GUIDANCE_METHODS.map((g) => (
                <option key={g} value={g}>
                  {labelForGuidance(g)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {/* Muscles section */}
        <h2 className="mt-8 font-display text-[18px] text-ink">
          Muscles injected
        </h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          One row per muscle.
        </p>
        <ul className="mt-3 divide-y divide-stone/60">
          {injections.map((inj, i) => (
            <li key={i} className="py-3 first:pt-0">
              {/* Row layout switches at lg breakpoint:
                  - Mobile: two lines per row. Top = name + ×. Bottom
                    = Side select + Units input side-by-side.
                  - Desktop (≥lg): all on one line. Name takes the
                    remaining flex room; Side and Units have fixed
                    widths; × sits at the end.
                  The × button is rendered conditionally in two
                  places: once inline with the name (mobile-only via
                  lg:hidden), once at the end of the row (lg-only via
                  hidden lg:flex). Same button visually, two homes. */}
              <div className={muscleRowClass}>
                {/* Name input + (on mobile) × button next to it */}
                <div className={muscleNameWrapClass}>
                  <input
                    type="text"
                    value={inj.muscle}
                    onChange={(e) =>
                      updateInjection(i, { muscle: e.target.value })
                    }
                    className={`${inputClasses} flex-1`}
                    placeholder="Muscle name (e.g. Gastrocnemius)"
                    maxLength={80}
                    aria-label={`Muscle ${i + 1} name`}
                  />
                  {injections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInjection(i)}
                      aria-label={`Remove muscle ${i + 1}`}
                      className={muscleRemoveInlineClass}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden
                      >
                        <line x1="6" y1="6" x2="18" y2="18" />
                        <line x1="6" y1="18" x2="18" y2="6" />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Side + Units: side-by-side. On mobile they each
                    take half the row (flex-1). On lg they have
                    fixed widths and sit inline with the name. */}
                <div className={muscleSideUnitsWrapClass}>
                  <label className={muscleSideLabelClass}>
                    <span className="text-[12px] text-ink-muted">Side</span>
                    <select
                      value={inj.side}
                      onChange={(e) =>
                        updateInjection(i, {
                          side: e.target.value as InjectionSide
                        })
                      }
                      className={muscleSelectClass}
                    >
                      {INJECTION_SIDES.map((s) => (
                        <option key={s} value={s}>
                          {injectionSideLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={muscleSideLabelClass}>
                    <span className="text-[12px] text-ink-muted">Units</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={inj.doseUnits}
                      onChange={(e) =>
                        updateInjection(i, { doseUnits: e.target.value })
                      }
                      className={muscleUnitsInputClass}
                    />
                  </label>
                </div>

                {/* × button at the END of the row, but only on lg.
                    On mobile, the × lives next to the name (above).
                    Only rendered at all when the wide layout is
                    active — in compact mode the inline × is always
                    visible instead. */}
                {wide && injections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInjection(i)}
                    aria-label={`Remove muscle ${i + 1}`}
                    className={muscleRemoveEndClass}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="6" y1="18" x2="18" y2="6" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Per-muscle note: hidden behind a tap-to-reveal link.
                  Most muscles don't need a note, so keeping the field
                  out until requested keeps the form compact. The
                  "noteOpen" flag is set true when the row is hydrated
                  from data that already has a note, and toggled by
                  the + add / × remove buttons. Removing clears the
                  text so it doesn't resurrect on next render. */}
              {inj.noteOpen ? (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[12px] text-ink-muted">Note</span>
                  <input
                    type="text"
                    value={inj.note}
                    onChange={(e) =>
                      updateInjection(i, { note: e.target.value })
                    }
                    className={`${inputClasses} flex-1`}
                    placeholder="e.g. high EMG activity"
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateInjection(i, { note: '', noteOpen: false })
                    }
                    aria-label={`Remove note from muscle ${i + 1}`}
                    className="-m-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-stone-soft hover:text-ink"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <line x1="6" y1="6" x2="18" y2="18" />
                      <line x1="6" y1="18" x2="18" y2="6" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => updateInjection(i, { noteOpen: true })}
                  className="mt-1 text-[12px] font-semibold text-sage-deep hover:text-ink"
                >
                  + add note
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addInjection}
          className="mt-3 flex h-10 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          + Add another muscle
        </button>

        {/* Total units — recorded after the per-muscle work is done,
            so it sits below the muscle list rather than at the top of
            the form. The per-muscle sum readout sits directly beneath
            it so the physician can compare the figure they entered
            against the running tally of the doses above. Constrained
            width on desktop since it's a short numeric field. */}
        <div className="mt-6 sm:max-w-[260px]">
          <Field label="Total units" inline>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={totalUnits}
              onChange={(e) => setTotalUnits(e.target.value)}
              className={inputClasses}
            />
            {dosesSum > 0 && (
              <p className="mt-1 text-[12px] text-ink-muted">
                Per-muscle sum:{' '}
                <span className="font-semibold tabular-nums text-ink-soft">
                  {dosesSumLabel}
                </span>
              </p>
            )}
          </Field>
        </div>

        {/* Session notes */}
        <Field label="Session notes" helper="Optional">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={inputClasses}
            maxLength={500}
          />
        </Field>

        {/* Locked: an old treatment record can't be edited (only
            same-day typo fixes are allowed). Explain why and point to
            the right action. */}
        {editLocked && (
          <div className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <p className="text-[14px] leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">
                This treatment can no longer be edited.
              </span>{' '}
              A treatment record can only be corrected on the day it was
              entered. To change treatment now, go back and start a new
              treatment cycle.
            </p>
          </div>
        )}

        {/* What's still needed — shown only when Save is disabled, so
            a greyed-out Save button is never unexplained. */}
        {!canSubmit && !editLocked && missing.length > 0 && (
          <p className="mt-6 text-[14px] leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">
              Before saving, please add:{' '}
            </span>
            {missing.join(', ')}.
          </p>
        )}

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={back}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {editLocked ? 'Back' : 'Cancel'}
          </button>
          {!editLocked && (
            <button
              type="button"
              onClick={submit}
              disabled={
                !canSubmit ||
                save.isPending ||
                startCycleWithTreatment.isPending
              }
              className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
            >
              {save.isPending || startCycleWithTreatment.isPending
                ? '…'
                : 'Save'}
            </button>
          )}
        </div>
          </div>
        </div>
      </main>

      {showCopyConfirm && (
        <CopyConfirmDialog
          onConfirm={doCopyFromPrevious}
          onCancel={() => setShowCopyConfirm(false)}
        />
      )}

      {showLastTreatmentModal && referenceTreatment && (
        <LastTreatmentDialog
          treatment={referenceTreatment}
          onClose={() => setShowLastTreatmentModal(false)}
          onCopyRequested={() => {
            const hasContent =
              drugProduct.trim() ||
              totalUnits.trim() ||
              dilution.trim() ||
              notes.trim() ||
              injections.some(
                (i) => i.muscle.trim() || i.doseUnits.trim()
              );
            // Close the details modal first so the confirm dialog
            // doesn't stack on top. The copy itself either fires
            // immediately or via the existing confirm modal.
            setShowLastTreatmentModal(false);
            if (hasContent) {
              setShowCopyConfirm(true);
            } else {
              doCopyFromPrevious();
            }
          }}
        />
      )}
    </div>
  );
}

function CopyConfirmDialog({
  onConfirm,
  onCancel
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const containerRef = useModalA11y(onCancel);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-confirm-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2
          id="copy-confirm-title"
          className="font-display text-[20px] leading-tight text-ink"
        >
          Overwrite current entries?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          You&apos;ve already entered some details. Copying from the
          previous treatment will replace what&apos;s here. The date
          will be set to today.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            Yes, copy and overwrite
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Read-only details view of the previous treatment, opened by tapping
 * the compact "Last treatment" summary card on the form. Shows drug,
 * units, dilution, the per-muscle breakdown, and a button to copy the
 * whole thing into the form being filled in. The actual copy
 * (with-or-without-confirm) is handled by the parent — this dialog
 * just signals via onCopyRequested.
 */
function LastTreatmentDialog({
  treatment,
  onClose,
  onCopyRequested
}: {
  treatment: ClinicianTreatmentRecord;
  onClose: () => void;
  onCopyRequested: () => void;
}) {
  const containerRef = useModalA11y(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="last-treatment-title"
        className="w-full max-w-[460px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2
          id="last-treatment-title"
          className="font-display text-[20px] leading-tight text-ink"
        >
          Last treatment
        </h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          {treatment.drugProduct} · {treatment.totalUnits} units
          {treatment.dilution && ` · ${treatment.dilution}`}
        </p>
        <ul className="mt-3 max-h-[280px] space-y-1 overflow-y-auto text-[14px] text-ink-soft">
          {treatment.injections.map((inj) => (
            <li key={inj.id}>
              {inj.muscle} · {injectionSideLabel(inj.side)} ·{' '}
              {inj.doseUnits} units
              {inj.note && (
                <span className="text-ink-muted"> — {inj.note}</span>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onCopyRequested}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            Copy into the new plan
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClasses =
  'mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none';

function Field({
  label,
  helper,
  inline,
  children
}: {
  label: string;
  helper?: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={inline ? 'mt-0' : 'mt-6'}>
      <label className="block text-[14px] font-semibold text-ink">
        {label}
      </label>
      {helper && <p className="mt-0.5 text-[14px] text-ink-muted">{helper}</p>}
      {children}
    </div>
  );
}

function labelForGuidance(g: GuidanceMethod): string {
  switch (g) {
    case 'emg':
      return 'EMG';
    case 'ultrasound':
      return 'Ultrasound';
    case 'usEmg':
      return 'Ultrasound + EMG';
    case 'electricalStimulation':
      return 'Electrical stimulation';
    case 'anatomicalLandmarks':
      return 'Anatomical landmarks';
    case 'none':
      return 'None';
    case 'other':
      return 'Other';
  }
}
