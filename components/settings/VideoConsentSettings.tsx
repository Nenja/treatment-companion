'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useOwnVideoConsent,
  useSetOwnVideoConsent
} from '@/lib/supabase/patientInfo';
import { useToast } from '@/components/feedback/Toast';

/**
 * Patient-facing video consent, managed from the profile. Two checkmarks the
 * patient can set or withdraw at any time (migration 0093). Wording is a first
 * pass pending study-team / DPO and native-Danish review.
 */
export function VideoConsentSettings() {
  const t = useTranslations('videoConsent');
  const consent = useOwnVideoConsent(true);
  const setConsent = useSetOwnVideoConsent();
  const toast = useToast();

  const [clinical, setClinical] = useState(false);
  const [research, setResearch] = useState(false);

  useEffect(() => {
    if (consent.data) {
      setClinical(consent.data.clinical);
      setResearch(consent.data.research);
    }
  }, [consent.data]);

  const dirty =
    !!consent.data &&
    (clinical !== consent.data.clinical || research !== consent.data.research);

  return (
    <div>
      <h2 className="text-[13px] font-semibold text-ink-soft">
        {t('profileHeading')}
      </h2>
      <p className="mt-0.5 text-[12px] text-ink-muted">{t('profileHelper')}</p>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex items-start gap-2.5 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={clinical}
            onChange={(e) => setClinical(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-stone text-sage-deep focus:ring-sage"
          />
          <span>
            {t('recordingLabel')}
            <span className="mt-0.5 block text-[13px] text-ink-muted">
              {t('recordingDesc')}
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2.5 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={research}
            onChange={(e) => setResearch(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0 rounded border-stone text-sage-deep focus:ring-sage"
          />
          <span>
            {t('researchLabel')}
            <span className="mt-0.5 block text-[13px] text-ink-muted">
              {t('researchDesc')}
            </span>
          </span>
        </label>
      </div>

      <button
        type="button"
        disabled={!dirty || setConsent.isPending}
        onClick={async () => {
          try {
            await setConsent.mutateAsync({ clinical, research });
            toast.success(t('saved'));
          } catch {
            toast.error(t('saveError'));
          }
        }}
        className="mt-4 rounded-[var(--radius-button)] bg-sage-deep px-5 py-2.5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
      >
        {setConsent.isPending ? t('saving') : t('save')}
      </button>
      <p className="mt-2 text-[12px] leading-relaxed text-ink-muted">
        {t('withdrawNote')}
      </p>
    </div>
  );
}
