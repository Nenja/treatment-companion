'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CockpitPanelDrawer } from './CockpitPanelDrawer';
import {
  useLibraryQuestionnaires,
  usePatientQuestionnaires,
  useAssignQuestionnaire,
  useSetAssignmentActive,
  type ScheduleKind,
  type PatientQuestionnaire
} from '@/lib/supabase/questionnaires';

/**
 * Clinician "Questionnaire" tool panel.
 *
 * Lets a clinician (with an active session for this patient) enable PUBLISHED
 * questionnaires from the admin-curated library, choosing how often the patient
 * is asked, and stop/restart what's already enabled. Study-level assignments
 * show read-only here (managed by the study). Admin-only operations (creating
 * questionnaires, publishing to the library) live elsewhere.
 *
 * Raw capture only — this panel never shows or computes a score.
 */

type CadencePreset = { value: string; kind: ScheduleKind; n: number | null };

const CADENCES: CadencePreset[] = [
  { value: 'every_checkin', kind: 'every_checkin', n: null },
  { value: 'every_2', kind: 'every_n_checkins', n: 2 },
  { value: 'monthly', kind: 'monthly', n: null },
  { value: 'first_of_cycle', kind: 'first_of_cycle', n: null },
  { value: 'baseline', kind: 'baseline', n: null }
];

const LANGS: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'da', name: 'Dansk' },
  { code: 'sv', name: 'Svenska' },
  { code: 'nb', name: 'Norsk' }
];

export function QuestionnairePanel({
  patientId,
  onClose
}: {
  patientId: string;
  onClose: () => void;
}) {
  const t = useTranslations('clinician.questionnaires');
  const [langFilter, setLangFilter] = useState<string | null>(null);
  const library = useLibraryQuestionnaires(langFilter);
  const enabled = usePatientQuestionnaires(patientId);
  const assign = useAssignQuestionnaire();
  const setActive = useSetAssignmentActive(patientId);

  // Per-library-row chosen cadence (defaults to "every check-in").
  const [cadence, setCadence] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  function cadenceLabel(q: Pick<PatientQuestionnaire, 'schedule_kind' | 'schedule_n'>) {
    switch (q.schedule_kind) {
      case 'every_checkin':
        return t('cadenceEvery');
      case 'every_n_checkins':
        return t('cadenceEveryN', { n: q.schedule_n ?? 2 });
      case 'monthly':
        return t('cadenceMonthly');
      case 'first_of_cycle':
        return t('cadenceFirstOfCycle');
      case 'baseline':
        return t('cadenceBaseline');
      case 'specific_weeks':
        return t('cadenceSpecificWeeks');
      default:
        return '';
    }
  }

  async function onEnable(key: string) {
    setError(null);
    const presetValue = cadence[key] ?? 'every_checkin';
    const preset = CADENCES.find((c) => c.value === presetValue) ?? CADENCES[0];
    try {
      await assign.mutateAsync({
        patientId,
        questionnaireKey: key,
        scheduleKind: preset.kind,
        scheduleN: preset.n
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onToggle(assignmentId: string, active: boolean) {
    setError(null);
    try {
      await setActive.mutateAsync({ assignmentId, active });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const enabledList = enabled.data ?? [];

  return (
    <CockpitPanelDrawer onClose={onClose}>
      <h2 className="font-display text-[18px] leading-tight text-ink">
        {t('title')}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        {t('intro')}
      </p>

      {error && (
        <p className="mt-3 rounded-[var(--radius-card)] border border-amber-deep/40 bg-amber-soft/40 p-2 text-[12px] text-ink">
          {error}
        </p>
      )}

      {/* Currently enabled for this patient */}
      <div className="mt-5">
        <h3 className="eyebrow">{t('enabledHeading')}</h3>
        {enabled.isLoading ? (
          <p className="mt-2 text-[13px] text-ink-muted">{t('loading')}</p>
        ) : enabledList.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">{t('noneEnabled')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {enabledList.map((q) => (
              <li
                key={q.assignment_id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[14px] font-semibold text-ink">
                      {q.title ?? q.questionnaire_key}
                    </p>
                    <p className="mt-0.5 text-[12px] text-ink-muted">
                      {cadenceLabel(q)}
                      {q.lang && ` · ${q.lang.toUpperCase()}`}
                      {!q.active && ` · ${t('stopped')}`}
                    </p>
                  </div>
                  {q.source === 'study' ? (
                    <span className="shrink-0 rounded-full border border-stone bg-stone-soft px-2 py-0.5 text-[11px] text-ink-soft">
                      {t('studyManaged')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onToggle(q.assignment_id, !q.active)}
                      disabled={setActive.isPending}
                      className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-stone-soft disabled:opacity-50"
                    >
                      {q.active ? t('stop') : t('restart')}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add from library */}
      <div className="mt-6">
        <h3 className="eyebrow">{t('libraryHeading')}</h3>
        <label className="mt-2 block text-[12px] text-ink-muted">
          {t('languageFilter')}{' '}
          <select
            value={langFilter ?? ''}
            onChange={(e) => setLangFilter(e.target.value || null)}
            aria-label={t('languageFilter')}
            className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-2 py-1 text-[12px] text-ink"
          >
            <option value="">{t('allLanguages')}</option>
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        {library.isLoading ? (
          <p className="mt-2 text-[13px] text-ink-muted">{t('loading')}</p>
        ) : (library.data ?? []).length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">{t('libraryEmpty')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {(library.data ?? []).map((q) => {
              const alreadyOn = enabledList.some(
                (e) => e.questionnaire_key === q.key && e.active && e.source === 'patient'
              );
              return (
                <li
                  key={q.questionnaire_id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream p-3"
                >
                  <p className="text-[14px] font-semibold text-ink">{q.title}</p>
                  {q.description && (
                    <p className="mt-0.5 text-[12px] leading-relaxed text-ink-muted">
                      {q.description}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-ink-muted">
                    {t('itemCount', { count: q.item_count })}
                    {` · ${q.lang.toUpperCase()}`}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`cadence-${q.key}`}>
                      {t('cadenceLabel')}
                    </label>
                    <select
                      id={`cadence-${q.key}`}
                      value={cadence[q.key] ?? 'every_checkin'}
                      onChange={(ev) =>
                        setCadence((c) => ({ ...c, [q.key]: ev.target.value }))
                      }
                      className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-2 py-1.5 text-[12px] text-ink"
                    >
                      {CADENCES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.value === 'every_checkin'
                            ? t('cadenceEvery')
                            : c.value === 'every_2'
                              ? t('cadenceEveryN', { n: 2 })
                              : c.value === 'monthly'
                                ? t('cadenceMonthly')
                                : c.value === 'first_of_cycle'
                                  ? t('cadenceFirstOfCycle')
                                  : t('cadenceBaseline')}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => onEnable(q.key)}
                      disabled={assign.isPending || alreadyOn}
                      className="rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-3 py-1.5 text-[12px] font-semibold text-on-accent transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {alreadyOn ? t('enabledBadge') : t('enable')}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-ink-muted">
        {t('footnote')}
      </p>
    </CockpitPanelDrawer>
  );
}
