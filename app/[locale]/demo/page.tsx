'use client';

import { useMemo, useState } from 'react';
import { GoalProgressView } from '@/components/clinician/GoalProgressView';
import { TrainingOverview } from '@/components/clinician/TrainingOverview';
import { GoalRatingPicker } from '@/components/wizard/GoalRatingPicker';
import { GasGoalRatingPicker } from '@/components/wizard/GasGoalRatingPicker';
import { DEMO_SCENARIOS } from '@/lib/demo/fixtures';

/**
 * No-auth demo sandbox. Renders the real presentational components with
 * made-up data so anyone can click through scenarios without logging in or
 * touching Supabase. Gated by NEXT_PUBLIC_ENABLE_DEMO so it only appears
 * where you want it (it has no real data, so it's safe to expose, but it
 * stays off by default).
 */
export default function DemoPage() {
  const enabled = process.env.NEXT_PUBLIC_ENABLE_DEMO === '1';
  const [scenarioId, setScenarioId] = useState(DEMO_SCENARIOS[0].id);
  const [view, setView] = useState<'progress' | 'checkin'>('progress');
  // Picker answers in the check-in view, keyed by scenario+goal so each
  // scenario keeps its own (demo only — nothing is submitted).
  const [answers, setAnswers] = useState<Record<string, number>>({});

  const scenario = useMemo(
    () => DEMO_SCENARIOS.find((s) => s.id === scenarioId) ?? DEMO_SCENARIOS[0],
    [scenarioId]
  );

  const trainingByWeek = useMemo(() => {
    const m = new Map<number, { home: number[]; therapist: number[] }>();
    for (const t of scenario.training) {
      m.set(t.week, { home: t.home, therapist: t.therapist });
    }
    return m;
  }, [scenario]);

  if (!enabled) {
    return (
      <main className="mx-auto max-w-[600px] px-5 py-16">
        <h1 className="font-display text-[24px] text-ink">Demo disabled</h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          Set <code>NEXT_PUBLIC_ENABLE_DEMO=1</code> to enable the no-login demo
          sandbox at <code>/demo</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-[760px] px-5 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-[24px] leading-tight text-ink">
          Demo sandbox
        </h1>
        <span className="text-[12px] text-ink-muted">made-up data · no login</span>
      </div>

      {/* Scenario picker */}
      <div className="mt-4 flex flex-wrap gap-2">
        {DEMO_SCENARIOS.map((s) => {
          const active = s.id === scenario.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setScenarioId(s.id)}
              className={`rounded-[var(--radius-button)] border px-3 py-2 text-[14px] font-semibold ${
                active
                  ? 'border-sage-deep bg-sage-deep text-on-accent'
                  : 'border-stone bg-cream-soft text-ink-soft hover:bg-stone-soft'
              }`}
            >
              {s.title}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[13px] text-ink-muted">{scenario.blurb}</p>

      {/* View toggle */}
      <div className="mt-5 inline-flex rounded-[var(--radius-button)] border border-stone bg-cream-soft p-1">
        {(['progress', 'checkin'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`rounded-[calc(var(--radius-button)-2px)] px-3 py-1.5 text-[13px] font-semibold ${
              view === v ? 'bg-sage-deep text-on-accent' : 'text-ink-soft'
            }`}
          >
            {v === 'progress' ? 'Clinician view' : 'Patient check-in'}
          </button>
        ))}
      </div>

      {/* Patient context header */}
      <div className="mt-5 rounded-[var(--radius-card)] border border-stone bg-cream-soft px-4 py-3">
        <p className="font-display text-[18px] leading-tight text-ink">
          {scenario.patientName}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-muted">
          Cycle {scenario.cycleNumber} · Week {scenario.currentWeek}
        </p>
      </div>

      {view === 'progress' ? (
        <section className="mt-5 space-y-5">
          {/* Static "since last visit" note (read-only in the demo). */}
          <article className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <h2 className="font-display text-[16px] leading-tight text-ink">
              Since last visit
            </h2>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
              {scenario.visitNote}
            </p>
          </article>

          <TrainingOverview
            currentWeek={scenario.currentWeek}
            daysByWeek={trainingByWeek}
          />

          {scenario.goals.map((g) => (
            <div
              key={g.id}
              className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
            >
              <GoalProgressView
                goalText={g.goalText}
                kind={g.kind}
                currentWeek={scenario.currentWeek}
                ratings={g.ratings}
                physioRatings={g.physioRatings}
              />
            </div>
          ))}
        </section>
      ) : (
        <section className="mt-5 space-y-6">
          <p className="text-[13px] text-ink-muted">
            Try the weekly rating controls. This is a demo — nothing is saved.
          </p>
          {scenario.goals.map((g) => {
            const key = `${scenario.id}:${g.id}`;
            const set = (v: number) =>
              setAnswers((prev) => ({ ...prev, [key]: v }));
            return (
              <div
                key={g.id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4"
              >
                {g.kind === 'gas' ? (
                  <GasGoalRatingPicker
                    ariaLabel={g.goalText}
                    goalText={g.goalText}
                    anchors={g.anchors ?? null}
                    value={answers[key]}
                    onChange={set}
                  />
                ) : (
                  <GoalRatingPicker
                    ariaLabel={g.goalText}
                    goalText={g.goalText}
                    question={g.question ?? g.goalText}
                    direction={g.direction ?? 'higherIsBetter'}
                    value={answers[key]}
                    onChange={set}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
