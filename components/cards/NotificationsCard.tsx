'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import {
  pushSupported,
  isStandalone,
  isIOS,
  subscribeToPush
} from '@/lib/pwa';

interface NotificationsCardProps {
  /** The signed-in patient's profile id. Used as a localStorage key. */
  profileId: string;
}

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/**
 * One-time prompt asking the patient to enable notifications so they
 * get reminded when a check-in is due. Shown on first sign-in for any
 * patient.
 *
 * Hidden once:
 *   - The patient subscribes successfully, OR
 *   - The patient explicitly dismisses ("Not now"), OR
 *   - The browser already reports `Notification.permission === 'granted'`
 *     (subscription is already in place).
 *
 * Dismissal stored in localStorage keyed by profileId so a returning
 * patient doesn't see it again. The user can re-trigger later from
 * the account menu (TODO: not yet built).
 */
export function NotificationsCard({ profileId }: NotificationsCardProps) {
  const locale = useLocale();
  const [hidden, setHidden] = useState(true); // hidden until we mount
  const [status, setStatus] = useState<
    'idle' | 'pending' | 'ios_install' | 'denied' | 'error' | 'subscribed'
  >('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const dismissKey = `notifPromptDismissed:${profileId}`;

  // Decide whether to show the card on mount.
  useEffect(() => {
    if (!pushSupported()) {
      setHidden(true);
      return;
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      setHidden(true);
      return;
    }
    try {
      if (localStorage.getItem(dismissKey)) {
        setHidden(true);
        return;
      }
    } catch {
      // localStorage can be unavailable in private browsing modes.
    }
    setHidden(false);
  }, [dismissKey]);

  const onEnable = async () => {
    if (!VAPID_PUBLIC_KEY) {
      setStatus('error');
      setErrorMsg(
        'Notifications are not configured (missing VAPID key).'
      );
      return;
    }
    setStatus('pending');
    setErrorMsg(null);
    const result = await subscribeToPush(VAPID_PUBLIC_KEY, locale);
    if (result.status === 'subscribed') {
      setStatus('subscribed');
      try {
        localStorage.setItem(dismissKey, 'subscribed');
      } catch {
        /* ignore */
      }
      // Hide after a short success message so the patient sees the change.
      setTimeout(() => setHidden(true), 1500);
    } else if (result.status === 'ios_install_required') {
      setStatus('ios_install');
    } else if (result.status === 'denied') {
      setStatus('denied');
    } else if (result.status === 'unsupported') {
      setHidden(true); // silently hide
    } else {
      setStatus('error');
      setErrorMsg(result.message ?? 'Could not enable notifications.');
    }
  };

  const onDismiss = () => {
    try {
      localStorage.setItem(dismissKey, 'dismissed');
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  if (hidden) return null;

  return (
    <section
      role="region"
      aria-label="Enable notifications"
      className="mt-4 rounded-[var(--radius-card)] border border-sage/30 bg-sage-soft/30 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-display text-[16px] leading-snug text-ink">
            Get reminded about your weekly check-in
          </p>
          <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
            We&apos;ll send a notification to this device when your
            check-in is due, and one reminder if it&apos;s a couple of
            days late. Nothing else.
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[16px] text-ink-muted hover:bg-stone-soft hover:text-ink-soft"
        >
          ×
        </button>
      </div>

      {status === 'idle' && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onEnable}
            className="flex h-10 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-cream-soft hover:bg-ink-soft"
          >
            Enable notifications
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-10 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Not now
          </button>
        </div>
      )}

      {status === 'pending' && (
        <p className="mt-3 text-[14px] text-ink-soft">Requesting…</p>
      )}

      {status === 'subscribed' && (
        <p className="mt-3 text-[14px] font-semibold text-sage-deep">
          You&apos;re all set. Notifications enabled.
        </p>
      )}

      {status === 'denied' && (
        <p className="mt-3 text-[14px] text-ink-soft">
          Notifications were blocked. To turn them on later, open your
          browser settings for this site and allow notifications.
        </p>
      )}

      {status === 'ios_install' && (
        <div className="mt-3 text-[14px] text-ink-soft">
          <p className="font-semibold">To get reminders on iPhone:</p>
          <ol className="mt-1 ml-4 list-decimal space-y-1">
            <li>
              Tap the Share button at the bottom of Safari (the square
              with the arrow).
            </li>
            <li>Scroll down and tap &ldquo;Add to Home Screen&rdquo;.</li>
            <li>
              Open the app from the home screen, sign in, and tap
              &ldquo;Enable notifications&rdquo; again.
            </li>
          </ol>
        </div>
      )}

      {status === 'error' && (
        <p className="mt-3 text-[14px] text-amber-deep">
          {errorMsg ?? 'Something went wrong.'}
        </p>
      )}
    </section>
  );
}
