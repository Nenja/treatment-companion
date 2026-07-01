'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useOwnVideoConsent,
  useSetOwnVideoConsent
} from '@/lib/supabase/patientInfo';

/**
 * Gates the patient's at-home video recording on their own clinical video
 * consent (migration 0093). If consent isn't on file, it shows an informed
 * consent prompt (record + optional research) and only reveals the recorder
 * once the patient consents. Consent can be withdrawn later in their profile.
 *
 * NOTE: the consent wording here is a first pass and must be reviewed by the
 * study team / DPO (and a native Danish speaker) before real use.
 */
export function PatientVideoConsentGate({
  children
}: {
  children: React.ReactNode;
}) {
  const t = useTranslations('videoConsent');
  const consent = useOwnVideoConsent(true);
  const setConsent = useSetOwnVideoConsent();
  const [educational, setEducational] = useState(false);

  if (consent.isLoading) {
    return <p className="text-[14px] text-ink-muted">{t('loading')}</p>;
  }
  if (consent.data?.clinical) {
    return <>{children}</>;
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
      <p className="font-display text-[18px] leading-tight text-ink">
        {t('gateTitle')}
      </p>
      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
        {t('intro')}
      </p>
      <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
        {t('recordingDesc')}
      </p>
      <label className="mt-3 flex items-start gap-2.5 text-[14px] text-ink">
        <input
          type="checkbox"
          checked={educational}
          onChange={(e) => setEducational(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 rounded border-ink-muted text-sage-deep focus:ring-sage"
        />
        <span>
          {t('educationalLabel')}
          <span className="mt-0.5 block text-[13px] text-ink-muted">
            {t('educationalDesc')}
          </span>
        </span>
      </label>
      <button
        type="button"
        disabled={setConsent.isPending}
        onClick={() =>
          void setConsent.mutateAsync({ clinical: true, educational })
        }
        className="mt-4 rounded-[var(--radius-button)] bg-sage-deep px-5 py-2.5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-60"
      >
        {setConsent.isPending ? t('saving') : t('consentCta')}
      </button>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-muted">
        {t('withdrawNote')}
      </p>
    </div>
  );
}
