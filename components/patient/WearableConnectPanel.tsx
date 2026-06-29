'use client';

import { useLocale, useTranslations } from 'next-intl';
import { formatLongDate } from '@/lib/dates';
import {
  useWearableConnections,
  useConnectWearable,
  useDisconnectWearable,
  wearablesEnabled,
  type WearableConnection
} from '@/lib/supabase/wearableConnections';

/**
 * Patient-facing panel to link / unlink a wearable through the aggregator.
 * Hidden entirely unless the NEXT_PUBLIC_WEARABLES_ENABLED flag is on. Shows
 * each connection's status and last sync, with connect / disconnect actions.
 * Descriptive only — the panel never interprets the data.
 */
export function WearableConnectPanel() {
  const t = useTranslations('wearables');
  const locale = useLocale();
  const enabled = wearablesEnabled();
  const connections = useWearableConnections(enabled);
  const connect = useConnectWearable();
  const disconnect = useDisconnectWearable();

  if (!enabled) return null;

  const list = connections.data ?? [];
  const active = list.filter((c) => c.status !== 'revoked');
  const busy = connect.isPending;

  const statusLabel = (s: WearableConnection['status']) =>
    s === 'connected'
      ? t('statusConnected')
      : s === 'pending'
        ? t('statusPending')
        : s === 'error'
          ? t('statusError')
          : t('statusRevoked');

  return (
    <section className="mt-10 border-t border-stone/70 pt-7">
      <h2 className="eyebrow">{t('heading')}</h2>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
        {t('helper')}
      </p>

      {active.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {active.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-3"
            >
              <div className="min-w-0">
                <p className="text-[15px] font-semibold capitalize text-ink">
                  {c.provider}
                </p>
                <p className="mt-0.5 text-[12px] text-ink-muted">
                  {statusLabel(c.status)}
                  {c.status === 'connected' &&
                    ` · ${t('lastSync', {
                      when: c.lastSyncAt
                        ? formatLongDate(c.lastSyncAt, locale)
                        : t('never')
                    })}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => disconnect.mutate(c.id)}
                disabled={disconnect.isPending}
                className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft disabled:opacity-50"
              >
                {t('disconnect')}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <button
          type="button"
          onClick={() => connect.mutate(undefined)}
          disabled={busy}
          className="mt-3 rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-4 py-2.5 text-[15px] font-semibold text-on-accent hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t('connecting') : t('connect')}
        </button>
      )}

      {connect.isError && (
        <p className="mt-2 text-[13px] text-amber-deep">{t('connectError')}</p>
      )}

      <p className="mt-3 text-[12px] leading-relaxed text-ink-muted">
        {t('consentNote')}
      </p>
    </section>
  );
}
