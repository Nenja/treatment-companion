'use client';

import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/components/layout/BrandMark';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useEndClinicianSession,
  useTouchClinicianSession
} from '@/lib/supabase/clinicianSession';
import {
  usePatientInfo,
  formatPatientSummary
} from '@/lib/supabase/patientInfo';
import {
  useClinicianPatientData,
  useSetSuggestionStatus,
  useRetireGoal,
  useReactivateGoal,
  useSetPatientMedication,
  type GoalOutcome,
  type ClinicianPatientGoal
} from '@/lib/supabase/clinicianPatient';
import { EditGoalDrawer } from '@/components/clinician/EditGoalDrawer';
import { GoalHistoryModal } from '@/components/clinician/GoalHistoryModal';
import { LinkGoalModal } from '@/components/clinician/LinkGoalModal';
import { formatLongDate } from '@/lib/dates';
import { nrsToGas, injectionSideLabel, type GuidanceMethod } from '@/lib/types';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { GoalGraphModal } from '@/components/clinician/GoalGraphModal';
import { VideoProtocolEditor } from '@/components/clinician/VideoProtocolEditor';
import { BaselineRecorderModal } from '@/components/clinician/BaselineRecorderModal';
import {
  VideoScoreQueue,
  type ScoreQueueItem
} from '@/components/clinician/VideoScoreQueue';
import { TrainingOverview } from '@/components/clinician/TrainingOverview';
import { usePatientObservations } from '@/lib/supabase/observations';
import { ItbTrack } from '@/components/clinician/ItbTrack';
import { useItbTherapy } from '@/lib/supabase/itb';
import { VisitChanges } from '@/components/clinician/VisitChanges';
import { PatientBanner } from '@/components/clinician/PatientBanner';
import { ExportModal } from '@/components/clinician/ExportModal';
import { NewCycleDialog } from '@/components/clinician/NewCycleDialog';
import { RecordGoalDrawer } from '@/components/clinician/RecordGoalDrawer';
import {
  PatientActionRow,
  type PatientActionId
} from '@/components/clinician/PatientActionRow';
import { AccountMenu } from '@/components/layout/AccountMenu';
import {
  SkeletonBlock,
  SkeletonScreen
} from '@/components/feedback/Skeleton';
import { useModalA11y } from '@/lib/useModalA11y';
import { useWideLayout } from '@/lib/useWideLayout';
import { useNavStyle } from '@/lib/useNavStyle';
import { PageHelpButton } from '@/components/feedback/PageHelpButton';
import { buildEhrExport, type ExportTranslator } from '@/lib/ehrExport';
import { useToast } from '@/components/feedback/Toast';
import { useSetPhysioGoalSuggestionStatus } from '@/lib/supabase/physioGoalSuggestion';
import { useSetPhysioMuscleSuggestionStatus } from '@/lib/supabase/physioMuscleSuggestion';

