'use client';

import type { ReactNode } from 'react';
import { BrandMark } from '@/components/layout/BrandMark';
import { useTranslations } from 'next-intl';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { PageHelpButton } from '@/components/feedback/PageHelpButton';

interface WizardLayoutProps {
  currentStep: number;
  totalSteps: number;
  title: string;
  helper?: string;
  onBack?: () => void;
  onCancel: () => void;
  /** Primary action — "Continue" or "Send to my team" on the final step. */
  primaryAction: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
  /**
   * Optional per-step labels. When provided, the progress strip shows
   * a named list (goal names, etc.) instead of abstract dots — concrete
   * orientation for patients with slowed processing. Each entry's
   * `done` drives a checkmark; the current step is highlighted.
   */
  stepLabels?: { label: string; done: boolean }[];
  /**
   * When true, shows a persistent "saved" reassurance line and labels
   * the top-left exit as "Save & finish later" rather than "Cancel".
   * The check-in draft is persisted on every change, so leaving is
   * always safe — this just makes that visible.
   */
  forgiving?: boolean;
  /** Hide the progress strip, keeping only the "Step X of X" counter. */
  hideStepBar?: boolean;
  /** Hide the page <h1>/helper block — used on rating steps where the
   *  goal itself is the heading, rendered by the picker. */
  hideHeader?: boolean;
  /** Optional small uppercase eyebrow at the very top of the content,
   *  above the heading. Used for the catch-up week cue. */
  eyebrow?: string;
  /** When set, a "?" help button appears next to the account menu,
   *  opening the help modal for that page. */
  helpPageKey?: string;
  children: ReactNode;
}

export function WizardLayout({
  currentStep,
  totalSteps,
  title,
  helper,
  onBack,
  onCancel,
  primaryAction,
  stepLabels,
  forgiving = false,
  hideStepBar = false,
  hideHeader = false,
  eyebrow,
  helpPageKey,
  children
}: WizardLayoutProps) {
  const t = useTranslations('patient.suggestGoal');
  const tc = useTranslations('patient.checkin');

  return (
    <div className="min-h-dvh bg-cream">
      {/* Header */}
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3 px-5 pb-2 pt-3">
          <BrandMark />
          <div className="flex items-center gap-2">
            {helpPageKey && <PageHelpButton pageKey={helpPageKey} />}
            <AccountMenu />
          </div>
        </div>
        <div className="mx-auto flex max-w-[480px] items-center justify-between gap-3 px-5 pb-4">
          <button
            type="button"
            onClick={onCancel}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            {forgiving ? tc('saveAndFinishLater') : t('cancel')}
          </button>
          <span className="text-[14px] font-semibold text-sage-deep">
            {t('stepOf', { current: currentStep, total: totalSteps })}
          </span>
        </div>

        {/* Progress — list/dots; suppressed when hideStepBar set. */}
        {hideStepBar ? null : stepLabels && stepLabels.length > 0 ? (
          <div className="mx-auto max-w-[480px] px-5 pb-4">
            <ol className="flex flex-col gap-1">
              {stepLabels.map((s, i) => {
                const stepNum = i + 1;
                const isCurrent = stepNum === currentStep;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-2 text-[14px] ${
                      isCurrent
                        ? 'font-semibold text-ink'
                        : s.done
                          ? 'text-ink-soft'
                          : 'text-ink-muted'
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] ${
                        s.done
                          ? 'bg-sage text-on-accent'
                          : isCurrent
                            ? 'border-2 border-sage bg-cream-soft text-sage-deep'
                            : 'border border-stone bg-cream-soft text-ink-muted'
                      }`}
                    >
                      {s.done ? '✓' : stepNum}
                    </span>
                    <span className="truncate">{s.label}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[480px] gap-1.5 px-5 pb-4">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map(
              (step) => {
                const isPast = step < currentStep;
                const isCurrent = step === currentStep;
                return (
                  <div
                    key={step}
                    className={`h-1.5 flex-1 rounded-full ${
                      isPast || isCurrent ? 'bg-sage' : 'bg-stone'
                    }`}
                    aria-hidden
                  />
                );
              }
            )}
          </div>
        )}

        {/* Persistent "saved" reassurance — only in forgiving mode. */}
        {forgiving && (
          <div className="mx-auto max-w-[480px] px-5 pb-3">
            <p className="flex items-center gap-1.5 text-[13px] text-ink-muted">
              <span aria-hidden>✓</span>
              {tc('savedReassurance')}
            </p>
          </div>
        )}
      </header>

      {/* Body */}
      <main className="mx-auto max-w-[480px] px-5 pb-32 pt-6">
        {eyebrow && (
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-amber-deep">
            {eyebrow}
          </p>
        )}
        {!hideHeader && (
          <>
            <h1 className="font-display text-[26px] leading-tight text-ink">
              {title}
            </h1>
            {helper && (
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
                {helper}
              </p>
            )}
          </>
        )}
        <div className={hideHeader ? '' : 'mt-6'}>{children}</div>
      </main>

      {/* Sticky footer with back + primary */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-stone/70 bg-cream-soft/95 backdrop-blur">
        <div className="mx-auto flex max-w-[480px] gap-3 px-5 py-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-12 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-5 text-[15px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              ← {t('back')}
            </button>
          )}
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
            className="flex h-12 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
          >
            {primaryAction.label}
          </button>
        </div>
      </footer>
    </div>
  );
}
