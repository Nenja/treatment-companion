'use client';

import { useTranslations } from 'next-intl';

interface VideoConsentSettingsProps {
  clinical: boolean;
  research: boolean;
  onChange: (next: { clinical: boolean; research: boolean }) => void;
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
  research,
  onChange
}: VideoConsentSettingsProps) {
  const t = useTranslations('videoConsent');

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
            onChange={(e) => onChange({ clinical: e.target.checked, research })}
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
            onChange={(e) => onChange({ clinical, research: e.target.checked })}
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

      <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
        {t('withdrawNote')}
      </p>
    </div>
  );
}
