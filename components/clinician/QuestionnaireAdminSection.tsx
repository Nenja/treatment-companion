'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useAdminQuestionnaires,
  useCreateQuestionnaire,
  useSetLibraryVisibility,
  type ItemType,
  type CreateQuestionnaireItemInput
} from '@/lib/supabase/questionnaires';

/**
 * Admin tool: create questionnaires (definition + items) and publish/unpublish
 * them to the clinician library. Admin-only (mirrors the other admin sections).
 *
 * Raw capture only — no scoring is defined here. Named/validated instruments
 * must have their licence + validated translation cleared before publishing;
 * the `licensed` flag + source note record that, but clearance is an external
 * gate, not enforced in code.
 */

const ITEM_TYPES: ItemType[] = [
  'nrs_0_10',
  'number',
  'text',
  'boolean',
  'single_choice',
  'multi_choice',
  'likert'
];

const CHOICE_TYPES: ItemType[] = ['single_choice', 'multi_choice', 'likert'];

const LANGS: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'da', name: 'Dansk' },
  { code: 'sv', name: 'Svenska' },
  { code: 'nb', name: 'Norsk' }
];

interface ItemDraft {
  uid: string;
  prompt: string;
  type: ItemType;
  required: boolean;
  optionsText: string;
  min: string;
  max: string;
}

function newDraft(): ItemDraft {
  return {
    uid: Math.random().toString(36).slice(2),
    prompt: '',
    type: 'nrs_0_10',
    required: true,
    optionsText: '',
    min: '',
    max: ''
  };
}

function parseOptions(text: string): { value: string; label: string }[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf('|');
      if (idx === -1) return { value: line, label: line };
      const value = line.slice(0, idx).trim();
      const label = line.slice(idx + 1).trim();
      return { value: value || label, label: label || value };
    });
}

