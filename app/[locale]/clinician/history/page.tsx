'use client';

import { useEffect, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import { useAuth } from '@/lib/supabase/auth';
import { useCurrentClinicianSession } from '@/lib/supabase/clinicianSession';
import {
  usePatientHistory,
  type HistoryCycle,
  type HistoryGoal,
  type HistoryRater
} from '@/lib/supabase/patientHistory';
import { GoalSparkline } from '@/components/clinician/GoalSparkline';
import { SkeletonScreen, SkeletonBlock } from '@/components/feedback/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';

import { useWideLayout } from '@/lib/useWideLayout';
import { EndSessionButton } from '@/components/clinician/EndSessionButton';
import { isSessionEndingDeliberately } from '@/lib/sessionEndSignal';

type T = ReturnType<typeof useTranslations>;
const SIDE_ABBR: Record<string, string> = { left: 'L', right: 'R', bilateral: 'L+R' };
const sign = (v: number | null | undefined) => (v == null ? '—' : v > 0 ? `+${v}` : `${v}`);

/**
 * Longitudinal clinical record — physician only. For each cycle: the
 * injection, how each goal responded (patient / clinician / physiotherapist)
 * with its trajectory and benefit duration, a symptom summary, side-effect
 * flag, notes, and time to next treatment. The cross-cycle numbers sit in a
 * summary strip on top. Reads only from usePatientHistory.
 */
export default function ClinicianHistoryPage() {
  const router = useRouter();
  const locale = useLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const t = useTranslations('clinician.history');
  const tEt = useTranslations('etiology');
  const { profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(profile?.id ?? null, profile?.role ?? null);
  const patientId = sessionQuery.data?.patientId ?? null;
  const history = usePatientHistory(patientId);
  const wide = useWideLayout();

  const mainWidthClass = wide
    ? 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-8 lg:max-w-[var(--max-w-page-wide)]'
    : 'mx-auto max-w-[var(--max-w-page-narrow)] px-5 py-8';

  useEffect(() => {
    if (authLoading) return;
    if (!profile) { router.replace(prefix ? `${prefix}/login` : '/login'); return; }
    if (profile.role !== 'clinician') router.replace(prefix ? `${prefix}/` : '/');
  }, [authLoading, profile, router, prefix]);

  useEffect(() => {
    if (sessionQuery.status === 'success' && sessionQuery.data === null) {
      if (isSessionEndingDeliberately()) return;
      router.replace(prefix ? `${prefix}/clinician` : '/clinician');
    }
  }, [sessionQuery.status, sessionQuery.data, router, prefix]);

  if (sessionQuery.isError || history.isError) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-cream">
        <ErrorState onRetry={() => { sessionQuery.refetch(); history.refetch(); }} />
      </div>
    );
  }

  if (authLoading || !profile || profile.role !== 'clinician' || sessionQuery.isLoading || !sessionQuery.data) {
    return (
      <SkeletonScreen>
        <SkeletonBlock width="w-2/3" height="h-8" />
        <SkeletonBlock height="h-40" className="mt-6" />
        <SkeletonBlock height="h-40" className="mt-6" />
      </SkeletonScreen>
    );
  }

  const patientPath = prefix ? `${prefix}/clinician/patient` : '/clinician/patient';
  const cycles = history.data?.cycles ?? [];

  const isCurrent = (c: HistoryCycle) => c.status === 'active';

  const goalsSummary = (c: HistoryCycle) => {
    if (c.goals.length === 0) return <span className="text-ink-muted">—</span>;
    const a = c.goals.filter((g) => g.outcome === 'achieved').length;
    const p = c.goals.filter((g) => g.outcome === 'partial').length;
    const ongoing = c.goals.filter((g) => g.outcome === null).length;
    return (
      <span className="inline-flex flex-wrap gap-1">
        {a > 0 && <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-bold text-sage-deep">{a} {t('outcomeAchievedShort')}</span>}
        {p > 0 && <span className="rounded-full bg-amber-soft/50 px-2 py-0.5 text-[11px] font-bold text-amber-deep">{p} {t('outcomePartialShort')}</span>}
        {ongoing > 0 && <span className="rounded-full border border-stone px-2 py-0.5 text-[11px] text-ink-soft">{ongoing} {t('outcomeOngoingShort')}</span>}
      </span>
    );
  };

  const benefitSummary = (c: HistoryCycle) => {
    if (isCurrent(c)) return <span className="text-ink-muted">{t('inProgress')}</span>;
    const held = c.goals.some((g) => g.benefitHeld);
    const fades = c.goals.map((g) => g.fadeWeek).filter((w): w is number => w != null);
    if (held && fades.length === 0) return <span className="rounded-full bg-sage-soft px-2 py-0.5 text-[11px] font-bold text-sage-deep">{t('benefitHeldShort')}</span>;
    if (fades.length) return <span className="rounded-full border border-stone bg-stone-soft px-2 py-0.5 text-[11px] text-ink-soft">{t('fadedWk', { week: Math.min(...fades) })}</span>;
    return <span className="text-ink-muted">—</span>;
  };

  return (
    <div className="min-h-dvh bg-cream">
      <AppHeader width="narrowToWide" back={{ label: t('back'), onClick: () => router.push(patientPath) }} actions={<EndSessionButton role="clinician" />} helpPageKey="history" />
      <main className={mainWidthClass}>
        <h1 className="font-display text-[24px] leading-tight text-ink">{t('title')}</h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{t('subtitle')}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {history.data?.etiology && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sage-soft bg-sage-soft/40 px-3 py-1 text-[12.5px] text-ink-soft">
              {t('diagnosisLabel')}: <span className="font-semibold text-ink">{tEt(history.data.etiology)}</span>{history.data.etiologyDetail ? <span className="text-ink-muted"> · {history.data.etiologyDetail}</span> : null}
            </span>
          )}
          {history.data?.medCurrent && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-stone bg-cream-soft px-3 py-1 text-[12.5px] text-ink-soft">
              {t('medCurrent')}: <span className="font-semibold text-ink">{history.data.medCurrent}</span>
            </span>
          )}
          {!history.isLoading && cycles.length > 0 && (
            <span className="text-[13px] text-ink-muted">{t('totalCycles', { count: cycles.length })}</span>
          )}
        </div>

        {history.isLoading && <SkeletonBlock height="h-40" className="mt-6" />}

        {!history.isLoading && cycles.length === 0 && (
          <p className="mt-8 rounded-[var(--radius-card)] border border-dashed border-stone bg-cream-soft/60 p-5 text-[14px] leading-relaxed text-ink-soft">{t('noData')}</p>
        )}

        {!history.isLoading && cycles.length > 0 && (
          <>
            <section className="mt-7 overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream-soft">
              <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                <h2 className="font-display text-[16px] text-ink">{t('summaryHeading')}</h2>
                <span className="text-[12px] text-ink-muted">{t('summaryOrient')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="bg-stone-soft text-left text-[11px] uppercase tracking-wide text-ink-muted">
                      <th className="px-4 py-2 font-bold">{t('cycleShort')}</th>
                      <th className="px-4 py-2 font-bold">{t('colStart')}</th>
                      <th className="px-4 py-2 font-bold">{t('colUnits')}</th>
                      <th className="px-4 py-2 font-bold">{t('colGoals')}</th>
                      <th className="px-4 py-2 font-bold">{t('colBenefit')}</th>
                      <th className="px-4 py-2 font-bold">{t('colInterval')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cycles.map((c) => (
                      <tr key={c.id} className="border-t border-stone">
                        <td className="px-4 py-2.5 font-semibold text-ink">{c.cycleNumber}{isCurrent(c) && <span className="ml-1 font-normal text-ink-muted">({t('currentLower')})</span>}</td>
                        <td className="px-4 py-2.5 text-ink-soft">{formatLongDate(c.startDate, locale)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink">{c.totalUnits != null ? `${c.totalUnits} U` : '—'}</td>
                        <td className="px-4 py-2.5">{goalsSummary(c)}</td>
                        <td className="px-4 py-2.5">{benefitSummary(c)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-ink-soft">{c.weeksToNext != null ? t('weeksN', { weeks: c.weeksToNext }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="mt-8 mb-3 flex items-baseline gap-2.5">
              <h2 className="font-display text-[20px] text-ink">{t('cycleByCycle')}</h2>
              <span className="text-[12.5px] text-ink-muted">{t('mostRecentFirst')}</span>
            </div>
            <div className="space-y-4">
              {cycles.map((c, i) => <CycleCard key={c.id} c={c} defaultOpen={i === 0} t={t} locale={locale} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function CycleCard({ c, defaultOpen, t, locale }: { c: HistoryCycle; defaultOpen: boolean; t: T; locale: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const current = c.status === 'active';
  return (
    <section className={`overflow-hidden rounded-[var(--radius-card)] border bg-cream-soft ${current ? 'border-sage' : 'border-stone'}`}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 text-left hover:bg-cream">
        <div>
          <div className="font-display text-[18px] text-ink">{t('cycleShort')} {c.cycleNumber}</div>
          <div className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1 text-[13px] text-ink-soft">
            <span>{formatLongDate(c.startDate, locale)}</span>
            {c.drugProduct && <span className="text-ink">{c.drugProduct}</span>}
            {c.totalUnits != null && <span className="font-semibold tabular-nums text-ink">{c.totalUnits} U</span>}
            {c.dilution && <span>{c.dilution}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {current ? (
            <span className="rounded-full border border-stone bg-cream px-2.5 py-1 text-[12px] font-semibold text-ink-soft">{t('currentCycleTag')}</span>
          ) : c.weeksToNext != null ? (
            <span className="rounded-full bg-sage-soft px-2.5 py-1 text-[12px] font-semibold text-sage-deep">{t('nextAfter', { weeks: c.weeksToNext })}</span>
          ) : null}
          <span aria-hidden className={`text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-stone px-5 pb-5 pt-1">
          <div className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{t('injectionHeading')}</div>
          {c.injections.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{t('noInjections')}</p>
          ) : (
            <div className="grid gap-x-7 gap-y-1 sm:grid-cols-2">
              {c.injections.map((inj, i) => (
                <div key={i} className="flex items-baseline gap-2 border-b border-dotted border-stone py-1 text-[13.5px]">
                  <span className="w-9 text-[11px] font-bold text-ink-muted">{inj.side ? (SIDE_ABBR[inj.side] ?? inj.side) : ''}</span>
                  <span className="flex-1 text-ink">{inj.muscle}</span>
                  <span className="font-semibold tabular-nums text-ink">{inj.doseUnits} U</span>
                </div>
              ))}
            </div>
          )}

          <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{t('goalsHeading')}</div>
          {c.goals.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{t('noGoalsCycle')}</p>
          ) : (
            <div className="divide-y divide-stone">{c.goals.map((g) => <GoalRow key={g.id} g={g} t={t} />)}</div>
          )}

          <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{t('symptomHeading')}</div>
          <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[13px]">
            {c.symptoms.painFirst != null && <span className="text-ink-soft">{t('painLabel')} <b className="tabular-nums text-ink">{c.symptoms.painFirst}→{c.symptoms.painLast}</b></span>}
            {c.symptoms.stiffFirst != null && <span className="text-ink-soft">{t('stiffnessLabel')} <b className="tabular-nums text-ink">{c.symptoms.stiffFirst}→{c.symptoms.stiffLast}</b></span>}
            {c.symptoms.painFirst == null && c.symptoms.stiffFirst == null && <span className="text-ink-muted">{t('noSymptoms')}</span>}
            {c.symptoms.sideEffectCount > 0 && <span className="font-semibold text-amber-deep">⚠ {t('sideEffectsFlag', { count: c.symptoms.sideEffectCount })}</span>}
          </div>

          {c.notes.length > 0 && (
            <>
              <div className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-ink-muted">{t('notesHeading')}</div>
              <div className="space-y-2">
                {c.notes.map((n, i) => <p key={i} className="border-l-2 border-sage pl-3 text-[13.5px] leading-relaxed text-ink">{n}</p>)}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function GoalRow({ g, t }: { g: HistoryGoal; t: T }) {
  const outcomeLabel =
    g.outcome === 'achieved' ? t('outcomeAchieved')
      : g.outcome === 'partial' ? t('outcomePartial')
        : g.outcome === 'noLongerSuitable' ? t('outcomeNoLongerSuitable')
          : null;
  const rater = (r: HistoryRater) => (g.kind === 'nrs' && r.nrs != null ? `NRS ${r.nrs}` : sign(r.gas));
  return (
    <div className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="max-w-[58ch] font-display text-[15.5px] text-ink">{g.text}</span>
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-ink-muted">{g.kind === 'gas' ? t('goalKindGas') : t('goalKindNrs')}</span>
      </div>
      {g.points.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <GoalSparkline points={g.points} peakWeek={g.peakWeek} fadeWeek={g.fadeWeek} />
          <span className="text-[12px] text-ink-soft">
            {g.peakGas != null && g.peakWeek != null && t('peakAt', { value: sign(g.peakGas), week: g.peakWeek })}
            {g.benefitHeld ? ` · ${t('benefitHeldShort')}` : g.fadeWeek != null ? ` · ${t('fadedWk', { week: g.fadeWeek })}` : ''}
            {outcomeLabel ? ` · ${outcomeLabel}` : ''}
          </span>
        </div>
      )}
      {(g.patientLatest || g.clinicianLatest || g.physioLatest) && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] text-ink-muted">
          {g.patientLatest && <span>{t('raterPatient')} <b className="text-sage-deep">{rater(g.patientLatest)}</b></span>}
          {g.clinicianLatest && <span>{t('raterClinician')} <b className="text-sage-deep">{rater(g.clinicianLatest)}</b></span>}
          {g.physioLatest && <span>{t('raterPhysio')} <b className="text-sage-deep">{rater(g.physioLatest)}</b></span>}
        </div>
      )}
    </div>
  );
}
