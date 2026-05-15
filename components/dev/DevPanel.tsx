'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useStore, actions } from '@/lib/store';
import { formatLongDate } from '@/lib/dates';
import type { Role } from '@/lib/types';

/**
 * The dev panel is deliberately styled as "tooling" rather than "product"
 * (dark slate, monospaced numerals) so testers immediately understand
 * these controls would not ship to real users.
 *
 * TODO before any real user testing: gate this behind a query parameter
 * (e.g. ?dev=1) or env flag. For now it's always visible because the
 * prototype's audience IS the people testing it.
 */
export function DevPanel() {
  return <DevPanelInner />;
}

function DevPanelInner() {
  const t = useTranslations('dev');
  const locale = useLocale();
  const state = useStore();
  const [open, setOpen] = useState(false);
  const [showAudit, setShowAudit] = useState(false);

  const roles: Role[] = ['patient', 'clinician'];

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      <div className="mx-auto max-w-[480px] px-3 pb-3 pointer-events-auto">
        {/* Collapsed handle */}
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-full bg-ink/90 px-4 py-2.5 text-[13px] font-semibold text-cream shadow-lg shadow-ink/20 hover:bg-ink"
          >
            <span aria-hidden>⚙</span>
            {t('title')}
          </button>
        )}

        {/* Expanded panel */}
        {open && (
          <div className="rounded-[var(--radius-card)] border border-ink/20 bg-ink/95 text-cream shadow-2xl shadow-ink/30 backdrop-blur">
            <div className="flex items-center justify-between border-b border-cream/10 px-4 py-3">
              <div>
                <div className="text-[13px] font-semibold tracking-wide">
                  {t('title')}
                </div>
                <div className="text-[11px] text-cream/60">{t('subtitle')}</div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-md px-2 py-1 text-cream/70 hover:bg-cream/10 hover:text-cream"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              {/* Role */}
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wider text-cream/50">
                  {t('role')}
                </div>
                <div className="flex gap-1.5">
                  {roles.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => actions.setRole(r)}
                      className={`flex-1 rounded-md px-3 py-2 text-[13px] font-semibold ${
                        state.currentRole === r
                          ? 'bg-sage text-cream'
                          : 'bg-cream/10 text-cream/80 hover:bg-cream/15'
                      }`}
                    >
                      {t(r === 'patient' ? 'rolePatient' : 'roleClinician')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Patient */}
              <div>
                <div className="mb-1.5 text-[11px] uppercase tracking-wider text-cream/50">
                  {t('patient')}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {state.patients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => actions.setCurrentPatientId(p.id)}
                      className={`rounded-md px-3 py-2 text-[13px] font-semibold ${
                        state.currentPatientId === p.id
                          ? 'bg-sage text-cream'
                          : 'bg-cream/10 text-cream/80 hover:bg-cream/15'
                      }`}
                    >
                      {p.displayName}
                    </button>
                  ))}
                </div>
              </div>

              {/* Virtual date */}
              <div className="rounded-md bg-cream/5 px-3 py-2 text-[12px] text-cream/70">
                {t('virtualDate', {
                  date: formatLongDate(state.now, locale)
                })}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => actions.simulateNextWeek()}
                  className="rounded-md bg-cream/10 px-3 py-2 text-[12px] font-semibold text-cream hover:bg-cream/15"
                >
                  {t('simulateWeek')}
                </button>
                <button
                  type="button"
                  onClick={() => actions.reset()}
                  className="rounded-md bg-cream/10 px-3 py-2 text-[12px] font-semibold text-cream hover:bg-cream/15"
                >
                  {t('reset')}
                </button>
              </div>

              {/* Audit log */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAudit((v) => !v)}
                  className="w-full rounded-md bg-cream/10 px-3 py-2 text-left text-[12px] font-semibold text-cream hover:bg-cream/15"
                >
                  {showAudit ? t('hideAuditLog') : t('viewAuditLog')}
                  <span className="ml-1 text-cream/50">
                    ({state.auditLog.length})
                  </span>
                </button>
                {showAudit && (
                  <div className="mt-2 max-h-44 overflow-y-auto rounded-md border border-cream/10 bg-cream/5 p-2 text-[11px] font-mono leading-relaxed text-cream/80">
                    {state.auditLog.length === 0 ? (
                      <div className="text-cream/50">{t('auditEmpty')}</div>
                    ) : (
                      <ul className="space-y-1">
                        {state.auditLog
                          .slice()
                          .reverse()
                          .map((e) => (
                            <li key={e.id}>
                              <span className="text-cream/50">
                                {new Date(e.timestamp).toLocaleTimeString(
                                  locale
                                )}
                              </span>{' '}
                              · {e.actorRole} · {e.action} · {e.entity}:
                              {e.entityId}
                            </li>
                          ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
