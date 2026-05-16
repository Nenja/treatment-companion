'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { todayIso } from '@/lib/dates';
import {
  GUIDANCE_METHODS,
  INJECTION_SIDES,
  type GuidanceMethod,
  type InjectionSide,
  type MuscleInjection
} from '@/lib/types';
import { useSessionTimeout } from '@/lib/useSessionTimeout';

interface InjectionDraft {
  muscle: string;
  side: InjectionSide;
  doseUnits: string; // string while editing, parsed on submit
  guidance: GuidanceMethod;
}

function emptyInjection(): InjectionDraft {
  return {
    muscle: '',
    side: 'left',
    doseUnits: '',
    guidance: 'ultrasound'
  };
}

export default function TreatmentRecordPage() {
  const router = useRouter();
  const locale = useLocale();
  const tSession = useTranslations('clinician.session');
  const state = useStore();
  const session = state.clinicianSession;

  useSessionTimeout({
    onTimeout: () => {
      actions.endClinicianSession();
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  });

  useEffect(() => {
    if (!session) {
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  }, [session, router, locale]);

  const patient = session
    ? state.patients.find((p) => p.id === session.patientId)
    : undefined;
  const cycle = patient
    ? state.treatmentCycles.find((c) => c.id === patient.activeTreatmentCycleId)
    : undefined;
  const existing = cycle
    ? state.treatmentSessions.find((t) => t.treatmentCycleId === cycle.id)
    : undefined;

  // Form state — initialised from existing record if any.
  const [date, setDate] = useState(existing?.date ?? todayIso());
  const [drugProduct, setDrugProduct] = useState(existing?.drugProduct ?? '');
  const [totalUnits, setTotalUnits] = useState(
    existing?.totalUnits ? String(existing.totalUnits) : ''
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [injections, setInjections] = useState<InjectionDraft[]>(
    existing
      ? existing.injections.map((i) => ({
          muscle: i.muscle,
          side: i.side,
          doseUnits: String(i.doseUnits),
          guidance: i.guidance
        }))
      : [emptyInjection()]
  );

  if (!session || !patient || !cycle) return null;

  const back = () =>
    router.push(
      locale === 'en' ? '/clinician/patient' : `/${locale}/clinician/patient`
    );

  const updateInjection = (idx: number, patch: Partial<InjectionDraft>) => {
    setInjections((prev) =>
      prev.map((inj, i) => (i === idx ? { ...inj, ...patch } : inj))
    );
  };
  const removeInjection = (idx: number) => {
    setInjections((prev) => prev.filter((_, i) => i !== idx));
  };
  const addInjection = () => {
    setInjections((prev) => [...prev, emptyInjection()]);
  };

  const validInjections = injections.filter(
    (i) => i.muscle.trim() && i.doseUnits.trim() && !Number.isNaN(parseFloat(i.doseUnits))
  );
  const totalUnitsNum = parseFloat(totalUnits);
  const canSubmit =
    date.trim() &&
    drugProduct.trim() &&
    totalUnits.trim() &&
    !Number.isNaN(totalUnitsNum) &&
    totalUnitsNum >= 0 &&
    validInjections.length > 0;

  const submit = () => {
    if (!canSubmit) return;
    const cleaned: Omit<MuscleInjection, 'id'>[] = validInjections.map((i) => ({
      muscle: i.muscle,
      side: i.side,
      doseUnits: parseFloat(i.doseUnits),
      guidance: i.guidance
    }));
    actions.saveTreatmentSession(patient.id, cycle.id, {
      date,
      drugProduct,
      totalUnits: totalUnitsNum,
      injections: cleaned,
      notes: notes.trim() || undefined
    });
    actions.touchClinicianSession();
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
          <span className="w-10" aria-hidden />
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-24 pt-6">
        <h1 className="font-display text-[24px] leading-tight text-ink">
          {existing ? 'Edit treatment record' : 'Record treatment'}
        </h1>
        <p className="mt-1 text-[14px] text-ink-soft">
          For {patient.displayName} · Cycle {cycle.cycleNumber}
        </p>

        {/* Session-level fields */}
        <Field label="Date of treatment">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClasses}
          />
        </Field>
        <Field label="Drug product" helper="Free text — e.g. Botox, Dysport, Xeomin">
          <input
            type="text"
            value={drugProduct}
            onChange={(e) => setDrugProduct(e.target.value)}
            className={inputClasses}
            maxLength={60}
          />
        </Field>
        <Field label="Total units">
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

        {/* Injections list */}
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
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                <Field label="Guidance" inline>
                  <select
                    value={inj.guidance}
                    onChange={(e) =>
                      updateInjection(i, {
                        guidance: e.target.value as GuidanceMethod
                      })
                    }
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

        <Field label="Notes" helper="Optional">
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
            disabled={!canSubmit}
            className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
          >
            Save
          </button>
        </div>
      </main>
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
    <div className={inline ? 'mt-3' : 'mt-6'}>
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
