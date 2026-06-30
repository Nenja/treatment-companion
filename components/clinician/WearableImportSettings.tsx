'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IMPORTABLE_METRIC_KEYS } from '@/lib/wearables/types';
import {
  useWearableConnectionsForPatient,
  useSetWearableMetrics,
  wearablesEnabled
} from '@/lib/supabase/wearableConnections';

/**
 * Clinician control: choose which wearable metrics to import for a patient's
 * connection(s). The webhook ingests only the selected metrics, so this both
 * keeps the data clinically relevant and minimises what's collected (GDPR).
 * Hidden unless the feature flag is on and the patient has a connection.
 */
export function WearableImportSettings({ patientId }: { patientId: string }) {
  const t = useTranslations('wearables');
  const connections = useWearableConnectionsForPatient(patientId);
  const save = useSetWearableMetrics();

  // Local draft per connection; seeded from server data, re-seeded on refetch.
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [savedId, setSavedId] = useState<string | null>(null);

  const live = (connections.data ?? []).filter((c) => c.status !== 'revoked');

  useEffect(() => {
    const data = connections.data;
    if (!data) return;
    setDraft((prev) => {
      const next = { ...prev };
      for (const c of data) {
        if (!(c.id in next)) next[c.id] = c.metrics;
      }
      return next;
    });
  }, [connections.data]);

  if (!wearablesEnabled() || live.length === 0) return null;

  const toggle = (connId: string, key: string) => {
    setSavedId(null);
    setDraft((prev) => {
      const cur = new Set(prev[connId] ?? []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...prev, [connId]: [...cur] };
    });
  };

  return (
    <section className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <h2 className="eyebrow">{t('importHeading')}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
        {t('importHelper')}
      </p>

      {live.map((c) => {
        const selected = new Set(draft[c.id] ?? c.metrics);
        const dirty =
          [...selected].sort().join(',') !== [...c.metrics].sort().join(',');
        return (
          <div key={c.id} className="mt-4">
            <p className="text-[14px] font-semibold capitalize text-ink">
              {c.provider}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {IMPORTABLE_METRIC_KEYS.map((key) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-[14px] text-ink"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggle(c.id, key)}
                    className="h-4 w-4 shrink-0 rounded border-stone text-sage-deep focus:ring-sage"
                  />
                  <span>{t(`metrics.${key}`)}</span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={!dirty || save.isPending}
                onClick={() =>
                  save.mutate(
                    { connectionId: c.id, metrics: [...selected] },
                    { onSuccess: () => setSavedId(c.id) }
                  )
                }
                className="rounded-[var(--radius-button)] border border-sage-deep bg-sage-deep px-3.5 py-1.5 text-[13px] font-semibold text-on-accent hover:opacity-90 disabled:opacity-40"
              >
                {save.isPending ? t('saving') : t('save')}
              </button>
              {savedId === c.id && !dirty && (
                <span className="text-[13px] text-sage-deep">{t('saved')}</span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
