'use client';

import { useTranslations } from 'next-intl';

interface VideoConsentSettingsProps {
  clinical: boolean;
  educational: boolean;
  onChange: (next: { clinical: boolean; educational: boolean }) => void;
}

/**
 * Patient video-consent checkboxes (migration 0093). Controlled by the
 * profile page: the two values are staged there and persisted by the
 * page's single "Save changes" button — this component holds no state
 * and has no save button of its own. Wording is a first pass pending
 * study-team / DPO and native-Danish review.
 */
export function VideoConsentSettings({
  clinical,
  educational,
  onChange
}: VideoConsentSettingsProps) {
  const t = useTranslations('videoConsent');

  return (
    <div>
      <h2 className="eyebrow">{t('profileHeading')}</h2>
      <p className="mt-2 text-[12px] text-ink-muted">{t('profileHelper')}</p>

      <div className="mt-3 flex flex-col gap-3">
        <label className="flex items-start gap-2.5 text-[14px] text-ink">
          <input
            type="checkbox"
            checked={clinical}
            onChange={(e) => onChange({ clinical: e.target.checked, educational })}
            className="mt-1 h-4 w-4 shrink-0 rounded border-ink-muted text-sage-deep focus:ring-sage"
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
            checked={educational}
            onChange={(e) => onChange({ clinical, educational: e.target.checked })}
            className="mt-1 h-4 w-4 shrink-0 rounded border-ink-muted text-sage-deep focus:ring-sage"
          />
          <span>
            {t('educationalLabel')}
            <span className="mt-0.5 block text-[13px] text-ink-muted">
              {t('educationalDesc')}
            </span>
          </span>
        </label>
      </div>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
        {t('withdrawNote')}
      </p>
    </div>
  );
}
