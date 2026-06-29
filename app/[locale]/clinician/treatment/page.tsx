'use client';
import { ErrorState } from '@/components/feedback/ErrorState';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
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
  useSetTreatmentHandoff,
  useStartCycleWithTreatment,
  usePreviousTreatment,
  type ClinicianTreatmentRecord,
  type FaceMarkInput,
  type FaceDisplayMode
} from '@/lib/supabase/clinicianPatient';
import { todayIso, isToday } from '@/lib/dates';
import { useSessionExpiryWarning } from '@/lib/useSessionExpiryWarning';
import {
  GUIDANCE_METHODS,
  INJECTION_SIDES,
  type GuidanceMethod,
  type InjectionSide
} from '@/lib/types';
import { useToast } from '@/components/feedback/Toast';
import { useModalA11y } from '@/lib/useModalA11y';
import { useWideLayout } from '@/lib/useWideLayout';
import { CockpitPanelDrawer } from '@/components/clinician/CockpitPanelDrawer';
import { TherapistInputPanel } from '@/components/clinician/TherapistInputPanel';
import { GoalHandoffNotes } from '@/components/clinician/GoalHandoffNotes';
import { EndSessionButton } from '@/components/clinician/EndSessionButton';
import { FaceMap } from '@/components/clinician/FaceMap';
import { ExportModal } from '@/components/clinician/ExportModal';
import { buildEhrExport, type ExportTranslator } from '@/lib/ehrExport';
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

type TreatmentRecordLoadedProps = {
  data: NonNullable<ReturnType<typeof useClinicianPatientData>['data']>;
  session: NonNullable<ReturnType<typeof useCurrentClinicianSession>['data']>;
  onSessionRefetch: () => void;
};

// Shell: data fetching + the auth/role/no-session redirect guards + the
// loading/error early-returns. ALL loaded-data hooks live in
// <TreatmentRecordLoaded> below, which mounts only once the data is in — so
// the guards here always run BEFORE those hooks. (This is the fix for the
// previous react-hooks/rules-of-hooks violation, where two effects sat after
// an early return in a single combined component.)
function TreatmentRecordInner() {
  const router = useRouter();
  const locale = useLocale();
  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const dataQuery = useClinicianPatientData(
    profile?.id ?? null,
    profile?.role,
    sessionQuery.data?.patientId ?? null
  );

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
      // If the user is deliberately ending the session, the End session flow
      // handles navigation (with ?ended=1). Stand down so we don't race it.
      if (isSessionEndingDeliberately()) return;
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) + '?timeout=1'
      );
    }
  }, [sessionQuery.status, sessionQuery.data, router, locale]);

  if (sessionQuery.isError || dataQuery.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream">
        <ErrorState
          onRetry={() => {
            sessionQuery.refetch();
            dataQuery.refetch();
          }}
        />
      </div>
    );
  }

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

  return (
    <TreatmentRecordLoaded
      data={dataQuery.data}
      session={sessionQuery.data}
      onSessionRefetch={() => sessionQuery.refetch()}
    />
  );
}

