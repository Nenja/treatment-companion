'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useCurrentClinicianSession,
  useTouchClinicianSession
} from '@/lib/supabase/clinicianSession';
import {
  useClinicianPatientData,
  useSaveTreatmentSession,
  usePreviousTreatment
} from '@/lib/supabase/clinicianPatient';
import { todayIso } from '@/lib/dates';
import {
  GUIDANCE_METHODS,
  INJECTION_SIDES,
  type GuidanceMethod,
  type InjectionSide
} from '@/lib/types';
import { AccountMenu } from '@/components/layout/AccountMenu';

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
  const touchSession = useTouchClinicianSession();

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

  useEffect(() => {
    if (!sessionQuery.isLoading && sessionQuery.data === null) {
      router.replace(
        (locale === 'en' ? '/clinician' : `/${locale}/clinician`) +
          '?timeout=1'
      );
    }
  }, [sessionQuery.isLoading, sessionQuery.data, router, locale]);

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
  }, [dataQuery.data, hydrated]);

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

  const back = () =>
    router.push(
      locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`
    );

  /**
   * Fill all form fields from the previous cycle's treatment session,
   * EXCEPT the date — that defaults to today (the new treatment is
   * happening now, not at the date of the previous session). Per-muscle
   * notes are copied verbatim along with everything else, per the
   * user's preference: "Today's date + everything else verbatim".
   */
  const doCopyFromPrevious = () => {
    const prev = previousTreatment.data;
    if (!prev) return;
    setDate(todayIso());
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
  const canSubmit =
    date.trim() &&
    drugProduct.trim() &&
    totalUnits.trim() &&
    !Number.isNaN(totalUnitsNum) &&
    totalUnitsNum >= 0 &&
    validInjections.length > 0;

  const submit = async () => {
    if (!canSubmit || save.isPending) return;
    await save.mutateAsync({
      treatmentCycleId: cycle.id,
      date,
      drugProduct,
      totalUnits: totalUnitsNum,
      dilution: dilution.trim() || undefined,
      guidance,
      notes: notes.trim() || undefined,
      injections: validInjections.map((i) => ({
        muscle: i.muscle,
        side: i.side,
        doseUnits: parseFloat(i.doseUnits),
        note: i.note.trim() || undefined
      }))
    });
    touchSession.mutate();
    back();
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

      <main className="mx-auto max-w-[480px] px-5 pb-24 pt-6">
        <h1 className="font-display text-[24px] leading-tight text-ink">
          {existing ? 'Edit treatment record' : 'Record treatment'}
        </h1>
        <p className="mt-1 text-[14px] text-ink-soft">
          For {patient.displayName} · Cycle {cycle.cycleNumber}
        </p>

        {/* Copy from previous treatment — only when a previous one exists */}
        {previousTreatment.data && (
          <button
            type="button"
            onClick={() => {
              // If the form already has content (anything beyond defaults)
              // we ask for confirmation before overwriting. Otherwise copy
              // immediately.
              const hasContent =
                drugProduct.trim() ||
                totalUnits.trim() ||
                dilution.trim() ||
                notes.trim() ||
                injections.some((i) => i.muscle.trim() || i.doseUnits.trim());
              if (hasContent) {
                setShowCopyConfirm(true);
              } else {
                doCopyFromPrevious();
              }
            }}
            className="mt-4 flex h-10 w-full items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Copy from previous treatment
          </button>
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
        <p className="mt-1 text-[12px] text-ink-muted">
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
                    className="text-[12px] font-semibold text-ink-soft hover:text-ink"
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
                        {s === 'left'
                          ? 'Left'
                          : s === 'right'
                          ? 'Right'
                          : 'Bilateral'}
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

        <div className="mt-8 flex gap-3">
          <button
            type="button"
            onClick={back}
            className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || save.isPending}
            className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
          >
            {save.isPending ? '…' : 'Save'}
          </button>
        </div>
      </main>

      {showCopyConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl">
            <h2 className="font-display text-[20px] leading-tight text-ink">
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
                onClick={doCopyFromPrevious}
                className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-cream-soft hover:bg-ink-soft"
              >
                Yes, copy and overwrite
              </button>
              <button
                type="button"
                onClick={() => setShowCopyConfirm(false)}
                className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
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
      <label className="block text-[13px] font-semibold text-ink">
        {label}
      </label>
      {helper && <p className="mt-0.5 text-[12px] text-ink-muted">{helper}</p>}
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
