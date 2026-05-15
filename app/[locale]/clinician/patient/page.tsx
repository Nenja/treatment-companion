'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { weekOfCycle, formatLongDate } from '@/lib/dates';
import { useSessionTimeout } from '@/lib/useSessionTimeout';

export default function ClinicianPatientPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('clinician.patient');
  const tSession = useTranslations('clinician.session');
  const tDomain = useTranslations('domain');
  const tImportance = useTranslations('importance');
  const state = useStore();

  const session = state.clinicianSession;
  const [confirmEnd, setConfirmEnd] = useState(false);

  useSessionTimeout({
    onTimeout: () => {
      actions.endClinicianSession();
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  });

  // If no session, kick back to the unlock page.
  useEffect(() => {
    if (!session) {
      router.replace(
        locale === 'en' ? '/clinician' : `/${locale}/clinician`
      );
    }
  }, [session, router, locale]);

  if (!session) return null;

  const patient = state.patients.find((p) => p.id === session.patientId);
  if (!patient) return null;

  const cycle = state.treatmentCycles.find(
    (c) => c.id === patient.activeTreatmentCycleId
  );
  if (!cycle) return null;

  const weekNumber = weekOfCycle(cycle.startDate, state.now);
  const totalWeeks = cycle.lengthWeeks ?? 12;

  const suggestions = state.goalSuggestions
    .filter(
      (g) =>
        g.patientId === patient.id &&
        g.treatmentCycleId === cycle.id &&
        g.status === 'needsReview'
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const activeGoals = state.approvedGoals
    .filter(
      (g) =>
        g.patientId === patient.id &&
        g.treatmentCycleId === cycle.id &&
        g.status === 'active'
    )
    .sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));

  const endSession = () => {
    actions.endClinicianSession();
    router.replace(locale === 'en' ? '/clinician' : `/${locale}/clinician`);
  };

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between px-5 py-4">
          <div>
            <div className="eyebrow">{t('viewingLabel')}</div>
            <div className="font-display text-[20px] leading-tight text-ink">
              {patient.displayName}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConfirmEnd(true)}
            className="text-[13px] font-semibold text-ink-soft hover:text-ink"
          >
            {tSession('endSession')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 pb-16 pt-6">
        <div className="eyebrow">
          {t('cycleContext', {
            cycle: cycle.cycleNumber,
            week: weekNumber,
            total: totalWeeks
          })}
        </div>
        <p className="mt-1 text-[15px] text-ink-soft">
          {t('nextVisit', { date: formatLongDate(cycle.reviewDate, locale) })}
        </p>

        {/* Suggestions awaiting review */}
        <section className="mt-9">
          <h2 className="font-display text-[20px] leading-tight text-ink">
            {t('suggestionsTitle')}
          </h2>
          {suggestions.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-muted">
              {t('suggestionsEmpty')}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="eyebrow text-ink-muted">
                      {tDomain(s.domain)} · {tImportance(s.importance)}
                    </div>
                  </div>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-ink">
                    "{s.patientWording}"
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      router.push(
                        locale === 'en'
                          ? `/clinician/suggestion?id=${s.id}`
                          : `/${locale}/clinician/suggestion?id=${s.id}`
                      )
                    }
                    className="mt-3 flex h-10 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-cream-soft hover:bg-ink-soft"
                  >
                    {t('review')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Active goals */}
        <section className="mt-10">
          <h2 className="font-display text-[20px] leading-tight text-ink">
            {t('activeGoalsTitle')}
          </h2>
          {activeGoals.length === 0 ? (
            <p className="mt-3 text-[14px] text-ink-muted">
              {t('activeGoalsEmpty')}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {activeGoals.map((g) => (
                <li
                  key={g.id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
                >
                  <p className="font-display text-[17px] leading-snug text-ink">
                    {g.patientFacingText}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-muted">
                    SMART: {g.smartText}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {confirmEnd && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center">
          <div className="w-full max-w-[400px] rounded-[var(--radius-card)] border border-stone bg-cream p-6 shadow-xl">
            <h2 className="font-display text-[20px] text-ink">
              {tSession('endSessionConfirm')}
            </h2>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setConfirmEnd(false)}
                className="flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-cream-soft hover:bg-ink-soft"
              >
                {tSession('endSessionConfirmKeep')}
              </button>
              <button
                type="button"
                onClick={endSession}
                className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                {tSession('endSessionConfirmEnd')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