function TreatmentRecordLoaded({
  data,
  session,
  onSessionRefetch
}: TreatmentRecordLoadedProps) {
  const router = useRouter();
  const locale = useLocale();
  const wide = useWideLayout();
  // Single column capped at the mid width (720px) — wide enough for the
  // single-line muscle rows (which were built for the old ~700px form
  // column) but no longer stretched across the full 1080px. Mobile is
  // unaffected (viewport < 720). `wide` still drives the muscle-row
  // layout below.
  const headerWidthClass =
    'mx-auto flex max-w-[var(--max-w-page-mid)] items-center justify-between px-5 py-4';
  const mainWidthClass =
    'mx-auto max-w-[var(--max-w-page-mid)] px-5 pb-24 pt-6 lg:max-w-[var(--max-w-page-wide)]';
  // Single-column layout: the area selector and last-treatment card sit
  // at the top of the form (not a separate left column), side by side on
  // sm+ and stacked on mobile, per clinician request.
  const paneGridClass =
    'mt-5 lg:grid lg:grid-cols-[212px_minmax(0,1fr)] lg:gap-6 lg:items-start';
  const asideClass = 'mb-6 lg:mb-0 lg:sticky lg:top-4 lg:self-start';
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
  const save = useSaveTreatmentSession();
  const setHandoff = useSetTreatmentHandoff();
  const startCycleWithTreatment = useStartCycleWithTreatment();
  const touchSession = useTouchClinicianSession();
  const toast = useToast();
  const tFeedback = useTranslations('feedback');
  const t = useTranslations('treatment');
  const tExport = useTranslations('ehrExport');
  // Localised labels for guidance methods and injection sides — defined
  // here so they can use the page's translator. Replace the module-level
  // English helpers at the call sites.
  const guidanceLabel = (g: GuidanceMethod): string =>
    ({
      emg: t('guidanceEmg'),
      ultrasound: t('guidanceUltrasound'),
      usEmg: t('guidanceUsEmg'),
      electricalStimulation: t('guidanceElectricalStimulation'),
      anatomicalLandmarks: t('guidanceAnatomicalLandmarks'),
      none: t('guidanceNone'),
      other: t('guidanceOther')
    })[g];
  const sideLabel = (sideValue: InjectionSide): string =>
    ({
      left: t('sideLeft'),
      right: t('sideRight'),
      bilateral: t('sideBilateral')
    })[sideValue];

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
  const expiry = useSessionExpiryWarning(session.lastActivityAt);

  // Previous-cycle treatment for "Copy from previous". The hook only
  // fires once we know the current cycle's number (i.e. when dataQuery
  // resolves), and looks at all cycles with cycle_number < current.
  const previousTreatment = usePreviousTreatment(
    data.patient.id,
    data.cycle.cycleNumber,
    true
  );

  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [showTherapist, setShowTherapist] = useState(false);
  // After a successful save we show a confirmation step (instead of leaving
  // immediately) offering the EHR note for the treatment just recorded.
  const [saved, setSaved] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Last-treatment details modal — shown when the compact summary
  // line is tapped.
  const [showLastTreatmentModal, setShowLastTreatmentModal] =
    useState(false);

  // Form state.
  const [date, setDate] = useState(todayIso());
  const [drugProduct, setDrugProduct] = useState('');
  const [totalUnits, setTotalUnits] = useState('');
  // Whether the clinician has taken manual control of Total units.
  // While false, Total units auto-fills from the per-muscle sum (the
  // common case — the total IS the sum). The moment they type in the
  // field, or we hydrate a real saved value (editing / copy), it
  // becomes manual and we stop auto-filling. A "use the sum" affordance
  // lets them snap back to auto.
  const [totalManual, setTotalManual] = useState(false);
  const [dilution, setDilution] = useState('');
  const [guidance, setGuidance] = useState<GuidanceMethod>('ultrasound');
  const [notes, setNotes] = useState('');
  // Physician → therapist handoff for this cycle (the one downward channel,
  // therapist-only and never patient-visible). The note is the physician's
  // Short focus note for the therapist (also readable by the patient).
  const [therapistNote, setTherapistNote] = useState('');
  const [injections, setInjections] = useState<InjectionDraft[]>([
    emptyInjection()
  ]);
  // Treatment areas — two independent flags, at least one required.
  // Standard = located muscle injections (the muscle list below); Face =
  // facial marks placed on the face map. A cycle can be standard-only,
  // face-only, or both. faceMarks are located muscle injections with a
  // normalised position; faceDisplayMode is stored per cycle.
  const [includesStandard, setIncludesStandard] = useState(true);
  const [includesFace, setIncludesFace] = useState(false);
  const [faceDisplayMode, setFaceDisplayMode] =
    useState<FaceDisplayMode>('color');
  const [faceMarks, setFaceMarks] = useState<FaceMarkInput[]>([]);
  // Which form section the left-rail nav highlights (scroll-tracked).
  const [activeSec, setActiveSec] = useState('setup');
  // The rail total is the single home for the dose now; the manual
  // override (rare) is tucked behind an "Adjust" reveal.
  const [showTotalAdjust, setShowTotalAdjust] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (!data) return;

    if (isNewCycle) {
      // New cycle: start from a blank form (no prefill from the cycle
      // being closed), dated to the date chosen in the dialog. The
      // clinician can still "Copy from previous" inside the form.
      if (newCycleDate) setDate(newCycleDate);
      setHydrated(true);
      return;
    }

    // Editing the current cycle's treatment: prefill from it.
    const existing = data.treatment;
    const cycleData = data.cycle;
    if (existing) {
      setDate(existing.date);
      setDrugProduct(existing.drugProduct);
      setTotalUnits(String(existing.totalUnits));
      // The saved total is authoritative — don't let auto-fill
      // overwrite it with the current sum.
      setTotalManual(true);
      setDilution(existing.dilution ?? '');
      setGuidance(existing.guidance as GuidanceMethod);
      setNotes(existing.notes ?? '');
      setTherapistNote(existing.therapistNote ?? '');
      // Option A: standard injections have no position; face marks carry
      // a normalised pos_x/pos_y. Split the cycle's injections so the
      // muscle list and the face map each hydrate from their own.
      const standardInjections = existing.injections.filter(
        (i) => i.posX == null
      );
      const faceInjections = existing.injections.filter(
        (i) => i.posX != null
      );
      setInjections(
        standardInjections.length > 0
          ? standardInjections.map((i) => ({
              muscle: i.muscle,
              side: i.side,
              doseUnits: String(i.doseUnits),
              note: i.note ?? '',
              noteOpen: !!(i.note && i.note.trim())
            }))
          : [emptyInjection()]
      );
      setFaceMarks(
        faceInjections.map((i) => ({
          muscle: i.muscle,
          side: i.side,
          doseUnits: i.doseUnits,
          note: i.note ?? undefined,
          posX: i.posX as number,
          posY: i.posY as number
        }))
      );
      // Area flags + face display mode are cycle-level.
      setIncludesStandard(cycleData.includesStandard);
      setIncludesFace(cycleData.includesFace);
      setFaceDisplayMode(cycleData.faceDisplayMode);
    }
    setHydrated(true);
  }, [data, hydrated, isNewCycle, newCycleDate]);

  const {
    patient,
    cycle,
    treatment: existing,
    activeGoals,
    physioAssessments,
    physioGoalSuggestions,
    physioMuscleSuggestions
  } = data;
  const therapistSuggestionCount =
    physioGoalSuggestions.length + physioMuscleSuggestions.length;
  // Therapist modules (the input button + the physician->therapist handoff
  // panel) only become active once a therapist has actually engaged this
  // cycle — an evaluation (assessment) or a suggestion. Until then the
  // physician sees no therapist UI for this patient.
  const therapistHasEngaged =
    physioAssessments.length > 0 || therapistSuggestionCount > 0;
  // Goals a therapist has actually evaluated this cycle — the only goals that
  // get a per-goal handoff note input (therapist modules activate per goal on
  // evaluation).
  const therapistEvaluatedGoalIds = new Set<string>(
    physioAssessments.flatMap((a) => a.ratings.map((r) => r.approvedGoalId))
  );
  const handoffNoteGoals = activeGoals
    .filter((g) => therapistEvaluatedGoalIds.has(g.id))
    .map((g) => ({ id: g.id, text: g.patientFacingText }));

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
    setDilution(prev.dilution ?? '');
    setGuidance(prev.guidance as GuidanceMethod);
    setNotes(prev.notes ?? '');
    // Split the copied injections the same way as edit hydration:
    // standard (no position) vs face marks (normalised pos_x/pos_y).
    const prevStandard = prev.injections.filter((i) => i.posX == null);
    const prevFace = prev.injections.filter((i) => i.posX != null);
    setInjections(
      prevStandard.length > 0
        ? prevStandard.map((i) => ({
            muscle: i.muscle,
            side: i.side,
            doseUnits: String(i.doseUnits),
            note: i.note ?? '',
            noteOpen: !!(i.note && i.note.trim())
          }))
        : [emptyInjection()]
    );
    setFaceMarks(
      prevFace.map((i) => ({
        muscle: i.muscle,
        side: i.side,
        doseUnits: i.doseUnits,
        note: i.note ?? undefined,
        posX: i.posX as number,
        posY: i.posY as number
      }))
    );
    // Derive the areas from what was actually copied. Face display mode
    // isn't carried on a treatment record, so it keeps its current value.
    const copiedHasFace = prevFace.length > 0;
    const copiedHasStandard = prevStandard.length > 0;
    setIncludesStandard(copiedHasStandard || !copiedHasFace);
    setIncludesFace(copiedHasFace);
    // Return Total units to auto: the copied muscles re-derive the same
    // total, and if the clinician then tweaks a dose the total tracks
    // it (rather than silently keeping last time's figure). The sync
    // effect fills it from the copied muscles' sum.
    setTotalManual(false);
    setShowCopyConfirm(false);
  };

  /**
   * Entry point for the copy action from anywhere (the card button or
   * the details dialog). Copies immediately if the form is empty;
   * otherwise asks to confirm first, since copying overwrites whatever
   * has been entered.
   */
  const requestCopyFromPrevious = () => {
    const hasContent =
      drugProduct.trim() ||
      totalUnits.trim() ||
      dilution.trim() ||
      notes.trim() ||
      injections.some((i) => i.muscle.trim() || i.doseUnits.trim()) ||
      faceMarks.length > 0;
    if (hasContent) {
      setShowCopyConfirm(true);
    } else {
      doCopyFromPrevious();
    }
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

  // Sum of the per-muscle doses entered so far. Total units auto-fills
  // from this (see the sync effect) as a convenience — the total IS the
  // sum in the common case. The clinician can override the total
  // manually, and the app never flags or judges a mismatch: it offers
  // the arithmetic as a default and a one-tap reset, but the recorded
  // total is always whatever the clinician decides.
  // Auto-total source: the per-muscle sum (standard) plus the face-mark
  // sum (face). A hidden area contributes nothing, so toggling Standard
  // or Face off removes its doses from the auto-filled total. This keeps
  // the total meaningful in all three modes (standard-only, face-only,
  // both).
  const standardDosesSum = includesStandard
    ? injections.reduce((sum, i) => {
        const n = parseFloat(i.doseUnits);
        return Number.isNaN(n) ? sum : sum + n;
      }, 0)
    : 0;
  const faceDosesSum = includesFace
    ? faceMarks.reduce(
        (sum, m) => sum + (Number.isFinite(m.doseUnits) ? m.doseUnits : 0),
        0
      )
    : 0;
  const dosesSum = standardDosesSum + faceDosesSum;
  // Tidy display: avoid a trailing ".0" on whole numbers.
  const dosesSumLabel = Number.isInteger(dosesSum)
    ? String(dosesSum)
    : String(Number(dosesSum.toFixed(2)));
  // Rail running total: the effective Total units (manual override or
  // the per-muscle sum), plus a count of filled points for the subline.
  const totalDisplay = totalUnits.trim()
    ? totalUnits.trim()
    : dosesSum > 0
      ? dosesSumLabel
      : '0';
  const filledCount =
    (includesStandard
      ? injections.filter((x) => x.muscle.trim()).length
      : 0) + (includesFace ? faceMarks.length : 0);

  // Auto-fill Total units from the per-muscle sum while the clinician
  // hasn't taken manual control. Keeping the totalUnits *state* in sync
  // (rather than only displaying the sum) means all the existing
  // validation and save logic that reads totalUnits / totalUnitsNum
  // just works unchanged. When some doses are entered, mirror the sum;
  // when none are, leave it blank so the field doesn't show a bare 0.
  useEffect(() => {
    if (totalManual) return;
    const next = dosesSum > 0 ? dosesSumLabel : '';
    setTotalUnits((cur) => (cur === next ? cur : next));
  }, [totalManual, dosesSum, dosesSumLabel]);

  // Left-rail section nav: highlight the section nearest the top of the
  // viewport as the clinician scrolls. Re-runs when areas toggle, since
  // the muscle / face sections appear and disappear.
  useEffect(() => {
    const ids = ['setup', 'muscles', 'face', 'handoff'];
    const els = ids
      .map((id) => document.getElementById(`tsec-${id}`))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveSec(top.target.id.replace('tsec-', ''));
      },
      { rootMargin: '-15% 0px -75% 0px', threshold: 0 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [includesStandard, includesFace, therapistHasEngaged]);

  // A treatment record can be corrected only on the day it was
  // entered. In edit mode, if the existing treatment was recorded on an
  // earlier day, the form is locked — the only way to change treatment
  // after that is to start a new cycle. (New-cycle mode is never
  // locked: it is creating a fresh record now.)
  const editLocked =
    !isNewCycle && !!existing && !isToday(existing.recordedAt);

  // At least one area, and each selected area must have content:
  // Standard → ≥1 valid muscle injection; Face → ≥1 mark. Face marks are
  // always valid (FaceMap won't save one without a muscle + a dose).
  const hasArea = includesStandard || includesFace;
  const standardOk = !includesStandard || validInjections.length > 0;
  const faceOk = !includesFace || faceMarks.length > 0;

  const canSubmit =
    !editLocked &&
    hasArea &&
    date.trim() &&
    drugProduct.trim() &&
    totalUnits.trim() &&
    !Number.isNaN(totalUnitsNum) &&
    totalUnitsNum >= 0 &&
    standardOk &&
    faceOk;

  // What the form still needs before it can be saved — so a disabled
  // Save button is never a silent dead end. Each item names a concrete
  // missing field; the clinician sees exactly what to fix.
  const missing: string[] = [];
  if (!hasArea) missing.push(t('needArea'));
  if (!date.trim()) missing.push(t('needDate'));
  if (!drugProduct.trim()) missing.push(t('needDrugProduct'));
  if (!totalUnits.trim() || Number.isNaN(totalUnitsNum)) {
    missing.push(t('needTotalUnits'));
  } else if (totalUnitsNum < 0) {
    missing.push(t('needTotalNonNegative'));
  }
  if (includesStandard && validInjections.length === 0) {
    missing.push(t('needMuscle'));
  }
  if (includesFace && faceMarks.length === 0) {
    missing.push(t('needFaceMark'));
  }

  const submit = async () => {
    if (
      !canSubmit ||
      save.isPending ||
      startCycleWithTreatment.isPending ||
      setHandoff.isPending
    ) {
      return;
    }
    const injectionsPayload = validInjections.map((i) => ({
      muscle: i.muscle,
      side: i.side,
      doseUnits: parseFloat(i.doseUnits),
      note: i.note.trim() || undefined
    }));
    // Send standard injections only when the Standard area is on, and
    // face marks only when the Face area is on. Both RPCs receive the
    // four area fields: the cycle stores the flags + the display mode,
    // and face marks are persisted as located muscle injections.
    const standardInjectionsPayload = includesStandard ? injectionsPayload : [];
    const faceMarksPayload = includesFace ? faceMarks : [];
    try {
      let handoffCycleId: string;
      if (isNewCycle) {
        // Create the new cycle AND record the treatment atomically.
        // The cycle did not exist until this moment.
        handoffCycleId = await startCycleWithTreatment.mutateAsync({
          patientId: patient.id,
          date,
          drugProduct,
          totalUnits: totalUnitsNum,
          dilution: dilution.trim() || undefined,
          guidance,
          notes: notes.trim() || undefined,
          injections: standardInjectionsPayload,
          includesStandard,
          includesFace,
          faceDisplayMode,
          faceMarks: faceMarksPayload
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
          injections: standardInjectionsPayload,
          includesStandard,
          includesFace,
          faceDisplayMode,
          faceMarks: faceMarksPayload
        });
        handoffCycleId = cycle.id;
      }
      // Save (or clear) the physician → therapist handoff for this cycle.
      // Always called: an empty note + null flag clears any prior handoff,
      // so editing can remove it. Cycle-keyed, so the new-cycle id (returned
      // above) and the existing cycle id both work.
      await setHandoff.mutateAsync({
        cycleId: handoffCycleId,
        note: therapistNote,
        treatmentChanged: null
      });
      touchSession.mutate();
      toast.success(tFeedback('successTreatment'));
      // Stay on a confirmation step so the clinician can grab the EHR note for
      // the treatment just recorded; "Done" then returns to the patient page.
      setSaved(true);
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

  const navItems: { id: string; label: string }[] = [
    { id: 'setup', label: t('sessionSetupTitle') },
    ...(includesStandard ? [{ id: 'muscles', label: t('musclesTitle') }] : []),
    ...(includesFace ? [{ id: 'face', label: t('areaFace') }] : []),
    ...(therapistHasEngaged
      ? [{ id: 'handoff', label: t('handoffTitle') }]
      : [])
  ];

  return (
    <div className="min-h-dvh bg-cream">
      <AppHeader
        maxWidthClass="max-w-[var(--max-w-page-mid)] lg:max-w-[var(--max-w-page-wide)]"
        back={{ label: t('back'), onClick: back }}
        actions={<EndSessionButton role="clinician" />}
        helpPageKey="treatment"
      />

      <main
        className={mainWidthClass}
        onInput={touchActivity}
      >
        {showTherapist && (
          <CockpitPanelDrawer onClose={() => setShowTherapist(false)}>
            <TherapistInputPanel
              physioAssessments={physioAssessments}
              activeGoals={activeGoals}
              physioGoalSuggestions={physioGoalSuggestions}
              physioMuscleSuggestions={physioMuscleSuggestions}
              locale={locale}
            />
          </CockpitPanelDrawer>
        )}

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
                  onSuccess: () => onSessionRefetch()
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
        {/* Area selector + last-treatment, side by side on sm+ (stacked
            on mobile), at the top of the form. */}
        <div className="flex flex-col gap-4">
        {/* Page identity — moved into the rail so the form column starts at
            the very top with no blank band above it. */}
        <div>
          <h1 data-tour="intro" className="font-display text-[22px] leading-tight text-ink">
            {t('recordTitle')}
          </h1>
          <p className="mt-1 text-[13px] text-ink-soft">
            {t('forPatient', { name: patient.displayName })}
          </p>
        </div>
        {therapistHasEngaged && (
          <button
            type="button"
            onClick={() => setShowTherapist(true)}
            className="inline-flex items-center gap-2 self-start rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 2h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <path d="M9 12h6M9 16h4" />
            </svg>
            {t('therapistInputButton')}
            {therapistSuggestionCount > 0 && (
              <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-amber-deep px-1.5 text-[11px] font-bold text-on-accent">
                {therapistSuggestionCount}
              </span>
            )}
          </button>
        )}
        <div className="h-px bg-stone" />
        {/* Running total — the rail's signature. Reflects the effective
            Total units (manual override or per-muscle sum) so the dose
            being built stays in view while scrolling the form. */}
        <div>
          <div className="eyebrow">{t('runningTotalLabel')}</div>
          <div className="mt-0.5 flex items-baseline gap-1">
            <span className="font-display text-[32px] leading-none text-ink">
              {totalDisplay}
            </span>
            <span className="font-display text-[16px] text-ink-muted">
              {t('unitsSuffix')}
            </span>
          </div>
          <div className="mt-1 text-[12.5px] text-ink-muted">
            {drugProduct.trim() || '—'} · {filledCount} {t('musclePlural')}
          </div>
          {!showTotalAdjust ? (
            <button
              type="button"
              onClick={() => setShowTotalAdjust(true)}
              className="mt-2 text-[12px] font-semibold text-sage-deep hover:text-ink"
            >
              {t('adjustTotal')}
            </button>
          ) : (
            <div className="mt-2">
              <label className="block text-[12px] text-ink-soft">
                {t('fieldTotalUnits')}
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={totalUnits}
                onChange={(e) => {
                  setTotalManual(true);
                  setTotalUnits(e.target.value);
                }}
                className={inputClasses}
              />
              {!totalManual && dosesSum > 0 && (
                <p className="mt-1 text-[11px] leading-snug text-ink-muted">
                  {t('totalFromSum')}
                </p>
              )}
              {totalManual && dosesSum > 0 && (
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-ink-muted">
                  <span>
                    {t('muscleSumLabel')}{' '}
                    <span className="font-semibold tabular-nums text-ink-soft">
                      {dosesSumLabel}
                    </span>
                  </span>
                  {totalUnits.trim() !== dosesSumLabel && (
                    <button
                      type="button"
                      onClick={() => {
                        setTotalManual(false);
                        setTotalUnits(dosesSumLabel);
                      }}
                      className="font-semibold text-sage-deep hover:text-ink"
                    >
                      {t('useTheSum')}
                    </button>
                  )}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-stone" />

        {/* Treatment areas — toggles deciding which sections appear in the
            form (muscle list / face map). At least one required. */}
        <div data-tour="modules">
          <div className="eyebrow">{t('areasTitle')}</div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              aria-pressed={includesStandard}
              onClick={() => setIncludesStandard((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12.5px] ${
                includesStandard
                  ? 'border-sage-deep bg-sage-soft/40 font-semibold text-sage-deep'
                  : 'border-stone text-ink-muted hover:text-ink'
              }`}
            >
              {includesStandard && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {t('areaStandard')}
            </button>
            <button
              type="button"
              aria-pressed={includesFace}
              onClick={() => setIncludesFace((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 py-1.5 text-[12.5px] ${
                includesFace
                  ? 'border-sage-deep bg-sage-soft/40 font-semibold text-sage-deep'
                  : 'border-stone text-ink-muted hover:text-ink'
              }`}
            >
              {includesFace && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {t('areaFace')}
            </button>
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-muted">
            {t('areasSubtitle')}
          </p>
        </div>

        {/* Section nav — jumps to a form section and tracks the one in
            view; lists only the sections that exist for the chosen areas. */}
        <nav className="flex flex-col gap-0.5">
          {navItems.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => {
                setActiveSec(it.id);
                document
                  .getElementById(`tsec-${it.id}`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`border-l-2 py-1.5 pl-3 text-left text-[14px] ${
                activeSec === it.id
                  ? 'border-sage-deep font-semibold text-sage-deep'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {it.label}
            </button>
          ))}
        </nav>
        </div>
          </aside>

          {/* Right pane: the actual treatment form. */}
          <div>
        {/* Last treatment — reference + one-tap copy of the previous
            visit, placed above the form so it reads before the fields.
            Horizontal banner: tappable summary left, Copy right; stacks
            on narrow. */}
        {referenceTreatment && (
          <div data-tour="copylast" className="mb-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <button
              type="button"
              onClick={() => setShowLastTreatmentModal(true)}
              className="-m-1 rounded-[var(--radius-button)] p-1 text-left hover:bg-stone-soft/40"
            >
              <div className="eyebrow">{t('lastTreatment')}</div>
              <div className="mt-0.5 text-[13px] text-ink-soft">
                {referenceTreatment.drugProduct} ·{' '}
                {referenceTreatment.totalUnits} {t('unitsSuffix')} ·{' '}
                {referenceTreatment.injections.length}{' '}
                {referenceTreatment.injections.length === 1
                  ? t('muscleSingular')
                  : t('musclePlural')}{' '}
                · {t('tapForDetails')}
              </div>
              <p className="mt-0.5 text-[12px] leading-snug text-ink-muted">
                {t('copyLastHelper')}
              </p>
            </button>
            <button
              type="button"
              onClick={requestCopyFromPrevious}
              className="flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-button)] border border-sage/50 bg-cream px-4 py-2 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
                aria-hidden
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
              {t('copyLastIntoForm')}
            </button>
          </div>
        )}
        {/* Session setup — date/drug/dilution/guidance for this visit.
            Given its own heading so the long form reads as labelled groups
            (Session setup → Injections → Total → Notes), matching the other
            sections. Total units has moved below the muscle list, since the
            physician records it once the injections are chosen. */}
        <section id="tsec-setup" className="mt-5 scroll-mt-20 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4 sm:p-5">
        <h2 className="font-display text-[20px] leading-tight text-ink">
          {t('sessionSetupTitle')}
        </h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          {t('sessionSetupSubtitle')}
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={t('fieldDate')} inline>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClasses}
            />
          </Field>
          <Field label={t('fieldDrugProduct')} inline>
            <input
              type="text"
              value={drugProduct}
              onChange={(e) => setDrugProduct(e.target.value)}
              className={inputClasses}
              maxLength={60}
              placeholder={t('drugProductPlaceholder')}
            />
          </Field>
        </div>

        {/* Row 2: Dilution + Guidance — also session setup. */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Field label={t('fieldDilution')} inline>
            <input
              type="text"
              value={dilution}
              onChange={(e) => setDilution(e.target.value)}
              className={inputClasses}
              maxLength={40}
              placeholder={t('dilutionPlaceholder')}
            />
          </Field>
          <Field label={t('fieldGuidance')} inline>
            <select
              value={guidance}
              onChange={(e) => setGuidance(e.target.value as GuidanceMethod)}
              className={inputClasses}
            >
              {GUIDANCE_METHODS.map((g) => (
                <option key={g} value={g}>
                  {guidanceLabel(g)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        </section>

        {/* Standard injections — the muscle list. Rendered only when the
            Standard area is selected. */}
        {includesStandard && (
          <>
        {/* Muscles section */}
        <section id="tsec-muscles" className="mt-4 scroll-mt-20 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4 sm:p-5">
        <h2 className="font-display text-[20px] leading-tight text-ink">
          {t('musclesTitle')}
        </h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          {t('musclesSubtitle')}
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
                    placeholder={t('musclePlaceholder')}
                    maxLength={80}
                    aria-label={`Muscle ${i + 1} name`}
                  />
                  {injections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeInjection(i)}
                      aria-label={t('removeMuscle', { n: i + 1 })}
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
                    <span className="text-[12px] text-ink-muted">{t('fieldSide')}</span>
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
                          {sideLabel(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={muscleSideLabelClass}>
                    <span className="text-[12px] text-ink-muted">{t('fieldUnits')}</span>
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
                    aria-label={t('removeMuscle', { n: i + 1 })}
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
                  <span className="text-[12px] text-ink-muted">{t('noteLabel')}</span>
                  <input
                    type="text"
                    value={inj.note}
                    onChange={(e) =>
                      updateInjection(i, { note: e.target.value })
                    }
                    className={`${inputClasses} flex-1`}
                    placeholder={t('notePlaceholder')}
                    maxLength={200}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      updateInjection(i, { note: '', noteOpen: false })
                    }
                    aria-label={t('removeNote', { n: i + 1 })}
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
                  + {t('addNote')}
                </button>
              )}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addInjection}
          className="mt-3 flex h-10 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          + {t('addAnotherMuscle')}
        </button>
        </section>
          </>
        )}

        {/* Face treatment — the face map. Rendered only when the Face
            area is selected. Each mark is a located muscle injection
            (muscle + side + dose + normalised position); FaceMap owns
            its own colour/symbol toggle and legend, so we add only a
            section heading here. */}
        {includesFace && (
          <>
            <section id="tsec-face" className="mt-4 scroll-mt-20 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4 sm:p-5">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {t('areaFace')}
            </h2>
            <div className="mt-3">
              <FaceMap
                marks={faceMarks}
                onChange={setFaceMarks}
                displayMode={faceDisplayMode}
                onDisplayModeChange={setFaceDisplayMode}
                exportLabel={patient.displayName}
              />
            </div>
            </section>
          </>
        )}

        {/* Note for the therapist — the one downward (clinic → therapist)
            channel. Therapist-only and never patient-visible; set apart with
            a sage panel so it doesn't read like another clinic-internal note.
            Optional. Closes the therapist's "what did the physician do / has
            anything changed" gap between visits. */}
        {therapistHasEngaged && (
        <div id="tsec-handoff" className="mt-4 scroll-mt-20 rounded-[var(--radius-card)] border border-sage-soft bg-sage-soft/20 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[15px] text-ink">
              {t('handoffTitle')}
            </h3>
          </div>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">
            {t('handoffHint')}
          </p>

          <div className="mt-4">
            <label
              htmlFor="therapist-note"
              className="block text-[14px] font-semibold text-ink"
            >
              {t('handoffNoteLabel')}
            </label>
            <p className="mt-0.5 text-[14px] text-ink-muted">{t('optional')}</p>
            <textarea
              id="therapist-note"
              value={therapistNote}
              onChange={(e) => setTherapistNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder={t('handoffNotePlaceholder')}
              className={inputClasses}
            />
          </div>

          <GoalHandoffNotes cycleId={cycle.id} goals={handoffNoteGoals} />
        </div>
        )}

        {/* Locked: an old treatment record can't be edited (only
            same-day typo fixes are allowed). Explain why and point to
            the right action. */}
        {editLocked && (
          <div className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <p className="text-[14px] leading-relaxed text-ink-soft">
              <span className="font-semibold text-ink">
                {t('lockedTitle')}
              </span>{' '}
              {t('lockedBody')}
            </p>
          </div>
        )}

        {/* What's still needed — shown only when Save is disabled, so
            a greyed-out Save button is never unexplained. */}
        {!canSubmit && !editLocked && missing.length > 0 && (
          <p className="mt-6 text-[14px] leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">
              {t('beforeSaving')}
            </span>
            {missing.join(', ')}.
          </p>
        )}

        <div className="sticky bottom-0 z-10 -mx-5 mt-8 flex gap-3 border-t border-stone/60 bg-cream/90 px-5 py-3 backdrop-blur">
          <button
            type="button"
            onClick={back}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {editLocked ? t('back') : t('cancel')}
          </button>
          {!editLocked && (
            <button
              type="button"
              onClick={submit}
              disabled={
                !canSubmit ||
                save.isPending ||
                startCycleWithTreatment.isPending ||
                setHandoff.isPending
              }
              className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
            >
              {save.isPending ||
              startCycleWithTreatment.isPending ||
              setHandoff.isPending
                ? '…'
                : t('save')}
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
            // Close the details modal first so the confirm dialog
            // doesn't stack on top, then run the shared copy entry
            // point (immediate if empty, else confirm).
            setShowLastTreatmentModal(false);
            requestCopyFromPrevious();
          }}
        />
      )}

      {saved && !showExport && (
        <SavedDialog
          title={t('savedTitle')}
          body={t('savedBody')}
          exportLabel={t('savedEhrNote')}
          doneLabel={t('savedDone')}
          onExport={() => setShowExport(true)}
          onDone={back}
        />
      )}

      {showExport && (
        <ExportModal
          initialText={buildEhrExport({
            cycle: {
              cycleNumber: isNewCycle
                ? cycle.cycleNumber + 1
                : cycle.cycleNumber,
              startDate: isNewCycle ? date : cycle.startDate,
              modality: cycle.modality
            },
            treatment: {
              date,
              drugProduct,
              totalUnits: totalUnitsNum,
              dilution: dilution.trim() || undefined,
              guidance,
              injections: [
                ...(includesStandard
                  ? validInjections.map((i) => ({
                      muscle: i.muscle,
                      side: i.side,
                      doseUnits: parseFloat(i.doseUnits),
                      note: i.note.trim() || undefined,
                      isFace: false
                    }))
                  : []),
                ...(includesFace
                  ? faceMarks.map((m) => ({
                      muscle: m.muscle,
                      side: m.side,
                      doseUnits: m.doseUnits,
                      note: m.note || undefined,
                      isFace: true
                    }))
                  : [])
              ],
              notes: notes.trim() || undefined
            },
            goals: [...activeGoals, ...data.archivedGoals].map((g) => ({
              id: g.id,
              patientFacingText: g.patientFacingText,
              kind: g.kind,
              nrsDirection: g.nrs?.direction,
              nrsBaseline: g.nrs?.baselineValue ?? null,
              nrsTarget: g.nrs?.targetValue ?? null,
              anchors: g.gas ?? null
            })),
            // A treatment marks the start of a cycle, so its own cycle has no
            // check-ins yet; in edit mode show the current cycle's check-ins.
            checkins: isNewCycle
              ? []
              : data.checkins.map((c) => ({
                  weekNumber: c.weekNumber,
                  comment: c.comment ?? undefined,
                  ratings: c.ratings.map((r) => ({
                    approvedGoalId: r.approvedGoalId,
                    ratingValue: r.ratingValue as -2 | -1 | 0 | 1 | 2 | null,
                    nrsValue: r.nrsValue
                  }))
                })),
            locale,
            t: tExport as unknown as ExportTranslator
          })}
          onClose={() => setShowExport(false)}
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
  const t = useTranslations('treatment');
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
          {t('overwriteTitle')}
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          {t('overwriteBody')}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {t('overwriteConfirm')}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('cancel')}
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
  const t = useTranslations('treatment');
  const sideLabel = (sideValue: InjectionSide): string =>
    ({
      left: t('sideLeft'),
      right: t('sideRight'),
      bilateral: t('sideBilateral')
    })[sideValue];
  // Face marks are located muscle injections (pos set); standard
  // injections have no position. Show them as separate groups.
  const standardInjections = treatment.injections.filter(
    (i) => i.posX == null
  );
  const faceMarks = treatment.injections.filter((i) => i.posX != null);
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
          {t('lastTreatment')}
        </h2>
        <p className="mt-1 text-[14px] text-ink-soft">
          {treatment.drugProduct} · {treatment.totalUnits} {t('unitsSuffix')}
          {treatment.dilution && ` · ${treatment.dilution}`}
        </p>
        <ul className="mt-3 max-h-[280px] space-y-1 overflow-y-auto text-[14px] text-ink-soft">
          {standardInjections.length > 0 && faceMarks.length > 0 && (
            <li className="font-semibold text-ink">{t('areaStandard')}</li>
          )}
          {standardInjections.map((inj) => (
            <li key={inj.id}>
              {inj.muscle} · {sideLabel(inj.side)} ·{' '}
              {inj.doseUnits} {t('unitsSuffix')}
              {inj.note && (
                <span className="text-ink-muted"> — {inj.note}</span>
              )}
            </li>
          ))}
          {faceMarks.length > 0 && (
            <li className="pt-1 font-semibold text-ink">{t('areaFace')}</li>
          )}
          {faceMarks.map((inj) => (
            <li key={inj.id}>
              {inj.muscle} · {sideLabel(inj.side)} ·{' '}
              {inj.doseUnits} {t('unitsSuffix')}
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
            {t('copyIntoPlan')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('close')}
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


/**
 * Post-save confirmation. Lets the clinician grab the EHR note for the
 * treatment just recorded, or head back to the patient page. Escape / outside
 * intent resolves to "Done" (the save already succeeded).
 */
function SavedDialog({
  title,
  body,
  exportLabel,
  doneLabel,
  onExport,
  onDone
}: {
  title: string;
  body: string;
  exportLabel: string;
  doneLabel: string;
  onExport: () => void;
  onDone: () => void;
}) {
  const ref = useModalA11y(onDone);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-[420px] rounded-[var(--radius-card)] border border-stone bg-cream p-5"
      >
        <h2 className="font-display text-[20px] leading-tight text-ink">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">{body}</p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onExport}
            className="flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2.5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {exportLabel}
          </button>
          <button
            type="button"
            onClick={onDone}
            className="flex-1 rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-4 py-2.5 text-[15px] font-semibold text-on-accent hover:opacity-90"
          >
            {doneLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