export default function ClinicianPatientPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.patient');
  const tA11y = useTranslations('a11y');
  const tExport = useTranslations('ehrExport');
  const tSession = useTranslations('clinician.session');
  const tInfo = useTranslations('patientInfo');
  const tEt = useTranslations('etiology');
  const tSide = useTranslations('side');
  const tAmb = useTranslations('ambulation');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');
  const tTraining = useTranslations('training');
  const tModality = useTranslations('treatment.modality');
  const tVideoProtocol = useTranslations('clinician.videoProtocol');
  const tVideoQueue = useTranslations('clinician.videoQueue');

  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const patientData = useClinicianPatientData(
    profile?.id ?? null,
    profile?.role,
    sessionQuery.data?.patientId ?? null
  );
  // Patient clinical background — called at top level (not after the
  // loading-branch early return) to keep hook ordering stable across
  // renders. Hook itself is `enabled` only when patientId is known.
  const patientInfo = usePatientInfo(sessionQuery.data?.patientId ?? null);
  const observationsQuery = usePatientObservations(
    sessionQuery.data?.patientId ?? null
  );
  const itbTherapyQuery = useItbTherapy(sessionQuery.data?.patientId ?? null);

  const endSession = useEndClinicianSession();
  const touchSession = useTouchClinicianSession();
  const setStatus = useSetSuggestionStatus();
  const retireGoal = useRetireGoal();
  const reactivateGoal = useReactivateGoal();
  const toast = useToast();
  const wide = useWideLayout();
  const navStyle = useNavStyle();
  // 'side' nav puts the action menu in a left rail beside the content;
  // only applies when the wide layout is active (a rail needs the width).
  const sideMenu = wide && navStyle === 'side';
  // Width / layout classes gated on the user's layout preference.
  // When wide, the header + main expand at lg and the goals render
  // in a 2-column grid; when compact, everything stays single-column
  // even on a large screen. The clinician patient page is mostly
  // review (goals, check-ins), so it uses the mid width (720px), not
  // the full wide spread — that's reserved for the treatment page.
  const headerWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3 lg:max-w-[var(--max-w-page-wide)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-3';
  // Flex variant of the header width, for the skeleton header which
  // lays its placeholders out in a row.
  const flexHeaderWidthClass = wide
    ? 'mx-auto flex max-w-[var(--max-w-page-narrow)] items-center justify-between px-5 py-4 lg:max-w-[var(--max-w-page-wide)]'
    : 'mx-auto flex max-w-[var(--max-w-page-narrow)] items-center justify-between px-5 py-4';
  const mainWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-16 pt-6 lg:max-w-[var(--max-w-page-wide)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 pb-16 pt-6';
  const preGoalsWidthClass = '';
  // Wide layout: two columns at lg — context (banner, since-last-visit,
  // look-up panels) on the left, goals on the right, so goals are visible
  // at the top rather than pushed below the context. Single column
  // (stacked) on narrow and in compact mode.
  const gridClass = wide
    ? sideMenu
      ? 'lg:grid lg:grid-cols-[auto_minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-6'
      : 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-8'
    : '';
  // Goals now stack in a single column within their own column; the
  // page-level two-column split provides the horizontal use of space.
  const goalsListClass = 'mt-3 space-y-3';
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [enlargedGoalId, setEnlargedGoalId] = useState<string | null>(null);
  const [editGoalTarget, setEditGoalTarget] =
    useState<ClinicianPatientGoal | null>(null);
  const [historyTarget, setHistoryTarget] =
    useState<ClinicianPatientGoal | null>(null);
  const [linkTarget, setLinkTarget] =
    useState<ClinicianPatientGoal | null>(null);
  const [videoEditorGoal, setVideoEditorGoal] = useState<{
    id: string;
    text: string;
    enabled: boolean;
    instruction: string | null;
    setup: string | null;
    seconds: number | null;
  } | null>(null);
  const [baselineGoal, setBaselineGoal] = useState<{
    id: string;
    text: string;
    instruction: string | null;
    setup: string | null;
    seconds: number | null;
    existingPath: string | null;
  } | null>(null);
  const [showScoreQueue, setShowScoreQueue] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showNewCycle, setShowNewCycle] = useState(false);
  const [showRecordGoal, setShowRecordGoal] = useState(false);
  const [showRecordItbGoal, setShowRecordItbGoal] = useState(false);  // Which inline action panel is open under the action row, if any.
  // History and export are not panels — they navigate / open a modal.
  const [openPanel, setOpenPanel] = useState<'medication' | 'physio' | 'training' | null>(
    null
  );
  // Patient suggestions moved out of the action row to sit beside
  // "Record a goal" (both concern goals). It toggles its own panel,
  // independent of the action-row panels above.
  const [showSuggestions, setShowSuggestions] = useState(false);
  // Medication edit state (now reached from the action
  // row's Medication panel). Read-only until Edit; Save calls
  // set_patient_medication. Local-only — server is source of truth on
  // (re)load.
  const setMedication = useSetPatientMedication();
  const [editingMed, setEditingMed] = useState(false);
  const [medCurrent, setMedCurrent] = useState('');
  const [medPrevious, setMedPrevious] = useState('');
  // True once the physician has deliberately ended the session. While
  // this is set, the "no session → timeout" guard stands down: ending
  // the session naturally makes sessionQuery.data go null, and without
  // this flag that guard would fire its OWN redirect (with a spurious
  // ?timeout=1) racing the deliberate one in onEndSession — causing a
  // redirect stutter and a wrong "session timed out" message.
  const endingSessionRef = useRef(false);
  // The goal the physician is about to archive — drives the
  // confirmation dialog. Holds { id, text } or null when none pending.
  const [goalToArchive, setGoalToArchive] = useState<{
    id: string;
    text: string;
  } | null>(null);

  // Auth + role gating.
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

  // No session → back to unlock screen, with a "?timeout=1" hint.
  //
  // This must only fire on a SETTLED, CONFIRMED "no session" — never on
  // a transient null while the session query is still loading or
  // refetching. React Query's `isLoading` is true only on the first
  // ever fetch, so it does NOT cover the 30s background refetches;
  // relying on it let a refetch-in-flight look "settled" and bounce the
  // physician out, which — paired with the unlock page's mirror
  // redirect — produced a redirect loop.
  //
  // The correct signal: status === 'success' (the query has completed
  // at least once) AND data === null (it definitively found no active
  // session). During a refetch, status stays 'success' and data keeps
  // its last value, so no false negative slips through.
  //
  // Also stands down while the physician is deliberately ending the
  // session (endingSessionRef) — onEndSession does its own navigation.
  useEffect(() => {
    if (endingSessionRef.current) return;
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) +
          '?timeout=1'
      );
    }
  }, [sessionQuery.status, sessionQuery.data, router, locale]);

  // Hydrate medication fields from the server whenever NOT editing, so
  // returning after a save shows the saved text; in-progress edits are
  // left untouched.
  useEffect(() => {
    if (editingMed) return;
    if (!patientData.data) return;
    setMedCurrent(
      patientData.data.patient.currentMedication ?? ''
    );
    setMedPrevious(
      patientData.data.patient.previousMedication ?? ''
    );
  }, [patientData.data, editingMed]);

  if (
    authLoading ||
    !profile ||
    profile.role !== 'clinician' ||
    sessionQuery.isLoading ||
    !sessionQuery.data
  ) {
    return <div className="min-h-dvh bg-cream" />;
  }

  if (patientData.isLoading || !patientData.data) {
    return (
      <div className="min-h-dvh bg-cream">
        {/* Header bar — matches real header height */}
        <header className="border-b border-stone/70 bg-cream-soft/50">
          <div className={flexHeaderWidthClass}>
            <BrandMark showName={false} />
            <SkeletonBlock width="w-16" height="h-4" />
            <SkeletonBlock width="w-8" height="h-8" shape="rounded-full" />
          </div>
        </header>
        <main className={mainWidthClass}>
          <SkeletonScreen label={tA11y('loading')}>
            {/* Patient name heading */}
            <SkeletonBlock width="w-3/4" height="h-8" />
            <SkeletonBlock width="w-1/2" height="h-4" className="mt-2" />

            {/* Active goals title + cards */}
            <div className="mt-10">
              <SkeletonBlock width="w-1/3" height="h-6" />
              {[0, 1].map((i) => (
                <div
                  key={i}
                  className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5"
                >
                  <SkeletonBlock width="w-4/5" height="h-5" />
                  {/* Pretend chart area */}
                  <SkeletonBlock
                    width="w-full"
                    height="h-32"
                    className="mt-4"
                  />
                </div>
              ))}
            </div>
          </SkeletonScreen>
        </main>
      </div>
    );
  }

  const {
    patient,
    cycle,
    suggestions,
    activeGoals,
    archivedGoals,
    checkins,
    treatment,
    physioAssessments,
    physioGoalSuggestions,
    physioMuscleSuggestions
  } = patientData.data;

  // Unscored peak-effect clips across this patient's check-ins: a video was
  // recorded but the clinic hasn't scored it (GAS or NRS) or marked it
  // unusable yet. Feeds the quick-score queue.
  const goalByIdForQueue = new Map(activeGoals.map((g) => [g.id, g]));
  // Goals are tagged by therapy: BoNT goals fill the main list, ITB goals
  // are grouped under the ITB section. Both flow through the same weekly
  // check-in (they share the active cycle), so their ratings load identically.
  const bontGoals = activeGoals.filter((g) => g.therapy !== 'itb');
  const itbGoals = activeGoals.filter((g) => g.therapy === 'itb');
  const scoreQueueItems: ScoreQueueItem[] = [];
  for (const c of checkins) {
    for (const r of c.ratings) {
      if (!r.videoPath) continue;
      if (
        r.clinicVideoRating != null ||
        r.clinicVideoNrs != null ||
        r.clinicVideoUnusable
      ) {
        continue;
      }
      const g = goalByIdForQueue.get(r.approvedGoalId);
      if (!g) continue;
      scoreQueueItems.push({
        ratingId: r.id,
        goalText: g.patientFacingText,
        kind: g.kind,
        anchors: g.gas ?? null,
        nrsQuestion: g.nrs?.question ?? null,
        peakPath: r.videoPath,
        baselinePath: g.baselineVideoPath,
        weekNumber: c.weekNumber
      });
    }
  }

  // Quiet at-a-glance summary line in the header. Just a derived string
  // — not a hook, safe after the early return.
  const patientSummary = formatPatientSummary(patientInfo.data ?? null, {
    ageYears: (age) => tInfo('ageYears', { age }),
    etiology: (k) => tEt(k),
    side: (k) => tSide(k),
    ambulation: (k) => tAmb(k)
  });

  // Compute current week from cycle.start_date and today.
  const startMs = new Date(cycle.startDate).getTime();
  const todayMs = Date.now();
  const daysSinceStart = Math.floor(
    (todayMs - startMs) / (24 * 60 * 60 * 1000)
  );
  const weekNumber = Math.max(1, Math.floor(daysSinceStart / 7) + 1);

  // ITB dose changes mapped to a week relative to the cycle start, so they
  // can be drawn as titration markers on the ITB goal charts.
  const itbDoseMarkers = (itbTherapyQuery.data?.doseChanges ?? []).map((d) => ({
    weekNumber: Math.max(
      1,
      Math.floor(
        (new Date(d.changedOn).getTime() - startMs) / (7 * 24 * 60 * 60 * 1000)
      ) + 1
    )
  }));

  // Per-week training for the Home/therapist training overview. A check-in
  // with both fields null = not reported; an empty array = reported none
  // for that category (a real, counted data point).
  const trainingByWeek = new Map<
    number,
    { home: number[]; therapist: number[] }
  >();
  for (const c of checkins) {
    if (c.trainingDays !== null || c.trainingDaysTherapist !== null) {
      trainingByWeek.set(c.weekNumber, {
        home: c.trainingDays ?? [],
        therapist: c.trainingDaysTherapist ?? []
      });
    }
  }

  // Build per-goal ratings for the progress views.
  const ratingsByGoal = new Map<
    string,
    {
      weekNumber: number;
      value: -2 | -1 | 0 | 1 | 2 | null;
      nrs: number | null;
      reported: boolean;
      comment?: string;
      submitterLabel?: 'self' | 'caregiver';
    }[]
  >();
  for (const goal of activeGoals) {
    const perWeek = checkins
      .flatMap((c) => {
        const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r) return [];
        return [
          {
            weekNumber: c.weekNumber,
            value: r.ratingValue as -2 | -1 | 0 | 1 | 2 | null,
            nrs: r.nrsValue,
            reported: true,
            comment: c.comment ?? undefined,
            submitterLabel: c.submitterLabel
          }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    ratingsByGoal.set(goal.id, perWeek);
  }

  // Build per-goal CLINIC VIDEO series — the clinic's GAS-level score of each
  // standardized clip (0072). This is the authoritative, one-rater outcome,
  // always on the GAS scale, so it's drawn as its own GAS chart beneath the
  // patient's. Unusable / unscored weeks are omitted (a gap), not zeroed.
  const clinicVideoByGoal = new Map<
    string,
    {
      weekNumber: number;
      value: -2 | -1 | 0 | 1 | 2 | null;
      nrs: number | null;
      reported: boolean;
    }[]
  >();
  for (const goal of activeGoals) {
    const perWeek = checkins
      .flatMap((c) => {
        const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r || r.clinicVideoRating == null) return [];
        return [
          {
            weekNumber: c.weekNumber,
            value: r.clinicVideoRating as -2 | -1 | 0 | 1 | 2,
            nrs: null,
            reported: true
          }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    clinicVideoByGoal.set(goal.id, perWeek);
  }

  // Clinic's 0–10 video score per NRS goal, overlaid on that goal's own NRS
  // trend so the clinician read sits beside the patient's self-report on the
  // same axis. (GAS goals keep the separate clinic trend chart below.)
  const clinicPointsByGoal = new Map<
    string,
    { weekNumber: number; nrs: number | null; value: -2 | -1 | 0 | 1 | 2 | null }[]
  >();
  for (const goal of activeGoals) {
    if (goal.kind !== 'nrs') {
      clinicPointsByGoal.set(goal.id, []);
      continue;
    }
    const pts = checkins
      .flatMap((c) => {
        const r = c.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r || r.clinicVideoNrs == null) return [];
        return [
          { weekNumber: c.weekNumber, nrs: r.clinicVideoNrs, value: null }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    clinicPointsByGoal.set(goal.id, pts);
  }

  // Build per-goal physiotherapist ratings. Physio assessments happen
  // on arbitrary dates; we snap each to the nearest weekly check-in
  // week so it can be drawn on the same week-numbered axis. The snap
  // is: weeksSinceStart = round(daysSinceCycleStart / 7), clamped to
  // at least week 1. NRS is converted to GAS with the goal's own cut
  // points, the same mapping the patient's ratings use, so physio and
  // patient points share the chart's GAS y-axis.
  const cycleStartMs = new Date(cycle.startDate).getTime();
  const physioRatingsByGoal = new Map<
    string,
    {
      weekNumber: number;
      nrs: number;
      value: -2 | -1 | 0 | 1 | 2;
      note: string | null;
    }[]
  >();
  for (const goal of activeGoals) {
    const isGas = goal.kind !== 'nrs';
    const points = physioAssessments
      .flatMap((a) => {
        const r = a.ratings.find((x) => x.approvedGoalId === goal.id);
        if (!r) return [];
        // Skip flag-only rows that carry no score for this goal's kind.
        if (isGas) {
          if (r.gasValue == null) return [];
        } else if (r.nrsValue == null) {
          return [];
        }
        const days =
          (new Date(a.assessmentDate).getTime() - cycleStartMs) /
          (24 * 60 * 60 * 1000);
        const snappedWeek = Math.max(1, Math.round(days / 7));
        return [
          {
            weekNumber: snappedWeek,
            nrs: r.nrsValue ?? 0,
            // NRS goals derive GAS from the goal's cut points. GAS goals
            // are rated as a level directly (gas_value).
            value:
              !isGas && goal.nrs
                ? nrsToGas(r.nrsValue as number, {
                    question: goal.nrs.question,
                    direction: goal.nrs.direction,
                    cutLowLow: goal.nrs.cutLowLow,
                    cutLow: goal.nrs.cutLow,
                    cutZero: goal.nrs.cutZero,
                    cutHigh: goal.nrs.cutHigh
                  })
                : (r.gasValue as -2 | -1 | 0 | 1 | 2),
            note: a.note
          }
        ];
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);
    physioRatingsByGoal.set(goal.id, points);
  }

  // ── Therapist activity signals (surfaced to the physician) ──────────
  // How many days they train: distinct dated assessments are the visits.
  const therapyVisitDates = Array.from(
    new Set(physioAssessments.map((a) => a.assessmentDate))
  ).sort();
  const therapyVisitCount = therapyVisitDates.length;
  // Which weekdays those visits fall on (ISO 1=Mon..7=Sun).
  const therapyWeekdaysIso = new Set(
    therapyVisitDates.map((d) => {
      const day = new Date(d + 'T00:00:00').getDay(); // 0=Sun..6=Sat
      return day === 0 ? 7 : day;
    })
  );
  // What functions they're working on: a goal is "working on" if the most
  // recent assessment that mentions it has the flag set (assessments are
  // ascending, so the last match wins).
  const workingOnGoalIds = new Set<string>();
  for (const g of activeGoals) {
    let flag = false;
    for (const a of physioAssessments) {
      const r = a.ratings.find((x) => x.approvedGoalId === g.id);
      if (r) flag = r.workingOn;
    }
    if (flag) workingOnGoalIds.add(g.id);
  }
  // Feasibility help: adjustment requests, newest first.
  const adjustmentRequests = physioAssessments
    .flatMap((a) =>
      a.ratings
        .filter((r) => r.needsAdjustment)
        .map((r) => ({
          goalId: r.approvedGoalId,
          note: r.adjustmentNote,
          date: a.assessmentDate
        }))
    )
    .reverse();
  const hasTherapistActivity =
    therapyVisitCount > 0 || adjustmentRequests.length > 0;
  const dayShortKeys = [
    'monShort',
    'tueShort',
    'wedShort',
    'thuShort',
    'friShort',
    'satShort',
    'sunShort'
  ] as const;

  const onEndSession = async () => {
    // Mark the deliberate end FIRST, so the patient-page timeout guard
    // stands down before endSession makes sessionQuery.data go null.
    endingSessionRef.current = true;
    try {
      await endSession.mutateAsync(sessionQuery.data?.patientId ?? undefined);
    } catch {
      // If ending failed, the session is still live — clear the flag
      // so the guard works normally again, and let the user retry.
      endingSessionRef.current = false;
      toast.error(tSession('endSessionError'));
      return;
    }
    // Navigate with an explicit "ended=1" marker. The unlock page uses
    // this to know the session was ended ON PURPOSE, and so must NOT
    // show the "timed out after inactivity" message — even if a stray
    // timeout-guard redirect also races here, the unlock page checks
    // for this marker and it wins.
    router.replace(
      (locale === 'en' ? '/clinician' : `/${locale}/clinician`) + '?ended=1'
    );
  };

  // Retire the goal currently held in goalToArchive with the chosen
  // outcome, then close the dialog. History is preserved; the goal
  // leaves the patient's future check-ins. The query invalidation
  // refreshes the goal list.
  const onRetireGoal = async (outcome: GoalOutcome) => {
    if (!goalToArchive) return;
    try {
      await retireGoal.mutateAsync({ goalId: goalToArchive.id, outcome });
      toast.success(t('archiveToast'));
    } catch {
      toast.error(t('archiveError'));
    } finally {
      setGoalToArchive(null);
    }
  };

  // Reactivate a goal retired by mistake — returns it to the patient's
  // check-ins. No confirm dialog: it's a low-stakes, easily-reversed
  // action (the goal can simply be retired again).
  const onReactivateGoal = async (goalId: string) => {
    touch();
    try {
      await reactivateGoal.mutateAsync({ goalId });
      toast.success(t('reactivateToast'));
    } catch {
      toast.error(t('reactivateError'));
    }
  };

  // Touch session on any meaningful click. Safe to call unconditionally
  // — the RPC silently no-ops for non-clinicians.
  const touch = () => touchSession.mutate(sessionQuery.data?.patientId ?? undefined);

  const physioActionCount =
    physioGoalSuggestions.length + physioMuscleSuggestions.length;
  const actionLabels = {
    medication: t('actionMedication'),
    physio: t('actionPhysio'),
    history: t('actionHistory'),
    export: t('actionExport'),
    training: t('actionTraining')
  };
  const actionShortLabels = {
    medication: t('actionShortMedication'),
    physio: t('actionShortPhysio'),
    history: t('actionShortHistory'),
    export: t('actionShortExport'),
    training: t('actionShortTraining')
  };
  const onActionSelect = (id: PatientActionId) => {
    touch();
    if (id === 'history') {
      router.push(
        locale === 'en' ? '/clinician/history' : `/${locale}/clinician/history`
      );
    } else if (id === 'export') {
      setShowExport(true);
    } else {
      // Toggle the inline panel (medication | physio | training).
      setOpenPanel((cur) => (cur === id ? null : id));
    }
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className={headerWidthClass}>
          {/* Single row: the patient (name + info link) on the left
              takes the available width and truncates; the controls
              (end session, help, account) sit on the right. End
              session is an icon on mobile to keep the row compact. The
              clinical summary sits on its own line beneath the name. */}
          <div className="flex items-center gap-2">
            <BrandMark showName={false} />
            <h1 className="m-0 flex min-w-0 flex-1 font-display text-[20px] font-normal leading-tight">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    locale === 'en'
                      ? '/patient-info'
                      : `/${locale}/patient-info`
                  )
                }
                aria-label={tInfo('openInfo', { name: patient.displayName })}
                className="group flex w-full min-w-0 items-center gap-1 text-left"
              >
                <span className="truncate font-display text-[20px] leading-tight text-ink group-hover:text-sage-deep">
                  {patient.displayName}
                </span>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted group-hover:text-sage-deep"
                aria-hidden
              >
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="11" x2="12" y2="16" />
                  <circle cx="12" cy="8" r="0.6" fill="currentColor" />
                </svg>
              </span>
            </button>
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  router.push(
                    locale === 'en' ? '/clinician' : `/${locale}/clinician`
                  )
                }
                aria-label={tSession('switchPatient')}
                title={tSession('switchPatient')}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-stone bg-cream text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink sm:w-auto sm:rounded-[var(--radius-button)] sm:px-3"
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
                  className="shrink-0"
                >
                  <path d="M7 16V4M7 4 3 8M7 4l4 4" />
                  <path d="M17 8v12m0 0 4-4m-4 4-4-4" />
                </svg>
                <span className="hidden sm:inline">
                  {tSession('switchPatient')}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmEnd(true)}
                aria-label={tSession('endSession')}
                title={tSession('endSession')}
                className="flex h-11 w-11 items-center justify-center gap-1.5 rounded-full border border-stone bg-cream text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink sm:w-auto sm:rounded-[var(--radius-button)] sm:px-3"
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
                  className="shrink-0"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="hidden sm:inline">
                  {tSession('endSession')}
                </span>
              </button>
              <PageHelpButton pageKey="clinicianPatient" />
              <AccountMenu />
            </div>
          </div>
          {/* Wide layout: the look-up tools move out of the body and into
              a toolbar under the title row, so the goals column starts at
              the top instead of being pushed down. Hidden on narrow, where
              the body action row is used instead. */}
          {wide && navStyle === 'top' && (
            <div className="mt-3 hidden border-t border-stone/60 pt-3 lg:block">
              <PatientActionRow
                variant="toolbar"
                physioCount={physioActionCount}
                openPanel={openPanel}
                labels={actionLabels}
                shortLabels={actionShortLabels}
                onSelect={onActionSelect}
              />
            </div>
          )}
        </div>
      </header>

      <main className={mainWidthClass}>
        <div className={gridClass}>
        {sideMenu && (
          <PatientActionRow
            variant="sidebar"
            physioCount={physioActionCount}
            openPanel={openPanel}
            labels={actionLabels}
            shortLabels={actionShortLabels}
            onSelect={onActionSelect}
            className="hidden lg:flex lg:sticky lg:top-4"
          />
        )}
        {/* Left column: patient context — banner, since-last-visit,
            the look-up panels, and the new-cycle action. The narrower
            of the two columns on the wide layout. */}
        <div className={preGoalsWidthClass}>
        {/* Start a new treatment cycle — the first action of an injection
            visit, so it sits at the top of the context column rather than
            buried below it. Kept to a normal-size primary button (not a
            full-width block) so it leads without shouting over the patient
            name. NewCycleDialog still confirms before anything happens. */}
        <button
          type="button"
          onClick={() => {
            touch();
            setShowNewCycle(true);
          }}
          className="mb-3 inline-flex items-center gap-2 rounded-[var(--radius-button)] bg-sage-deep px-4 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t('startNewCycle')}
        </button>
        <p className="mb-3 -mt-1 max-w-prose text-[13px] leading-relaxed text-ink-muted">
          {t('startNewCycleActivates')}
        </p>
        {/* Action row — always-visible entry points with live counts.
            On the wide layout this is replaced at lg by the header
            toolbar (below the patient name); on narrow/compact it stays
            here in the body flow. */}
        <PatientActionRow
          physioCount={physioActionCount}
          openPanel={openPanel}
          labels={actionLabels}
          shortLabels={actionShortLabels}
          onSelect={onActionSelect}
          className={wide ? 'lg:hidden' : ''}
        />

        {/* Medication panel — opens from the action row.
            Read-only until Edit; Save persists via set_patient_medication
            and returns to the read view. */}
        {openPanel === 'medication' && (
          <section className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-[18px] leading-tight text-ink">
                {t('medTitle')}
              </h2>
              {!editingMed && (
                <button
                  type="button"
                  onClick={() => setEditingMed(true)}
                  className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
                >
                  {t('medEdit')}
                </button>
              )}
            </div>
            {!editingMed ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-[12px] font-semibold text-ink-soft">
                    {t('medCurrent')}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
                    {patient.currentMedication ?? (
                      <span className="text-ink-muted">
                        {t('medNotRecordedYet')}
                      </span>
                    )}
                  </p>
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-ink-soft">
                    {t('medPrevious')}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink-soft">
                    {patient.previousMedication ?? (
                      <span className="text-ink-muted">
                        {t('medNotRecordedYet')}
                      </span>
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <label
                    htmlFor="med-current"
                    className="block text-[13px] font-semibold text-ink"
                  >
                    {t('medCurrentLabel')}
                  </label>
                  <textarea
                    id="med-current"
                    value={medCurrent}
                    onChange={(e) => setMedCurrent(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder={t('medCurrentPlaceholder')}
                    className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="med-previous"
                    className="block text-[13px] font-semibold text-ink"
                  >
                    {t('medPreviousLabel')}
                  </label>
                  <textarea
                    id="med-previous"
                    value={medPrevious}
                    onChange={(e) => setMedPrevious(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder={t('medPreviousPlaceholder')}
                    className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      touch();
                      setMedication.mutate(
                        {
                          patientId: patient.id,
                          currentMedication:
                            medCurrent.trim() || null,
                          previousMedication:
                            medPrevious.trim() || null
                        },
                        {
                          onSuccess: () => {
                            toast.success(t('medUpdated'));
                            setEditingMed(false);
                          },
                          onError: () => toast.error(t('medSaveError'))
                        }
                      );
                    }}
                    disabled={setMedication.isPending}
                    className="rounded-[var(--radius-button)] bg-sage-deep px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
                  >
                    {setMedication.isPending ? '…' : t('medSave')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMedCurrent(
                        patient.currentMedication ?? ''
                      );
                      setMedPrevious(
                        patient.previousMedication ?? ''
                      );
                      setEditingMed(false);
                    }}
                    disabled={setMedication.isPending}
                    className="rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
                  >
                    {t('medCancel')}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* (Patient suggestions panel now renders in the goals section,
            directly beneath the Suggestions button — see below.) */}

        {/* Therapist input panel — opens from the action row. */}
        {openPanel === 'physio' && (
          <section className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3.5">
            <h2 className="font-display text-[15px] leading-tight text-ink">
              {t('physioInputHeading')}
            </h2>
            <p className="mt-0.5 text-[12px] text-ink-muted">
              {t('physioInputSubtitle')}
            </p>
            <div className="mt-2.5">
          {/* Therapist activity — visit days + adjustment requests. */}
          {hasTherapistActivity && (
            <div className="mb-4 space-y-3">
              {therapyVisitCount > 0 && (
                <div className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5">
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t('physioVisitsHeading')}
                  </h3>
                  <p className="mt-1 text-[14px] text-ink">
                    {t('physioVisitsCount', { count: therapyVisitCount })}
                  </p>
                  <div
                    className="mt-2 flex gap-1"
                    aria-label={t('physioWeekdaysAria')}
                  >
                    {dayShortKeys.map((key, i) => {
                      const iso = i + 1;
                      const on = therapyWeekdaysIso.has(iso);
                      return (
                        <span
                          key={key}
                          className={`flex h-7 w-9 items-center justify-center rounded-md text-[12px] font-semibold ${
                            on
                              ? 'bg-sage-deep text-on-accent'
                              : 'bg-stone-soft text-ink-muted'
                          }`}
                        >
                          {tTraining(key)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
              {adjustmentRequests.length > 0 && (
                <div>
                  <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                    {t('physioAdjustmentsHeading')}
                  </h3>
                  <ul className="mt-2 space-y-2">
                    {adjustmentRequests.map((req, idx) => {
                      const g = activeGoals.find((x) => x.id === req.goalId);
                      return (
                        <li
                          key={`${req.goalId}-${idx}`}
                          className="rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft p-2.5"
                        >
                          <p className="text-[14px] font-semibold leading-snug text-ink">
                            {g ? g.patientFacingText : t('physioAdjustmentGoalGone')}
                          </p>
                          {req.note && (
                            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                              {req.note}
                            </p>
                          )}
                          <p className="mt-1 text-[12px] text-ink-muted">
                            {formatLongDate(req.date, locale)}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
          {physioGoalSuggestions.length === 0 &&
          physioMuscleSuggestions.length === 0 ? (
            hasTherapistActivity ? null : (
              <p className="text-[13px] text-ink-muted">
                {t('physioInputNone')}
              </p>
            )
          ) : (
            <>
              {/* Goal suggestions from the therapist. */}
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('physioSuggestedGoals')}
                </h3>
                {physioGoalSuggestions.length === 0 ? (
                  <p className="mt-1.5 text-[13px] text-ink-muted">
                    {t('physioGoalsEmpty')}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {physioGoalSuggestions.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5"
                      >
                        <p className="text-[14px] font-semibold leading-snug text-ink">
                          {s.suggestedGoal}
                        </p>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                          <span className="text-ink-muted">
                            {t('rationaleLabel')}:{' '}
                          </span>
                          {s.rationale}
                        </p>
                        <PhysioGoalSuggestionActions
                          suggestionId={s.id}
                          status={s.status}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Muscles flagged by the therapist. */}
              <div className="mt-4">
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">
                  {t('physioFlaggedMuscles')}
                </h3>
                {physioMuscleSuggestions.length === 0 ? (
                  <p className="mt-1.5 text-[13px] text-ink-muted">
                    {t('physioMusclesEmpty')}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {physioMuscleSuggestions.map((s) => {
                      const linkedGoal = activeGoals.find(
                        (g) => g.id === s.relatedGoalId
                      );
                      const sideLabel = injectionSideLabel(s.side);
                      return (
                        <li
                          key={s.id}
                          className="rounded-[var(--radius-button)] border border-stone/70 bg-cream p-2.5"
                        >
                          <p className="text-[14px] font-semibold leading-snug text-ink">
                            {s.muscle}{' '}
                            <span className="text-ink-muted">
                              · {sideLabel}
                            </span>
                          </p>
                          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                            <span className="text-ink-muted">
                              {t('rationaleLabel')}:{' '}
                            </span>
                            {s.rationale}
                          </p>
                          {linkedGoal && (
                            <p className="mt-1 text-[12px] text-ink-muted">
                              {t('relatedGoalLabel')}:{' '}
                              {linkedGoal.patientFacingText}
                            </p>
                          )}
                          <PhysioMuscleSuggestionActions
                            suggestionId={s.id}
                            status={s.status}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
            </div>
          </section>
        )}

        {/* Training panel — opens from the action row. Shows the weekly
            training-days overview (moved here from an always-on section). */}
        {openPanel === 'training' && (
          <section className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <h2 className="font-display text-[18px] leading-tight text-ink">
              {t('trainingPanelTitle')}
            </h2>
            {checkins.length > 0 ? (
              <div className="mt-3">
                <TrainingOverview
                  currentWeek={weekNumber}
                  daysByWeek={trainingByWeek}
                />
              </div>
            ) : (
              <p className="mt-3 text-[14px] text-ink-muted">
                {t('trainingPanelEmpty')}
              </p>
            )}
          </section>
        )}
        <PatientBanner
          name={patient.displayName}
          onOpenInfo={() =>
            router.push(
              locale === 'en' ? '/patient-info' : `/${locale}/patient-info`
            )
          }
          openInfoAria={tInfo('openInfo', { name: patient.displayName })}
          summary={patientSummary}
          treatmentDateText={t('treatmentDate', {
            date: formatLongDate(cycle.startDate, locale)
          })}
          modalityLabel={tModality(cycle.modality)}
          medication={patient.currentMedication}
          devices={
            patientInfo.data?.assistiveDevices ??
            patient.physioAssistiveDevices ??
            null
          }
          labels={{
            medication: t('banner.medication'),
            devices: t('banner.devices')
          }}
        />
        <div className="mt-4">
          <VisitChanges
            lastTreatmentDate={treatment?.date ?? null}
            cycleStartDate={cycle.startDate}
            checkins={checkins}
            goals={[...activeGoals, ...archivedGoals]}
            patientId={patient.id}
          />
        </div>

        {/* Wearable module — its own surface, shown only when a clinician
            has enabled it for this patient OR the patient already has
            wearable observations. (The "or has data" half means automated
            pairing will surface it with no further change.) */}
        {(patientInfo.data?.wearableEnabled ||
          (observationsQuery.data?.length ?? 0) > 0) && (
          <section className="mt-4 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-[18px] leading-tight text-ink">
                {t('wearableModuleTitle')}
              </h2>
              <button
                type="button"
                onClick={() => {
                  touch();
                  router.push(
                    locale === 'en'
                      ? '/clinician/observations'
                      : `/${locale}/clinician/observations`
                  );
                }}
                className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
              >
                {t('wearableModuleOpen')}
              </button>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              {(observationsQuery.data?.length ?? 0) > 0
                ? t('wearableModuleHasData')
                : t('wearableModuleNoData')}
            </p>
          </section>
        )}

        {/* Intrathecal baclofen track — continuous, titrated therapy running
            in parallel with the BoNT cycle. Shows the dose-titration log, or
            a compact start affordance when there's no active ITB therapy. */}
        <ItbTrack patientId={patient.id} onActivity={() => touch()} />
        </div>

        {/* Right column: the goals — the primary work surface. On the
            wide layout it sits beside the context column so goals are
            visible at the top rather than below the banner. */}
        <div>
        {/* Active goals with progress visualisation */}
        <section className={wide ? 'mt-10 lg:mt-0' : 'mt-10'}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {t('activeGoalsTitle')}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              {scoreQueueItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    touch();
                    setShowScoreQueue(true);
                  }}
                  className="relative inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-3 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
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
                    aria-hidden
                  >
                    <rect x="2" y="6" width="14" height="12" rx="2" />
                    <path d="M16 10l6-3v10l-6-3z" />
                  </svg>
                  {tVideoQueue('open', { n: scoreQueueItems.length })}
                </button>
              )}
              {/* Patient suggestions — moved here from the action row so
                  both goal-related actions sit together. Toggles the
                  suggestions panel above; the badge shows how many await
                  review. */}
              <button
                type="button"
                onClick={() => {
                  touch();
                  setShowSuggestions((v) => !v);
                }}
                aria-pressed={showSuggestions}
                aria-label={
                  suggestions.length > 0
                    ? `${t('actionSuggestions')} (${suggestions.length})`
                    : t('actionSuggestions')
                }
                className={`relative rounded-[var(--radius-button)] border px-3 py-2 text-[14px] font-semibold transition-colors ${
                  showSuggestions
                    ? 'border-sage-deep bg-sage-deep text-on-accent'
                    : 'border-sage/50 bg-cream-soft text-sage-deep hover:bg-sage-soft'
                }`}
              >
                {t('actionShortSuggestions')}
                {suggestions.length > 0 && (
                  <span
                    aria-hidden
                    className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-cream bg-amber-deep px-1 text-[10px] font-bold text-on-accent"
                  >
                    {suggestions.length}
                  </span>
                )}
              </button>
              {/* Record a goal the patient voiced in clinic. The goal
                  still originates from the patient; the physician is the
                  scribe — see create_goal_for_patient. */}
              <button
                type="button"
                onClick={() => {
                  touch();
                  setShowRecordGoal(true);
                }}
                className="rounded-[var(--radius-button)] border border-sage/50 bg-cream-soft px-3 py-2 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
              >
                {t('recordGoal')}
              </button>
            </div>
          </div>

          {/* Patient suggestions panel — renders here, right under the
              Suggestions button, so it opens in relation to the button
              that toggles it (not up by the action row). */}
          {showSuggestions && (
            <section className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
              <h2 className="font-display text-[18px] leading-tight text-ink">
                {t('patientSuggestionsHeading')}
              </h2>
              <div className="mt-3">
                {suggestions.length === 0 ? (
                  <p className="text-[14px] text-ink-muted">
                    {t('suggestionsEmpty')}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {suggestions.map((s) => (
                      <li
                        key={s.id}
                        className="rounded-[var(--radius-card)] border border-stone bg-cream p-4"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="eyebrow text-ink-muted">
                            {tDomain(s.domain)} · {tImportance(s.importance)}
                          </div>
                        </div>
                        <p className="mt-1.5 text-[15px] leading-relaxed text-ink">
                          &ldquo;{s.patientWording}&rdquo;
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            touch();
                            router.push(
                              locale === 'en'
                                ? `/clinician/suggestion?id=${s.id}`
                                : `/${locale}/clinician/suggestion?id=${s.id}`
                            );
                          }}
                          className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
                        >
                          {t('review')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
          {bontGoals.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-muted">
              {t('activeGoalsEmpty')}
            </p>
          ) : (
            <ul className={goalsListClass}>
              {bontGoals.map((g) => (
                <li key={g.id}>
                  <GoalProgressView
                    goalText={g.patientFacingText}
                    kind={g.kind}
                    currentWeek={weekNumber}
                    ratings={ratingsByGoal.get(g.id) ?? []}
                    physioRatings={physioRatingsByGoal.get(g.id) ?? []}
                    nrsDirection={g.nrs?.direction}
                    nrsBaseline={g.nrs?.baselineValue ?? null}
                    nrsTarget={g.nrs?.targetValue ?? null}
                    clinicPoints={clinicPointsByGoal.get(g.id) ?? []}
                    onExpand={() => setEnlargedGoalId(g.id)}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditGoalTarget(g)}
                      className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                    >
                      {t('editGoalCta')}
                    </button>
                    <span className="text-[12px] text-ink-muted">
                      {t('goalVersionLabel', { version: g.version })}
                    </span>
                    <button
                      type="button"
                      onClick={() => setHistoryTarget(g)}
                      className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                    >
                      {t('goalHistoryCta')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkTarget(g)}
                      className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                    >
                      {t('goalLinkCta')}
                    </button>
                  </div>
                  {workingOnGoalIds.has(g.id) && (
                    <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-1 text-[12px] font-semibold text-sage-deep">
                      {t('physioWorkingOnTag')}
                    </p>
                  )}
                  {(clinicVideoByGoal.get(g.id) ?? []).length > 0 && (
                    <div className="mt-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3">
                      <p className="text-[12px] font-semibold text-ink-soft">
                        {t('clinicSeriesHeading')}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
                        {t('clinicSeriesHint')}
                      </p>
                      <div className="mt-2">
                        <GoalProgressView
                          goalText={g.patientFacingText}
                          kind="gas"
                          currentWeek={weekNumber}
                          ratings={clinicVideoByGoal.get(g.id) ?? []}
                        />
                      </div>
                    </div>
                  )}
                  {/* Retire action — retires a goal (achieved /
                      partial / no longer suitable). History is kept;
                      the goal leaves the patient's future check-ins. */}
                  <div className="mt-1.5 flex justify-end gap-2">
                    {g.videoEnabled && (
                      <button
                        type="button"
                        onClick={() => {
                          touch();
                          setBaselineGoal({
                            id: g.id,
                            text: g.patientFacingText,
                            instruction: g.videoTaskInstruction,
                            setup: g.videoTaskSetup,
                            seconds: g.videoTaskSeconds,
                            existingPath: g.baselineVideoPath
                          });
                        }}
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
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
                          <path d="M3 4h18l-4 5 4 5H3z" />
                          <path d="M3 4v16" />
                        </svg>
                        {g.baselineVideoPath
                          ? tVideoProtocol('baselineSet')
                          : tVideoProtocol('baselineRecord')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        touch();
                        setVideoEditorGoal({
                          id: g.id,
                          text: g.patientFacingText,
                          enabled: g.videoEnabled,
                          instruction: g.videoTaskInstruction,
                          setup: g.videoTaskSetup,
                          seconds: g.videoTaskSeconds
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
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
                        <rect x="2" y="6" width="14" height="12" rx="2" />
                        <path d="M16 10l6-3v10l-6-3z" />
                      </svg>
                      {tVideoProtocol('open')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        touch();
                        setGoalToArchive({
                          id: g.id,
                          text: g.patientFacingText
                        });
                      }}
                      className="inline-flex items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
                    >
                      {/* check-in-out / retire glyph */}
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
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                      </svg>
                      {t('retireGoal')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ITB goals — tagged for the intrathecal-baclofen therapy. They
            share the weekly check-in with the BoNT goals (same cycle), so
            the patient rates them in one go; here they're grouped under
            their own heading. Shown when there's an active ITB therapy or
            any ITB goal already exists. */}
        {(itbTherapyQuery.data || itbGoals.length > 0) && (
          <section className="mt-10">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-[20px] leading-tight text-ink">
                {t('itbGoalsTitle')}
              </h2>
              {itbTherapyQuery.data && (
                <button
                  type="button"
                  onClick={() => {
                    touch();
                    setShowRecordItbGoal(true);
                  }}
                  className="shrink-0 rounded-[var(--radius-button)] border border-sage/50 bg-cream-soft px-3 py-2 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft"
                >
                  {t('itbRecordGoal')}
                </button>
              )}
            </div>
            {itbGoals.length === 0 ? (
              <p className="mt-3 text-[14px] text-ink-muted">
                {t('itbGoalsEmpty')}
              </p>
            ) : (
              <ul className={goalsListClass}>
                {itbGoals.map((g) => (
                  <li key={g.id}>
                    <GoalProgressView
                      goalText={g.patientFacingText}
                      kind={g.kind}
                      currentWeek={weekNumber}
                      ratings={ratingsByGoal.get(g.id) ?? []}
                      physioRatings={physioRatingsByGoal.get(g.id) ?? []}
                      nrsDirection={g.nrs?.direction}
                      nrsBaseline={g.nrs?.baselineValue ?? null}
                      nrsTarget={g.nrs?.targetValue ?? null}
                      clinicPoints={clinicPointsByGoal.get(g.id) ?? []}
                      doseMarkers={itbDoseMarkers}
                      onExpand={() => setEnlargedGoalId(g.id)}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setEditGoalTarget(g)}
                        className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                      >
                        {t('editGoalCta')}
                      </button>
                      <span className="text-[12px] text-ink-muted">
                        {t('goalVersionLabel', { version: g.version })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setHistoryTarget(g)}
                        className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                      >
                        {t('goalHistoryCta')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setLinkTarget(g)}
                        className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                      >
                        {t('goalLinkCta')}
                      </button>
                    </div>
                    {workingOnGoalIds.has(g.id) && (
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-sage-soft px-2.5 py-1 text-[12px] font-semibold text-sage-deep">
                        {t('physioWorkingOnTag')}
                      </p>
                    )}
                    <div className="mt-1.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          touch();
                          setGoalToArchive({
                            id: g.id,
                            text: g.patientFacingText
                          });
                        }}
                        className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink"
                      >
                        {t('retireGoal')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Earlier goals — retired this cycle, with how each ended.
            Shows the climb (achieved goals) and course-corrections
            (reframed / no longer suitable) without re-asking the
            patient about them. Only rendered when there are archived
            goals. Their check-in history is preserved in the export. */}
        {archivedGoals.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-[20px] leading-tight text-ink">
              {t('earlierGoalsTitle')}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
              {t('earlierGoalsBody')}
            </p>
            <ul className="mt-4 space-y-2">
              {archivedGoals.map((g) => (
                <li
                  key={g.id}
                  className="flex items-start gap-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft px-4 py-3"
                >
                  <GoalOutcomeBadge outcome={g.outcome} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-snug text-ink">
                      {g.patientFacingText}
                    </span>
                    {g.smartText && (
                      <span className="mt-0.5 block text-[13px] leading-snug text-ink-muted">
                        {g.smartText}
                      </span>
                    )}
                  </span>
                  {/* Reactivate — for a goal retired by mistake. Returns
                      it to the patient's active check-ins. */}
                  <button
                    type="button"
                    onClick={() => onReactivateGoal(g.id)}
                    disabled={reactivateGoal.isPending}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft hover:text-ink disabled:opacity-60"
                  >
                    {/* restore / undo glyph */}
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
                      <path d="M3 7v6h6" />
                      <path d="M3.5 13a9 9 0 1 0 2.3-9.3L3 7" />
                    </svg>
                    {t('reactivateGoal')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>
        </div>

        {/* Patient comments are now reachable from the chart — tap any
            dot showing a speech-bubble icon to see the comment in the
            caption below the chart. */}
      </main>

      {showExport && (
        <ExportModal
          initialText={buildEhrExport({
            patient: { displayName: patient.displayName },
            cycle: {
              cycleNumber: cycle.cycleNumber,
              startDate: cycle.startDate,
              modality: cycle.modality
            },
            treatment: treatment
              ? {
                  date: treatment.date,
                  drugProduct: treatment.drugProduct,
                  totalUnits: treatment.totalUnits,
                  dilution: treatment.dilution ?? undefined,
                  guidance: treatment.guidance as GuidanceMethod,
                  injections: treatment.injections.map((i) => ({
                    muscle: i.muscle,
                    side: i.side,
                    doseUnits: i.doseUnits,
                    note: i.note ?? undefined,
                    isFace: i.posX != null
                  })),
                  notes: treatment.notes ?? undefined
                }
              : undefined,
            goals: [...activeGoals, ...archivedGoals].map((g) => ({
              id: g.id,
              patientFacingText: g.patientFacingText,
              kind: g.kind,
              nrsDirection: g.nrs?.direction
            })),
            checkins: checkins.map((c) => ({
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

      {showNewCycle && (
        <NewCycleDialog
          onClose={() => setShowNewCycle(false)}
        />
      )}

      {showRecordGoal && (
        <RecordGoalDrawer
          patientId={patient.id}
          onClose={() => setShowRecordGoal(false)}
        />
      )}
      {showRecordItbGoal && (
        <RecordGoalDrawer
          patientId={patient.id}
          therapy="itb"
          onClose={() => setShowRecordItbGoal(false)}
        />
      )}

      {editGoalTarget && (
        <EditGoalDrawer
          goal={editGoalTarget}
          onClose={() => setEditGoalTarget(null)}
        />
      )}
      {historyTarget && (
        <GoalHistoryModal
          lineageId={historyTarget.lineageId}
          goalLabel={historyTarget.patientFacingText}
          onClose={() => setHistoryTarget(null)}
        />
      )}
      {linkTarget && (
        <LinkGoalModal
          sourceGoal={linkTarget}
          candidates={activeGoals.filter(
            (x) =>
              x.id !== linkTarget.id &&
              x.kind === linkTarget.kind &&
              x.lineageId !== linkTarget.lineageId
          )}
          onClose={() => setLinkTarget(null)}
        />
      )}

      {confirmEnd && (
        <EndSessionConfirmDialog
          keepLabel={tSession('endSessionConfirmKeep')}
          endLabel={tSession('endSessionConfirmEnd')}
          title={tSession('endSessionConfirm')}
          onKeep={() => setConfirmEnd(false)}
          onEnd={onEndSession}
          endDisabled={endSession.isPending}
        />
      )}

      {goalToArchive && (
        <ArchiveGoalConfirmDialog
          goalText={goalToArchive.text}
          onCancel={() => setGoalToArchive(null)}
          onRetire={onRetireGoal}
          retireDisabled={retireGoal.isPending}
        />
      )}
      {enlargedGoalId &&
        (() => {
          const g = activeGoals.find((x) => x.id === enlargedGoalId);
          if (!g) return null;
          return (
            <GoalGraphModal
              goalText={g.patientFacingText}
              kind={g.kind}
              currentWeek={weekNumber}
              ratings={ratingsByGoal.get(g.id) ?? []}
              physioRatings={physioRatingsByGoal.get(g.id) ?? []}
              nrsDirection={g.nrs?.direction}
              nrsBaseline={g.nrs?.baselineValue ?? null}
              nrsTarget={g.nrs?.targetValue ?? null}
              clinicPoints={clinicPointsByGoal.get(g.id) ?? []}
              doseMarkers={g.therapy === 'itb' ? itbDoseMarkers : []}
              closeLabel={tSession('done')}
              onClose={() => setEnlargedGoalId(null)}
            />
          );
        })()}
      {videoEditorGoal && (
        <VideoProtocolEditor
          goalId={videoEditorGoal.id}
          goalText={videoEditorGoal.text}
          initialEnabled={videoEditorGoal.enabled}
          initialInstruction={videoEditorGoal.instruction}
          initialSetup={videoEditorGoal.setup}
          initialSeconds={videoEditorGoal.seconds}
          onClose={() => setVideoEditorGoal(null)}
        />
      )}

      {baselineGoal && (
        <BaselineRecorderModal
          patientId={patient.id}
          goalId={baselineGoal.id}
          goalText={baselineGoal.text}
          protocol={{
            instruction: baselineGoal.instruction,
            setup: baselineGoal.setup,
            seconds: baselineGoal.seconds
          }}
          existingPath={baselineGoal.existingPath}
          onClose={() => setBaselineGoal(null)}
        />
      )}

      {showScoreQueue && scoreQueueItems.length > 0 && (
        <VideoScoreQueue
          items={scoreQueueItems}
          onClose={() => setShowScoreQueue(false)}
        />
      )}
    </div>
  );
}

/**
 * Small colour-coded badge for a retired goal's outcome, matching the
 * retire dialog's language: achieved (sage), partially achieved
 * (amber), no longer suitable (neutral). Falls back to a plain
 * "retired" chip if the outcome is null (older archived goals from
 * before outcomes were captured).
 */
function GoalOutcomeBadge({ outcome }: { outcome: GoalOutcome | null }) {
  const t = useTranslations('clinician.patient');
  const map: Record<
    GoalOutcome,
    { label: string; className: string }
  > = {
    achieved: {
      label: t('retireAchieved'),
      className: 'bg-sage-soft text-sage-deep'
    },
    partial: {
      label: t('retirePartial'),
      className: 'bg-amber-soft text-amber-deep'
    },
    noLongerSuitable: {
      label: t('retireNoLongerSuitable'),
      className: 'bg-stone text-ink-soft'
    }
  };
  const item = outcome
    ? map[outcome]
    : { label: t('outcomeUnknown'), className: 'bg-stone text-ink-soft' };
  return (
    <span
      className={`mt-0.5 inline-block shrink-0 rounded-[var(--radius-button)] px-2.5 py-1 text-[12px] font-semibold ${item.className}`}
    >
      {item.label}
    </span>
  );
}

/**
 * Confirmation before retiring a goal, capturing *how* it ended.
 * Goals are living — reviewed and adjusted at each visit — so retiring
 * one is a clinical event with a meaningful outcome, not a flat
 * "archive". The physician picks: achieved, partially achieved, or no
 * longer suitable. All three retire the goal (it leaves the patient's
 * check-ins, history preserved); they differ only in the recorded
 * outcome, which feeds the per-cycle goal history. A keep-working
 * escape leaves the goal active.
 */
function ArchiveGoalConfirmDialog({
  goalText,
  onCancel,
  onRetire,
  retireDisabled
}: {
  goalText: string;
  onCancel: () => void;
  onRetire: (outcome: GoalOutcome) => void;
  retireDisabled: boolean;
}) {
  const containerRef = useModalA11y(onCancel);
  const t = useTranslations('clinician.patient');
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-goal-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2
          id="archive-goal-title"
          className="font-display text-[20px] text-ink"
        >
          {t('retireConfirmTitle')}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          &ldquo;{goalText}&rdquo;
        </p>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-muted">
          {t('retireConfirmBody')}
        </p>

        <p className="mt-5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
          {t('retireOutcomePrompt')}
        </p>
        <div className="mt-2 flex flex-col gap-2">
          {/* Achieved — the positive outcome, styled as the primary. */}
          <button
            type="button"
            onClick={() => onRetire('achieved')}
            disabled={retireDisabled}
            className="flex flex-col items-start rounded-[var(--radius-button)] bg-sage-deep px-4 py-3 text-left hover:bg-ink-soft disabled:opacity-60"
          >
            <span className="text-[15px] font-semibold text-on-accent">
              {t('retireAchieved')}
            </span>
            <span className="text-[12px] leading-snug text-on-accent/85">
              {t('retireAchievedHint')}
            </span>
          </button>
          {/* Partially achieved. */}
          <button
            type="button"
            onClick={() => onRetire('partial')}
            disabled={retireDisabled}
            className="flex flex-col items-start rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-left hover:bg-stone-soft disabled:opacity-60"
          >
            <span className="text-[15px] font-semibold text-ink">
              {t('retirePartial')}
            </span>
            <span className="text-[12px] leading-snug text-ink-muted">
              {t('retirePartialHint')}
            </span>
          </button>
          {/* No longer suitable / reframed / dropped. */}
          <button
            type="button"
            onClick={() => onRetire('noLongerSuitable')}
            disabled={retireDisabled}
            className="flex flex-col items-start rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-3 text-left hover:bg-stone-soft disabled:opacity-60"
          >
            <span className="text-[15px] font-semibold text-ink">
              {t('retireNoLongerSuitable')}
            </span>
            <span className="text-[12px] leading-snug text-ink-muted">
              {t('retireNoLongerSuitableHint')}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          {t('archiveConfirmKeep')}
        </button>
      </div>
    </div>
  );
}

function EndSessionConfirmDialog({
  title,
  keepLabel,
  endLabel,
  onKeep,
  onEnd,
  endDisabled
}: {
  title: string;
  keepLabel: string;
  endLabel: string;
  onKeep: () => void;
  onEnd: () => void;
  endDisabled: boolean;
}) {
  const containerRef = useModalA11y(onKeep);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-session-title"
        className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl"
      >
        <h2 id="end-session-title" className="font-display text-[20px] text-ink">
          {title}
        </h2>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {keepLabel}
          </button>
          <button
            type="button"
            onClick={onEnd}
            disabled={endDisabled}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-60"
          >
            {endLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Action row for a physiotherapist goal suggestion. While the
 * suggestion is awaiting review, shows Accept / Dismiss buttons. Once
 * acted on, shows the final status instead. "Accept" here records the
 * physician's intent to take the goal forward — the actual goal
 * approval still happens via the normal goal-approval flow.
 */
function PhysioGoalSuggestionActions({
  suggestionId,
  status
}: {
  suggestionId: string;
  status: string;
}) {
  const setStatus = useSetPhysioGoalSuggestionStatus();
  const toast = useToast();
  const t = useTranslations('clinician.patient');

  if (status !== 'needsReview') {
    return (
      <p className="mt-3 text-[13px] uppercase tracking-wider text-ink-muted">
        {status === 'accepted'
          ? t('suggestionStatusConsidered')
          : t('suggestionStatusDismissed')}
      </p>
    );
  }

  const act = async (next: 'accepted' | 'dismissed') => {
    try {
      await setStatus.mutateAsync({ suggestionId, status: next });
      toast.success(
        next === 'accepted'
          ? t('suggestionMarkedConsidered')
          : t('suggestionDismissedToast')
      );
    } catch {
      toast.error(t('suggestionUpdateError'));
    }
  };

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={() => act('accepted')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
      >
        {t('suggestionActionConsider')}
      </button>
      <button
        type="button"
        onClick={() => act('dismissed')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-50"
      >
        {t('suggestionActionDismiss')}
      </button>
    </div>
  );
}

/**
 * Action row for a physiotherapist muscle suggestion. "Mark considered"
 * records that the physician has factored this muscle into injection
 * planning; "Dismiss" marks it not relevant.
 */
function PhysioMuscleSuggestionActions({
  suggestionId,
  status
}: {
  suggestionId: string;
  status: string;
}) {
  const setStatus = useSetPhysioMuscleSuggestionStatus();
  const toast = useToast();
  const t = useTranslations('clinician.patient');

  if (status !== 'needsReview') {
    return (
      <p className="mt-3 text-[13px] uppercase tracking-wider text-ink-muted">
        {status === 'reviewed'
          ? t('suggestionStatusConsidered')
          : t('suggestionStatusDismissed')}
      </p>
    );
  }

  const act = async (next: 'reviewed' | 'dismissed') => {
    try {
      await setStatus.mutateAsync({ suggestionId, status: next });
      toast.success(
        next === 'reviewed'
          ? t('suggestionMarkedConsidered')
          : t('suggestionDismissedToast')
      );
    } catch {
      toast.error(t('suggestionUpdateError'));
    }
  };

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={() => act('reviewed')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
      >
        {t('suggestionActionConsider')}
      </button>
      <button
        type="button"
        onClick={() => act('dismissed')}
        disabled={setStatus.isPending}
        className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-50"
      >
        {t('suggestionActionDismiss')}
      </button>
    </div>
  );
}