export function QuestionnaireAdminSection({
  enabled,
  embedded
}: {
  enabled: boolean;
  embedded?: boolean;
}) {
  const t = useTranslations('questionnaireAdmin');
  const list = useAdminQuestionnaires(enabled);
  const create = useCreateQuestionnaire();
  const setVisibility = useSetLibraryVisibility();

  const [key, setKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [licensed, setLicensed] = useState(false);
  const [sourceNote, setSourceNote] = useState('');
  const [publish, setPublish] = useState(true);
  const [lang, setLang] = useState('en');
  const [items, setItems] = useState<ItemDraft[]>([newDraft()]);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  function patchItem(uid: string, patch: Partial<ItemDraft>) {
    setItems((arr) => arr.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  }

  function resetForm() {
    setKey('');
    setTitle('');
    setDescription('');
    setLicensed(false);
    setSourceNote('');
    setPublish(true);
    setLang('en');
    setItems([newDraft()]);
  }

  async function onCreate() {
    setError(null);
    setCreated(null);
    const filled = items.filter((i) => i.prompt.trim());
    if (!key.trim() || !title.trim()) {
      setError(t('validationKeyTitle'));
      return;
    }
    if (filled.length === 0) {
      setError(t('validationItems'));
      return;
    }
    const built: CreateQuestionnaireItemInput[] = [];
    for (const d of filled) {
      const item: CreateQuestionnaireItemInput = {
        prompt: d.prompt.trim(),
        item_type: d.type,
        required: d.required
      };
      if (CHOICE_TYPES.includes(d.type)) {
        const opts = parseOptions(d.optionsText);
        if (opts.length === 0) {
          setError(t('validationOptions', { prompt: d.prompt.trim() }));
          return;
        }
        item.options = opts;
      }
      if (d.type === 'number') {
        if (d.min.trim() !== '') item.min_value = Number(d.min);
        if (d.max.trim() !== '') item.max_value = Number(d.max);
      }
      built.push(item);
    }
    try {
      await create.mutateAsync({
        key: key.trim(),
        title: title.trim(),
        description: description.trim() || null,
        items: built,
        licensed,
        sourceNote: sourceNote.trim() || null,
        publish,
        lang
      });
      setCreated(title.trim());
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onToggle(k: string, published: boolean) {
    setError(null);
    try {
      await setVisibility.mutateAsync({ key: k, published });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const rows = list.data ?? [];
  const inputClass =
    'w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] text-ink';

  return (
    <div className={embedded ? '' : 'mt-4'}>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[var(--radius-card)] border border-amber-deep/40 bg-amber-soft/40 p-2 text-[13px] text-ink"
        >
          {error}
        </p>
      )}
      {created && (
        <p className="mb-3 rounded-[var(--radius-card)] border border-sage-deep/40 bg-sage-soft/40 p-2 text-[13px] text-ink">
          {t('created', { title: created })}
        </p>
      )}

      {/* Existing questionnaires */}
      <h3 className="eyebrow">{t('existingHeading')}</h3>
      {list.isLoading ? (
        <p className="mt-2 text-[13px] text-ink-muted">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-muted">{t('none')}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {rows.map((q) => (
            <li
              key={q.questionnaireId}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-card)] border border-stone bg-cream p-3"
            >
              <div>
                <p className="text-[14px] font-semibold text-ink">{q.title}</p>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {t('versionLabel', { key: q.key, version: q.version })}
                  {` · ${q.lang.toUpperCase()}`}
                  {q.licensed && ` · ${t('licensedBadge')}`}
                  {' · '}
                  {q.published ? t('publishedBadge') : t('unpublishedBadge')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onToggle(q.key, !q.published)}
                disabled={setVisibility.isPending}
                className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-stone-soft disabled:opacity-50"
              >
                {q.published ? t('unpublish') : t('publish')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* New questionnaire */}
      <h3 className="eyebrow mt-8">{t('newTitle')}</h3>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-[13px]">
            <span className="font-semibold text-ink">{t('keyLabel')}</span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. weekly_mood"
              className={`mt-1 ${inputClass}`}
            />
            <span className="mt-1 block text-[11px] text-ink-muted">{t('keyHint')}</span>
          </label>
          <label className="block text-[13px]">
            <span className="font-semibold text-ink">{t('titleLabel')}</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        </div>

        <label className="block text-[13px]">
          <span className="font-semibold text-ink">{t('languageLabel')}</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            aria-label={t('languageLabel')}
            className={`mt-1 ${inputClass}`}
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[13px]">
          <span className="font-semibold text-ink">{t('descriptionLabel')}</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`mt-1 ${inputClass}`}
          />
        </label>

        {/* Items */}
        <div>
          <h4 className="text-[13px] font-semibold text-ink">{t('itemsHeading')}</h4>
          <div className="mt-2 space-y-3">
            {items.map((it, idx) => (
              <div
                key={it.uid}
                className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-ink-muted">
                    {t('itemNumber', { n: idx + 1 })}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((a) => a.filter((x) => x.uid !== it.uid))}
                      className="text-[12px] font-semibold text-amber-deep hover:underline"
                    >
                      {t('removeItem')}
                    </button>
                  )}
                </div>
                <input
                  value={it.prompt}
                  onChange={(e) => patchItem(it.uid, { prompt: e.target.value })}
                  placeholder={t('promptLabel')}
                  aria-label={t('promptLabel')}
                  className={`mt-2 ${inputClass}`}
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <label className="text-[12px]">
                    <span className="mr-1 text-ink-muted">{t('typeLabel')}</span>
                    <select
                      value={it.type}
                      onChange={(e) => patchItem(it.uid, { type: e.target.value as ItemType })}
                      aria-label={t('typeLabel')}
                      className="rounded-[var(--radius-button)] border border-stone bg-cream px-2 py-1.5 text-[12px] text-ink"
                    >
                      {ITEM_TYPES.map((ty) => (
                        <option key={ty} value={ty}>
                          {t(`type_${ty}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={it.required}
                      onChange={(e) => patchItem(it.uid, { required: e.target.checked })}
                    />
                    {t('requiredLabel')}
                  </label>
                </div>

                {CHOICE_TYPES.includes(it.type) && (
                  <label className="mt-2 block text-[12px]">
                    <span className="text-ink-muted">{t('optionsLabel')}</span>
                    <textarea
                      value={it.optionsText}
                      onChange={(e) => patchItem(it.uid, { optionsText: e.target.value })}
                      rows={3}
                      placeholder={'never\nsometimes\noften'}
                      aria-label={t('optionsLabel')}
                      className={`mt-1 ${inputClass}`}
                    />
                    <span className="mt-1 block text-[11px] text-ink-muted">{t('optionsHint')}</span>
                  </label>
                )}

                {it.type === 'number' && (
                  <div className="mt-2 flex gap-3">
                    <label className="text-[12px]">
                      <span className="mr-1 text-ink-muted">{t('minLabel')}</span>
                      <input
                        type="number"
                        value={it.min}
                        onChange={(e) => patchItem(it.uid, { min: e.target.value })}
                        aria-label={t('minLabel')}
                        className="w-24 rounded-[var(--radius-button)] border border-stone bg-cream px-2 py-1.5 text-[12px] text-ink"
                      />
                    </label>
                    <label className="text-[12px]">
                      <span className="mr-1 text-ink-muted">{t('maxLabel')}</span>
                      <input
                        type="number"
                        value={it.max}
                        onChange={(e) => patchItem(it.uid, { max: e.target.value })}
                        aria-label={t('maxLabel')}
                        className="w-24 rounded-[var(--radius-button)] border border-stone bg-cream px-2 py-1.5 text-[12px] text-ink"
                      />
                    </label>
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setItems((a) => [...a, newDraft()])}
            className="mt-2 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[12px] font-semibold text-ink-soft transition-colors hover:bg-stone-soft"
          >
            {t('addItem')}
          </button>
        </div>

        {/* Licence + publish */}
        <label className="flex items-start gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={licensed}
            onChange={(e) => setLicensed(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-semibold">{t('licensedLabel')}</span>
            <span className="block text-[11px] text-ink-muted">{t('licensedHint')}</span>
          </span>
        </label>
        {licensed && (
          <label className="block text-[13px]">
            <span className="font-semibold text-ink">{t('sourceNoteLabel')}</span>
            <input
              value={sourceNote}
              onChange={(e) => setSourceNote(e.target.value)}
              className={`mt-1 ${inputClass}`}
            />
          </label>
        )}
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
          />
          {t('publishLabel')}
        </label>

        <button
          type="button"
          onClick={onCreate}
          disabled={create.isPending}
          className="rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-4 py-2.5 text-[14px] font-semibold text-on-accent transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? t('creating') : t('create')}
        </button>
      </div>
    </div>
  );
}
