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
  usePreviousTreatment
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
import { classifyError } from '@/lib/feedback';

interface InjectionDraft {
  muscle: string;
  side: InjectionSide;
  doseUnits: string;
  note: string;
}

function emptyInjection(): InjectionDraft {
  return { muscle: '', side: 'left', doseUnits: '', note: '' };
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
          note: i.note ?? ''
        }))
      );
    }
    setHydrated(true);
  }, [dataQuery.data, hydrated, isNewCycle, newCycleDate]);

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
            note: i.note ?? ''
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
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={back}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            ← Back
          </button>
          <span className="eyebrow">Treatment record</span>
          <AccountMenu />
        </div>
      </header>

      <main
        className="mx-auto max-w-[480px] px-5 pb-24 pt-6"
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
            : `For ${patient.displayName} · Cycle ${cycle.cycleNumber}`}
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

        {/* Previous treatment — shown as reference, since the new
            plan is usually an adjustment of the last one. The copy
            action lives inside this block. Only when one exists. */}
        {referenceTreatment && (
          <div className="mt-4 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <div className="eyebrow">Previous treatment — for reference</div>
            <p className="mt-1 text-[14px] text-ink-soft">
              {referenceTreatment.drugProduct} ·{' '}
              {referenceTreatment.totalUnits} units
              {referenceTreatment.dilution &&
                ` · ${referenceTreatment.dilution}`}
            </p>
            <ul className="mt-2 space-y-1 text-[14px] text-ink-soft">
              {referenceTreatment.injections.map((inj) => (
                <li key={inj.id}>
                  {inj.muscle} · {injectionSideLabel(inj.side)} ·{' '}
                  {inj.doseUnits} units
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                const hasContent =
                  drugProduct.trim() ||
                  totalUnits.trim() ||
                  dilution.trim() ||
                  notes.trim() ||
                  injections.some(
                    (i) => i.muscle.trim() || i.doseUnits.trim()
                  );
                if (hasContent) {
                  setShowCopyConfirm(true);
                } else {
                  doCopyFromPrevious();
                }
              }}
              className="mt-3 flex h-10 w-full items-center justify-center rounded-[var(--radius-button)] border border-sage/50 bg-sage-soft px-4 text-[14px] font-semibold text-sage-deep hover:bg-sage-soft/70"
            >
              Copy these into the new plan
            </button>
          </div>
        )}

        {/* Row 1: Date + Drug product (date is narrow, product is wider) */}
        <div className="mt-6 grid gap-3 sm:grid-cols-[140px_1fr]">
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

        {/* Row 2: Total units + Dilution (both compact) */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
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
          </Field>
          <Field label="Dilution" inline>
            <input
              type="text"
              value={dilution}
              onChange={(e) => setDilution(e.target.value)}
              className={inputClasses}
              maxLength={40}
              placeholder="e.g. 250 IU/ml"
            />
          </Field>
        </div>

        {/* Row 3: Guidance technique — full width because dropdown labels
            can be long ("Electrical stimulation"). */}
        <Field
          label="Guidance technique"
          helper="Used for all muscles in this session."
        >
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

        {/* Muscles section */}
        <h2 className="mt-8 font-display text-[18px] text-ink">
          Muscles injected
        </h2>
        <p className="mt-1 text-[14px] text-ink-muted">
          Add one row per muscle.
        </p>
        <ul className="mt-3 space-y-3">
          {injections.map((inj, i) => (
            <li
              key={i}
              className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="eyebrow text-ink-muted">Muscle {i + 1}</div>
                {injections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInjection(i)}
                    className="text-[14px] font-semibold text-ink-soft hover:text-ink"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Muscle name — full width */}
              <Field label="Muscle name" inline>
                <input
                  type="text"
                  value={inj.muscle}
                  onChange={(e) =>
                    updateInjection(i, { muscle: e.target.value })
                  }
                  className={inputClasses}
                  placeholder="e.g. Gastrocnemius"
                  maxLength={80}
                />
              </Field>

              {/* Side + dose — two columns */}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field label="Side" inline>
                  <select
                    value={inj.side}
                    onChange={(e) =>
                      updateInjection(i, {
                        side: e.target.value as InjectionSide
                      })
                    }
                    className={inputClasses}
                  >
                    {INJECTION_SIDES.map((s) => (
                      <option key={s} value={s}>
                        {injectionSideLabel(s)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dose (units)" inline>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={inj.doseUnits}
                    onChange={(e) =>
                      updateInjection(i, { doseUnits: e.target.value })
                    }
                    className={inputClasses}
                  />
                </Field>
              </div>

              {/* Per-muscle note */}
              <Field
                label="Note"
                helper="Optional. E.g. 'high EMG activity'."
                inline
              >
                <input
                  type="text"
                  value={inj.note}
                  onChange={(e) =>
                    updateInjection(i, { note: e.target.value })
                  }
                  className={inputClasses}
                  maxLength={200}
                />
              </Field>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={addInjection}
          className="mt-3 flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          + Add another muscle
        </button>

        {/* Running total of the per-muscle doses entered above. A plain
            figure for the clinician's own reference — not compared to
            "Total units", not flagged. Shown once at least one dose is
            present. */}
        {dosesSum > 0 && (
          <p className="mt-3 text-[14px] text-ink-soft">
            Per-muscle doses entered:{' '}
            <span className="font-semibold tabular-nums text-ink">
              {dosesSumLabel} units
            </span>
          </p>
        )}

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
      </main>

      {showCopyConfirm && (
        <CopyConfirmDialog
          onConfirm={doCopyFromPrevious}
          onCancel={() => setShowCopyConfirm(false)}
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
