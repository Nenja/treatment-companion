'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CockpitPanelDrawer } from './CockpitPanelDrawer';
import {
  useLibraryQuestionnaires,
  usePatientQuestionnaires,
  useAssignQuestionnaire,
  useSetAssignmentActive,
  usePatientQuestionnaireResponses,
  type ScheduleKind,
  type PatientQuestionnaire,
  type QuestionnaireResponseItem,
  type QuestionnaireResponseRecord
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
  // The library is tucked behind a toggle so it doesn't crowd the panel when
  // dense; it's only fetched once opened.
  const [libraryOpen, setLibraryOpen] = useState(false);
  const library = useLibraryQuestionnaires(langFilter, libraryOpen);
  const enabled = usePatientQuestionnaires(patientId);
  const assign = useAssignQuestionnaire();
  const setActive = useSetAssignmentActive(patientId);

  // Per-library-row chosen cadence (defaults to "every check-in").
  const [cadence, setCadence] = useState<Record<string, string>>({});
  // Per-library-row expand state — collapsed by default so a long library is
  // a scannable list of titles; expanding reveals details + the enable control.
  const [libOpen, setLibOpen] = useState<Record<string, boolean>>({});
  // Free-text filter over the library (title / description / key).
  const [librarySearch, setLibrarySearch] = useState('');
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

  const librarySearchLc = librarySearch.trim().toLowerCase();
  const libraryAll = library.data ?? [];
  const libraryRows = librarySearchLc
    ? libraryAll.filter(
        (q) =>
          q.title.toLowerCase().includes(librarySearchLc) ||
          (q.description ?? '').toLowerCase().includes(librarySearchLc) ||
          q.key.toLowerCase().includes(librarySearchLc)
      )
    : libraryAll;

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

      {/* Submitted responses for this patient */}
      <ResponsesSection patientId={patientId} />

      {/* Add from library — behind a toggle so a dense library doesn't crowd
          the panel; opening it also triggers the fetch. */}
      <div className="mt-6">
        <button
          type="button"
          onClick={() => setLibraryOpen((o) => !o)}
          aria-expanded={libraryOpen}
          className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft px-3 py-2.5 text-left transition-colors hover:bg-stone-soft"
        >
          <span className="text-[14px] font-semibold text-ink">
            {t('libraryToggle')}
          </span>
          <span
            aria-hidden
            className={`text-[13px] text-ink-muted transition-transform ${
              libraryOpen ? 'rotate-180' : ''
            }`}
          >
            ▾
          </span>
        </button>
        {libraryOpen && (
          <div className="mt-3">
            <label className="block text-[12px] text-ink-muted">
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
        <input
          type="search"
          value={librarySearch}
          onChange={(e) => setLibrarySearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('searchPlaceholder')}
          className="mt-2 w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[13px] text-ink"
        />
        {library.isLoading ? (
          <p className="mt-2 text-[13px] text-ink-muted">{t('loading')}</p>
        ) : libraryAll.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">{t('libraryEmpty')}</p>
        ) : libraryRows.length === 0 ? (
          <p className="mt-2 text-[13px] text-ink-muted">{t('searchNoMatches')}</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {libraryRows.map((q) => {
              const alreadyOn = enabledList.some(
                (e) => e.questionnaire_key === q.key && e.active && e.source === 'patient'
              );
              const isOpen = libOpen[q.key] ?? false;
              return (
                <li
                  key={q.questionnaire_id}
                  className="rounded-[var(--radius-card)] border border-stone bg-cream p-3"
                >
                  <button
                    type="button"
                    onClick={() => setLibOpen((s) => ({ ...s, [q.key]: !isOpen }))}
                    aria-expanded={isOpen}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-ink">
                        {q.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-ink-muted">
                        {t('itemCount', { count: q.item_count })}
                        {` · ${q.lang.toUpperCase()}`}
                        {alreadyOn && ` · ${t('enabledBadge')}`}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={`shrink-0 text-[13px] text-ink-muted transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    >
                      ▾
                    </span>
                  </button>
                  {isOpen && (
                    <div className="mt-2 border-t border-stone/60 pt-2">
                      {q.description && (
                        <p className="text-[12px] leading-relaxed text-ink-muted">
                          {q.description}
                        </p>
                      )}
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
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
          </div>
        )}
      </div>

      <p className="mt-6 text-[11px] leading-relaxed text-ink-muted">
        {t('footnote')}
      </p>
    </CockpitPanelDrawer>
  );
}

/** Human-readable answer for one item, mapping option values back to labels. */
function formatAnswer(
  item: QuestionnaireResponseItem,
  t: ReturnType<typeof useTranslations>
): string {
  const labelFor = (val: string) =>
    item.options?.find((o) => o.value === val)?.label ?? val;
  switch (item.item_type) {
    case 'boolean':
      if (item.value_num != null) return item.value_num === 1 ? t('answerYes') : t('answerNo');
      if (item.value_text === 'true') return t('answerYes');
      if (item.value_text === 'false') return t('answerNo');
      return item.value_text ?? '—';
    case 'nrs_0_10':
    case 'number':
      return item.value_num != null ? String(item.value_num) : (item.value_text ?? '—');
    case 'single_choice':
    case 'likert':
      return item.value_text ? labelFor(item.value_text) : '—';
    case 'multi_choice':
      if (!item.value_text) return '—';
      try {
        const arr = JSON.parse(item.value_text) as string[];
        return arr.length ? arr.map(labelFor).join(', ') : '—';
      } catch {
        return item.value_text;
      }
    case 'text':
    default:
      return item.value_text && item.value_text.trim() ? item.value_text : '—';
  }
}

/**
 * Read-only list of the patient's submitted questionnaire responses, newest
 * first; each expands to show the per-item answers. No score is shown.
 */
function ResponsesSection({ patientId }: { patientId: string }) {
  const t = useTranslations('clinician.questionnaires');
  const responses = usePatientQuestionnaireResponses(patientId);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const list = responses.data ?? [];

  const filledByLabel = (who: QuestionnaireResponseRecord['filled_by']) => {
    switch (who) {
      case 'caregiver':
        return t('filledCaregiver');
      case 'clinician':
        return t('filledClinician');
      case 'therapist':
        return t('filledTherapist');
      default:
        return t('filledSelf');
    }
  };

  return (
    <div className="mt-6">
      <h3 className="eyebrow">{t('responsesHeading')}</h3>
      {responses.isLoading ? (
        <p className="mt-2 text-[13px] text-ink-muted">{t('responsesLoading')}</p>
      ) : responses.isError ? (
        <p className="mt-2 text-[13px] text-amber-deep">{t('responsesError')}</p>
      ) : list.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-muted">{t('responsesNone')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {list.map((r) => {
            const isOpen = open[r.response_id] ?? false;
            const when = (() => {
              try {
                return new Date(r.submitted_at).toLocaleDateString();
              } catch {
                return r.submitted_at;
              }
            })();
            return (
              <li
                key={r.response_id}
                className="rounded-[var(--radius-card)] border border-stone bg-cream p-3"
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpen((s) => ({ ...s, [r.response_id]: !isOpen }))
                  }
                  aria-expanded={isOpen}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-ink">
                      {r.questionnaire_title}
                    </span>
                    <span className="mt-0.5 block text-[12px] text-ink-muted">
                      {when}
                      {r.week_number != null && ` · ${t('respWeek', { week: r.week_number })}`}
                      {` · ${filledByLabel(r.filled_by)}`}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`shrink-0 text-[13px] text-ink-muted transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  >
                    ▾
                  </span>
                </button>
                {isOpen && (
                  <dl className="mt-3 space-y-2 border-t border-stone/60 pt-3">
                    {r.items.map((item) => (
                      <div key={item.item_key}>
                        <dt className="text-[12px] text-ink-muted">{item.prompt}</dt>
                        <dd className="mt-0.5 whitespace-pre-wrap text-[14px] text-ink">
                          {formatAnswer(item, t)}
                        </dd>
                      </div>
                    ))}
                    {r.items.length === 0 && (
                      <p className="text-[13px] text-ink-muted">{t('respNoItems')}</p>
                    )}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
