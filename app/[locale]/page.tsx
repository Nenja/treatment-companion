'use client';

import { useTranslations } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { weekOfCycle, addDaysIso } from '@/lib/dates';
import { AppShell } from '@/components/layout/AppShell';
import { SafetyNotice } from '@/components/layout/SafetyNotice';
import { GoalCard } from '@/components/cards/GoalCard';
import { CheckinPromptCard } from '@/components/cards/CheckinPromptCard';
import { Card } from '@/components/cards/Card';

export default function PatientHomePage() {
  const t = useTranslations('patient.home');
  const state = useStore();

  if (state.currentRole === 'clinician') {
    return (
      <AppShell>
        <Card tone="muted">
          <p className="font-display text-[18px] text-ink">
            Clinician view arrives in slice 5.
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Switch the role back to Patient in the dev panel to see this
            slice.
          </p>
        </Card>
      </AppShell>
    );
  }

  const patient = state.patients.find((p) => p.id === state.currentPatientId);
  if (!patient) {
    return (
      <AppShell>
        <Card tone="muted">
          <p>No patient selected.</p>
        </Card>
      </AppShell>
    );
  }

  const cycle = state.treatmentCycles.find(
    (c) => c.id === patient.activeTreatmentCycleId
  );
  if (!cycle) {
    return (
      <AppShell>
        <Card tone="muted">
          <p>No active treatment cycle for this patient.</p>
        </Card>
      </AppShell>
    );
  }

  const weekNumber = weekOfCycle(cycle.startDate, state.now);

  const approvedGoals = state.approvedGoals
    .filter(
      (g) =>
        g.patientId === patient.id &&
        g.treatmentCycleId === cycle.id &&
        g.status === 'active'
    )
    .sort((a, b) => a.approvedAt.localeCompare(b.approvedAt));

  const cyclePrompts = state.weeklyPrompts.filter(
    (p) => p.treatmentCycleId === cycle.id
  );
  const pendingPrompt = cyclePrompts
    .filter((p) => p.status === 'pending')
    .sort((a, b) => b.weekNumber - a.weekNumber)[0];

  const completedCheckinsCount = state.weeklyCheckins.filter(
    (c) => c.treatmentCycleId === cycle.id
  ).length;

  const suggestionsAwaitingReview = state.goalSuggestions.filter(
    (s) =>
      s.patientId === patient.id &&
      s.treatmentCycleId === cycle.id &&
      s.status === 'needsReview'
  );

  const nextDueDate = pendingPrompt
    ? undefined
    : addDaysIso(cycle.startDate, weekNumber * 7);

  return (
    <AppShell>
      <div className="eyebrow mb-2">
        {t('cycleContext', { cycle: cycle.cycleNumber, week: weekNumber })}
      </div>

      <h1 className="font-display text-[30px] leading-tight text-ink">
        {t('greeting', { name: patient.displayName })}
      </h1>

      <div className="mt-6">
        <CheckinPromptCard
          pendingPromptId={pendingPrompt?.id}
          nextDueDate={nextDueDate}
          patientId={patient.id}
        />
      </div>

      <p className="mt-3 text-[13px] text-ink-muted">
        {t('checkinsThisCycle', { count: completedCheckinsCount })}
      </p>

      <section className="mt-9" aria-labelledby="goals-heading">
        <h2
          id="goals-heading"
          className="font-display text-[22px] leading-tight text-ink"
        >
          {t('yourGoals')}
        </h2>

        {approvedGoals.length === 0 ? (
          <div className="mt-4">
            <Card tone="muted">
              <p className="font-display text-[18px] text-ink">
                {t('noActiveGoalsTitle')}
              </p>
              <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
                {suggestionsAwaitingReview.length > 0
                  ? t('noActiveGoalsBody')
                  : t('noSuggestionsBody')}
              </p>
            </Card>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {approvedGoals.map((g) => (
              <li key={g.id}>
                <GoalCard goal={g} reviewDate={cycle.reviewDate} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {suggestionsAwaitingReview.length > 0 && (
        <section className="mt-6" aria-labelledby="suggested-heading">
          <Card tone="note">
            <div
              id="suggested-heading"
              className="font-display text-[16px] text-ink"
            >
              {t('suggestedGoalsTitle')}
            </div>
            <p className="mt-1 text-[14px] text-ink-soft">
              {t('suggestedGoalsCount', {
                count: suggestionsAwaitingReview.length
              })}
            </p>
          </Card>
        </section>
      )}

      <button
        type="button"
        onClick={() =>
          actions.log({
            actorId: patient.id,
            actorRole: 'patient',
            action: 'suggest_goal_started',
            entity: 'patient',
            entityId: patient.id
          })
        }
        className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] border border-sage/40 bg-cream-soft px-5 text-[15px] font-semibold text-sage-deep hover:bg-sage-soft"
      >
        <span aria-hidden className="mr-2 text-[18px] leading-none">
          +
        </span>
        {t('suggestGoal')}
      </button>

      <div className="mt-10">
        <SafetyNotice />
      </div>
    </AppShell>
  );
}
