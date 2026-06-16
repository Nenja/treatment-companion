'use client';

import { useEffect, useRef, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useExportRedcapDataset, useSyncRedcapDataset } from '@/lib/redcapExport';
import { useCurrentClinicianSession } from '@/lib/supabase/clinicianSession';
import { EndSessionButton } from '@/components/clinician/EndSessionButton';
import { isSessionEndingDeliberately } from '@/lib/sessionEndSignal';
import { SkeletonScreen, SkeletonBlock } from '@/components/feedback/Skeleton';
import {
  useImportObservations,
  usePatientObservations,
  parseObservationsCsv,
  type ObservationInput,
  type ObservationSource
} from '@/lib/supabase/observations';

/**
 * Clinician-facing import surface for the wearable / third-party data
 * scaffold (migration 0069). Reads the patient from the active clinician
 * session, exactly like the history page — the physician has already
 * unlocked the patient.
 *
 * This is a foundation/tool, not a finished feature: it accepts manual
 * entries and normalized CSV (the two paths that need no vendor approval),
 * which validates the data model end-to-end before any per-vendor adapter
 * (Apple Health, Health Connect, Garmin, …) is built. See HANDOVER §8.
 */

const SOURCE_OPTIONS: ObservationSource[] = [
  'manual',
  'csv',
  'apple_health',
  'health_connect',
  'garmin',
  'fitbit',
  'oura',
  'withings',
  'other'
];

