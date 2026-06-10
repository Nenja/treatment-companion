'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useModalA11y } from '@/lib/useModalA11y';
import { useUpdateOwnProfile } from '@/lib/supabase/profile';
import { subscribeToPush } from '@/lib/pwa';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

// Display order is Monday-first; the value stored is the JS getUTCDay
// index (0 = Sunday), matching the Edge Function's weekday check.
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

interface NotificationDayModalProps {
  /**
   * Called when the patient finishes — saved a day or skipped. The
   * parent stops showing the modal for the session; once a day is
   * saved it also won't reappear on the next login.
   */
  onClose: () => void;
}

/**
 * Login-time prompt asking the patient to choose which weekday they want
 * their weekly check-in reminder, and turning on browser notifications.
 *
 * "Turn on reminders" saves the chosen day first (so the choice persists
 * even if the browser then blocks push or needs an iOS install), then
 * subscribes to push. "Skip for now" leaves the day unset, so the modal
 * returns on the next login.
 */
export function NotificationDayModal({ onClose }: NotificationDayModalProps) {
  const locale = useLocale();
  const t = useTranslations('notifications');
  const tDay = useTranslations('weekday');
  const containerRef = useModalA11y(onClose);
  const updateProfile = useUpdateOwnProfile();

  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'ios_install' | 'denied' | 'error' | 'done'
  >('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onTurnOn = async () => {
    if (selected === null) return;
    setStatus('pending');
    setErrorMsg(null);

    // Persist the chosen day first — this is what stops the modal
    // reappearing on the next login, regardless of whether push then
    // succeeds (a patient who can't enable push shouldn't be nagged).
    try {
      await updateProfile.mutateAsync({ notifyWeekday: selected });
    } catch {
      setStatus('error');
      setErrorMsg(t('couldNotEnable'));
      return;
    }

    if (!VAPID_PUBLIC_KEY) {
      setStatus('done');
      setTimeout(onClose, 1200);
      return;
    }

    const result = await subscribeToPush(VAPID_PUBLIC_KEY, locale);
    if (result.status === 'subscribed') {
      setStatus('done');
      setTimeout(onClose, 1200);
    } else if (result.status === 'ios_install_required') {
      setStatus('ios_install');
    } else if (result.status === 'denied') {
      setStatus('denied');
    } else if (result.status === 'unsupported') {
      setStatus('done');
      setTimeout(onClose, 1200);
    } else {
      setStatus('error');
      setErrorMsg(result.message ?? t('couldNotEnable'));
    }
  };

  const showActionTurnOn = status === 'idle' || status === 'pending';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/45 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notif-day-title"
    >
      <div
        ref={containerRef}
        className="w-full max-w-[480px] rounded-t-[var(--radius-card)] border-t border-stone bg-cream-soft px-5 pb-7 pt-3 sm:rounded-[var(--radius-card)] sm:border"
      >
        <div className="mx-auto mb-4 h-1 w-9 rounded-full bg-stone sm:hidden" />

        <h2
          id="notif-day-title"
          className="text-center font-display text-[20px] leading-tight text-ink"
        >
          {t('dayTitle')}
        </h2>
        <p className="mx-auto mt-2 max-w-[20rem] text-center text-[14px] leading-relaxed text-ink-soft">
          {t('dayBody')}
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {DAY_ORDER.map((d) => {
            const isSel = selected === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                aria-pressed={isSel}
                className={`min-w-[3rem] rounded-[var(--radius-button)] border px-3 py-2 text-[14px] font-semibold ${
                  isSel
                    ? 'border-sage bg-sage-soft text-sage-deep'
                    : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
                }`}
              >
                {tDay(`short.${d}`)}
              </button>
            );
          })}
        </div>

        {status === 'pending' && (
          <p className="mt-4 text-center text-[14px] text-ink-soft">
            {t('requesting')}
          </p>
        )}
        {status === 'done' && (
          <p className="mt-4 text-center text-[14px] font-semibold text-sage-deep">
            {t('subscribed')}
          </p>
        )}
        {status === 'denied' && (
          <p className="mt-4 text-center text-[14px] text-ink-soft">
            {t('denied')}
          </p>
        )}
        {status === 'ios_install' && (
          <div className="mt-4 text-[14px] text-ink-soft">
            <p className="font-semibold">{t('iosTitle')}</p>
            <ol className="mt-1 ml-4 list-decimal space-y-1">
              <li>{t('iosStep1')}</li>
              <li>{t('iosStep2')}</li>
              <li>{t('iosStep3')}</li>
            </ol>
          </div>
        )}
        {status === 'error' && (
          <p className="mt-4 text-center text-[14px] text-amber-deep">
            {errorMsg ?? t('genericError')}
          </p>
        )}

        {showActionTurnOn ? (
          <button
            type="button"
            onClick={onTurnOn}
            disabled={selected === null || status === 'pending'}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t('dayTurnOn')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {t('dayDone')}
          </button>
        )}

        {showActionTurnOn && (
          <button
            type="button"
            onClick={onClose}
            className="mt-3 flex w-full items-center justify-center text-[14px] font-medium text-ink-muted hover:text-ink-soft"
          >
            {t('daySkip')}
          </button>
        )}

        <p className="mt-4 text-center text-[12px] text-ink-muted">
          {t('dayChangeNote')}
        </p>
      </div>
    </div>
  );
}
