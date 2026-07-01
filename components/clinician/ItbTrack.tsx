'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import { useModalA11y } from '@/lib/useModalA11y';
import { useToast } from '@/components/feedback/Toast';
import {
  useItbTherapy,
  useStartItbTherapy,
  useLogItbDoseChange,
  type ItbTherapy
} from '@/lib/supabase/itb';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Intrathecal baclofen track for the clinician patient page. ITB runs in
 * parallel with the botulinum-toxin cycle as a continuous, titrated therapy,
 * so this shows the current pump dose and a titration timeline rather than a
 * peak-effect cycle. Renders a compact "start ITB track" affordance when the
 * patient has no active therapy.
 */
export function ItbTrack({
  patientId,
  onActivity
}: {
  patientId: string;
  onActivity?: () => void;
}) {
  const t = useTranslations('itb');
  const therapy = useItbTherapy(patientId);

  if (therapy.isLoading || therapy.data === undefined) {
    return null;
  }
  if (!therapy.data) {
    return <StartItbCard patientId={patientId} onActivity={onActivity} />;
  }
  return (
    <ActiveItbCard
      patientId={patientId}
      therapy={therapy.data}
      onActivity={onActivity}
    />
  );
}

function StartItbCard({
  patientId,
  onActivity
}: {
  patientId: string;
  onActivity?: () => void;
}) {
  const t = useTranslations('itb');
  const toast = useToast();
  const start = useStartItbTherapy();
  const [open, setOpen] = useState(false);
  const [startedOn, setStartedOn] = useState(todayIso());
  const [note, setNote] = useState('');

  const submit = async () => {
    onActivity?.();
    try {
      await start.mutateAsync({
        patientId,
        startedOn: startedOn || null,
        note: note.trim() || null
      });
      toast.success(t('startedToast'));
      setOpen(false);
    } catch {
      toast.error(t('error'));
    }
  };

  return (
    <section className="mt-4 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] leading-tight text-ink">
          {t('title')}
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
          >
            {t('startTrack')}
          </button>
        )}
      </div>
      {!open ? (
        <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
          {t('intro')}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-soft">
              {t('startedOnLabel')}
            </span>
            <input
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
              className="mt-1 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-soft">
              {t('noteLabel')}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t('notePlaceholder')}
              className="mt-1 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={start.isPending}
              className="rounded-[var(--radius-button)] bg-sage-deep px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
            >
              {start.isPending ? t('starting') : t('start')}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ActiveItbCard({
  patientId,
  therapy,
  onActivity
}: {
  patientId: string;
  therapy: ItbTherapy;
  onActivity?: () => void;
}) {
  const t = useTranslations('itb');
  const locale = useLocale();
  const [showDose, setShowDose] = useState(false);

  const dose = (v: number | null) =>
    v == null ? t('notSet') : t('doseValue', { n: v });

  return (
    <section className="mt-4 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] leading-tight text-ink">
          {t('title')}
        </h2>
        <button
          type="button"
          onClick={() => setShowDose(true)}
          className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-sage-deep hover:bg-stone-soft"
        >
          {t('logDose')}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
        <span className="text-ink-soft">
          <span className="text-ink-muted">{t('currentDose')}: </span>
          <span className="font-semibold text-ink">
            {dose(therapy.currentDose?.doseMcgPerDay ?? null)}
          </span>
        </span>
        {therapy.startedOn && (
          <span className="text-ink-soft">
            <span className="text-ink-muted">{t('startedOnLabel')}: </span>
            {formatLongDate(therapy.startedOn, locale)}
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="text-[12px] font-semibold text-ink-soft">
          {t('timelineHeading')}
        </p>
        {therapy.doseChanges.length === 0 ? (
          <p className="mt-1 text-[13px] text-ink-muted">{t('noChanges')}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {[...therapy.doseChanges].reverse().map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-soft"
              >
                <span className="text-ink-muted tabular-nums">
                  {formatLongDate(d.changedOn, locale)}
                </span>
                <span className="font-semibold text-ink">
                  {dose(d.doseMcgPerDay)}
                </span>
                {d.note && <span className="text-ink-muted">· {d.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {showDose && (
        <DoseModal
          patientId={patientId}
          therapyId={therapy.id}
          onClose={() => setShowDose(false)}
          onActivity={onActivity}
        />
      )}
    </section>
  );
}

function DoseModal({
  patientId,
  therapyId,
  onClose,
  onActivity
}: {
  patientId: string;
  therapyId: string;
  onClose: () => void;
  onActivity?: () => void;
}) {
  const t = useTranslations('itb');
  const tA11y = useTranslations('a11y');
  const toast = useToast();
  const containerRef = useModalA11y(onClose);
  const log = useLogItbDoseChange(patientId);
  const [changedOn, setChangedOn] = useState(todayIso());
  const [doseText, setDoseText] = useState('');
  const [note, setNote] = useState('');

  const submit = async () => {
    onActivity?.();
    const n = doseText.trim() ? Number(doseText) : NaN;
    try {
      await log.mutateAsync({
        therapyId,
        changedOn: changedOn || null,
        dose: Number.isFinite(n) ? n : null,
        note: note.trim() || null
      });
      toast.success(t('doseSavedToast'));
      onClose();
    } catch {
      toast.error(t('error'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/40 p-4 sm:items-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('logDose')}
        className="flex max-h-[92dvh] w-full max-w-[440px] flex-col overflow-y-auto rounded-[var(--radius-card)] border border-stone bg-cream shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-stone/70 px-5 py-3">
          <span className="eyebrow">{t('logDose')}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label={tA11y('close')}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-soft hover:bg-stone-soft hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-soft">
              {t('doseDate')}
            </span>
            <input
              type="date"
              value={changedOn}
              onChange={(e) => setChangedOn(e.target.value)}
              className="mt-1 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-soft">
              {t('doseValueLabel')}
            </span>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={doseText}
              onChange={(e) => setDoseText(e.target.value)}
              placeholder={t('doseUnit')}
              className="mt-1 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-semibold text-ink-soft">
              {t('noteLabel')}
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={2000}
              className="mt-1 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
            />
          </label>
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t border-stone/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={log.isPending}
            className="rounded-[var(--radius-button)] bg-sage-deep px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
          >
            {log.isPending ? t('saving') : t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