export default function ClinicianObservationsPage() {
  const router = useRouter();
  const locale = useLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const t = useTranslations('clinician.wearable');
  const tExport = useTranslations('clinician.researchExport');
  const { profile, loading: authLoading } = useAuth();

  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role ?? null
  );
  const patientId = sessionQuery.data?.patientId ?? null;
  const recent = usePatientObservations(patientId);
  const importObs = useImportObservations();
  const exportRedcap = useExportRedcapDataset();
  const syncRedcap = useSyncRedcapDataset();

  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState('');
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [resultCount, setResultCount] = useState<number | null>(null);

  // Manual single-measurement form.
  const [mCode, setMCode] = useState('');
  const [mDisplay, setMDisplay] = useState('');
  const [mValue, setMValue] = useState('');
  const [mUnit, setMUnit] = useState('');
  const [mSource, setMSource] = useState<ObservationSource>('manual');
  const [mTime, setMTime] = useState('');
  const [mDevice, setMDevice] = useState('');

  // Auth + role gate (clinician only for now).
  useEffect(() => {
    if (authLoading) return;
    if (!profile) {
      router.replace(prefix ? `${prefix}/login` : '/login');
      return;
    }
    if (profile.role !== 'clinician') {
      router.replace(prefix ? `${prefix}/` : '/');
    }
  }, [authLoading, profile, router, prefix]);

  // No active session → back to the unlock screen. Settled result only.
  useEffect(() => {
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      if (isSessionEndingDeliberately()) return;
      router.replace(prefix ? `${prefix}/clinician` : '/clinician');
    }
  }, [sessionQuery.status, sessionQuery.data, router, prefix]);

  if (
    authLoading ||
    !profile ||
    profile.role !== 'clinician' ||
    sessionQuery.isLoading ||
    !sessionQuery.data
  ) {
    return (
      <SkeletonScreen>
        <SkeletonBlock width="w-2/3" height="h-8" />
        <SkeletonBlock height="h-40" className="mt-6" />
      </SkeletonScreen>
    );
  }

  const pid = patientId as string;
  const patientPath = prefix
    ? `${prefix}/clinician/patient`
    : '/clinician/patient';

  const runImport = async (rows: ObservationInput[]) => {
    setResultCount(null);
    if (rows.length === 0) return;
    const n = await importObs.mutateAsync({ patientId: pid, observations: rows });
    setResultCount(n);
  };

  const onImportCsv = async () => {
    const { rows, errors } = parseObservationsCsv(csvText);
    setParseErrors(errors);
    if (rows.length > 0) {
      await runImport(rows);
      setCsvText('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };

  const canAddManual =
    mCode.trim().length > 0 && mValue.trim().length > 0 && mTime.length > 0;

  const onAddManual = async () => {
    if (!canAddManual) return;
    const num = Number(mValue);
    if (Number.isNaN(num)) return;
    const when = new Date(mTime);
    if (Number.isNaN(when.getTime())) return;
    await runImport([
      {
        source: mSource,
        code: mCode.trim(),
        display: mDisplay.trim() || undefined,
        valueNumeric: num,
        unit: mUnit.trim() || undefined,
        effectiveTime: when.toISOString(),
        deviceLabel: mDevice.trim() || undefined
      }
    ]);
    setMCode('');
    setMDisplay('');
    setMValue('');
    setMUnit('');
    setMTime('');
    setMDevice('');
  };

  const observations = recent.data ?? [];

  const fmtDateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(iso));

  const cardClass =
    'rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4';
  const labelClass = 'text-[12px] font-semibold text-ink-soft';
  const inputClass =
    'mt-1 w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink';
  const btnPrimary =
    'rounded-[var(--radius-button)] bg-sage-deep px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50';

  return (
    <div className="min-h-dvh bg-cream">
      <AppHeader
        width="narrow"
        back={{ label: t('back'), onClick: () => router.push(patientPath) }}
        actions={<EndSessionButton role="clinician" />}
      />
      <main className="mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-8">
        <h1 className="font-display text-[26px] leading-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
          {t('intro')}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
          {t('consentNote')}
        </p>

        {resultCount !== null && (
          <div className="mt-4 rounded-[var(--radius-button)] border border-sage bg-sage-soft px-4 py-3 text-[14px] text-sage-deep">
            {t('resultImported', { count: resultCount })}
          </div>
        )}
        {importObs.isError && (
          <div className="mt-4 rounded-[var(--radius-button)] border border-amber-deep bg-amber-soft px-4 py-3 text-[14px] text-amber-deep">
            {t('importError')}
          </div>
        )}

        {/* Manual single add */}
        <section className={`mt-6 ${cardClass}`}>
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {t('manualHeading')}
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>{t('fieldCode')}</label>
              <input
                value={mCode}
                onChange={(e) => setMCode(e.target.value)}
                placeholder="55423-8"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('fieldDisplay')}</label>
              <input
                value={mDisplay}
                onChange={(e) => setMDisplay(e.target.value)}
                placeholder={t('fieldDisplayPlaceholder')}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('fieldValue')}</label>
              <input
                value={mValue}
                onChange={(e) => setMValue(e.target.value)}
                inputMode="decimal"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('fieldUnit')}</label>
              <input
                value={mUnit}
                onChange={(e) => setMUnit(e.target.value)}
                placeholder="steps"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('fieldTime')}</label>
              <input
                type="datetime-local"
                value={mTime}
                onChange={(e) => setMTime(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('fieldSource')}</label>
              <select
                value={mSource}
                onChange={(e) => setMSource(e.target.value as ObservationSource)}
                className={inputClass}
              >
                {SOURCE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {t(`sources.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>{t('fieldDevice')}</label>
              <input
                value={mDevice}
                onChange={(e) => setMDevice(e.target.value)}
                placeholder="Garmin Vivoactive 4"
                className={inputClass}
              />
            </div>
          </div>
          <button
            type="button"
            onClick={onAddManual}
            disabled={!canAddManual || importObs.isPending}
            className={`mt-3 ${btnPrimary}`}
          >
            {t('addButton')}
          </button>
        </section>

        {/* CSV import — advanced, collapsed by default so the page doesn't
            open with a technical wall; the simple manual add leads instead. */}
        <details className="mt-6">
          <summary className="cursor-pointer list-none font-display text-[16px] leading-tight text-sage-deep underline-offset-2 hover:underline">
            {t('csvHeading')}
          </summary>
          <section className={`mt-3 ${cardClass}`}>
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {t('csvHint')}
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onPickFile(e.target.files?.[0])}
            className="mt-3 block w-full text-[13px] text-ink-soft file:mr-3 file:rounded-[var(--radius-button)] file:border file:border-stone file:bg-cream file:px-3 file:py-1.5 file:text-[13px] file:font-semibold file:text-sage-deep"
          />
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            rows={5}
            placeholder={t('csvPlaceholder')}
            className={`${inputClass} mt-3 font-mono text-[12px]`}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              onClick={onImportCsv}
              disabled={importObs.isPending || csvText.trim().length === 0}
              className={btnPrimary}
            >
              {importObs.isPending ? t('importing') : t('importButton')}
            </button>
          </div>
          {parseErrors.length > 0 && (
            <div className="mt-3 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2">
              <p className={labelClass}>{t('skippedHeading')}</p>
              <ul className="mt-1 list-disc pl-5 text-[12px] text-ink-soft">
                {parseErrors.slice(0, 12).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
        </details>

        {/* Recent */}
        <section className="mt-6">
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {t('recentHeading')}
          </h2>
          {recent.isLoading ? (
            <SkeletonBlock height="h-24" className="mt-3" />
          ) : observations.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-muted">{t('empty')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream-soft">
              {observations.map((o) => (
                <li key={o.id} className="flex items-baseline justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-semibold text-ink">
                      {o.display || o.code}
                    </div>
                    <div className="text-[12px] text-ink-muted">
                      {fmtDateTime(o.effectiveTime)}
                      {o.deviceLabel ? ` · ${o.deviceLabel}` : ''}
                      {` · ${t(`sources.${o.source}`)}`}
                    </div>
                  </div>
                  <div className="shrink-0 text-[14px] font-semibold text-ink-soft">
                    {o.valueNumeric !== null
                      ? `${o.valueNumeric}${o.unit ? ` ${o.unit}` : ''}`
                      : o.valueText}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Research data export (REDCap) */}
        <section className={`mt-6 ${cardClass}`}>
          <h2 className="font-display text-[18px] leading-tight text-ink">
            {tExport('heading')}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            {tExport('intro')}
          </p>
          {exportRedcap.data && (
            <div className="mt-3 rounded-[var(--radius-button)] border border-sage bg-sage-soft px-4 py-3 text-[14px] text-sage-deep">
              {tExport('result', {
                patients: exportRedcap.data.patients,
                rows: exportRedcap.data.rows
              })}
            </div>
          )}
          {exportRedcap.isError && (
            <div className="mt-3 rounded-[var(--radius-button)] border border-amber-deep bg-amber-soft px-4 py-3 text-[14px] text-amber-deep">
              {tExport('error')}
            </div>
          )}
          <button
            type="button"
            onClick={() => exportRedcap.mutate()}
            disabled={exportRedcap.isPending}
            className={`mt-4 ${btnPrimary}`}
          >
            {exportRedcap.isPending ? tExport('working') : tExport('button')}
          </button>

          <p className="mt-6 text-[14px] leading-relaxed text-ink-soft">
            {tExport('syncIntro')}
          </p>
          {syncRedcap.data && (
            <div className="mt-3 rounded-[var(--radius-button)] border border-sage bg-sage-soft px-4 py-3 text-[14px] text-sage-deep">
              {tExport('syncResult', {
                patients: syncRedcap.data.patients,
                rows: syncRedcap.data.rows
              })}
            </div>
          )}
          {syncRedcap.isError && (
            <div className="mt-3 rounded-[var(--radius-button)] border border-amber-deep bg-amber-soft px-4 py-3 text-[14px] text-amber-deep">
              {tExport('syncError', { message: (syncRedcap.error as Error).message })}
            </div>
          )}
          <button
            type="button"
            onClick={() => syncRedcap.mutate()}
            disabled={syncRedcap.isPending}
            className={`mt-4 ${btnPrimary}`}
          >
            {syncRedcap.isPending ? tExport('syncWorking') : tExport('syncButton')}
          </button>
        </section>
      </main>
    </div>
  );
}
