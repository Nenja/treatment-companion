'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useUpdateOwnProfile } from '@/lib/supabase/profile';
import {
  useOwnSex,
  useSetOwnSex,
  type Sex,
  useOwnVideoConsent,
  useSetOwnVideoConsent,
  useOwnResearchConsent,
  useSetOwnResearchConsent
} from '@/lib/supabase/patientInfo';
import { useToast } from '@/components/feedback/Toast';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { LanguageSelect, switchLocalePath } from '@/components/settings/LanguageSelect';
import { useSetPreferredLocale, type AppLocale } from '@/lib/supabase/locale';
import { VideoConsentSettings } from '@/components/settings/VideoConsentSettings';
import {
  professionOptions,
  type ProfessionCode
} from '@/lib/professionLabel';

/**
 * Profile & settings page.
 *
 * All form fields — name, profession (therapists), sex, reminder day,
 * and video consent (patients) — are STAGED in local state and written
 * only when the single "Save changes" button (last on the page) is
 * tapped. Nothing auto-saves. If the user tries to leave with unsaved
 * changes (Back, the password link, or closing the tab) they are warned.
 *
 * Appearance (colour palette + night mode) is the one exception: it
 * applies live so the patient can preview it, and persists itself — it
 * is a display preference, not form data, so it is not under Save and
 * not part of the unsaved-changes check.
 */
export default function ProfilePage() {
  const router = useRouter();
  const locale = useLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const t = useTranslations('profile');
  const { user, profile, loading } = useAuth();
  const updateProfile = useUpdateOwnProfile();
  const setPreferredLocale = useSetPreferredLocale();
  const toast = useToast();

  const isPatient = profile?.role === 'patient';
  const isTherapist = profile?.role === 'physiotherapist';

  const ownSex = useOwnSex(!!isPatient);
  const setOwnSex = useSetOwnSex();
  const ownConsent = useOwnVideoConsent(!!isPatient);
  const setOwnConsent = useSetOwnVideoConsent();
  const ownResearch = useOwnResearchConsent(!!isPatient);
  const setOwnResearch = useSetOwnResearchConsent();
  const tRC = useTranslations('researchConsent');
  const tSex = useTranslations('sex');
  const tWeekday = useTranslations('weekday');
  const SEX_OPTS: Sex[] = ['female', 'male', 'other', 'preferNotToSay'];

  // Staged edits — nothing persists until "Save changes".
  const [name, setName] = useState('');
  const [profession, setProfession] = useState<ProfessionCode>(
    'physiotherapist'
  );
  const [professionOther, setProfessionOther] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [reminderDay, setReminderDay] = useState<number | null>(null);
  const [clinical, setClinical] = useState(false);
  const [educational, setEducational] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);

  const [seeded, setSeeded] = useState(false);
  const [baseline, setBaseline] = useState('');

  // When set, a confirm dialog is shown; running it performs the queued
  // navigation (used to guard Back / the password link).
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);

  const snapshot = (v: {
    name: string;
    profession: ProfessionCode;
    professionOther: string;
    sex: Sex | null;
    reminderDay: number | null;
    clinical: boolean;
    educational: boolean;
    researchConsent: boolean;
  }) =>
    JSON.stringify({
      n: v.name.trim(),
      pf: v.profession,
      po: v.professionOther.trim(),
      sx: v.sex,
      rd: v.reminderDay,
      cc: v.clinical,
      ce: v.educational,
      rc: v.researchConsent
    });

  const current = snapshot({
    name,
    profession,
    professionOther,
    sex,
    reminderDay,
    clinical,
    educational,
    researchConsent
  });
  const dirty = seeded && current !== baseline;

  // Everything the user can edit is loaded? (Sex + consent are async
  // patient queries; for non-patients they are disabled and idle.)
  const ready =
    !!profile &&
    (!isPatient ||
      (!ownSex.isLoading && !ownConsent.isLoading && !ownResearch.isLoading));

  // Seed staged state + the baseline once, when ready.
  useEffect(() => {
    if (seeded || !ready || !profile) return;
    const seedVals = {
      name: profile.displayName ?? '',
      profession: (profile.profession as ProfessionCode) ?? 'physiotherapist',
      professionOther: profile.professionOther ?? '',
      sex: (ownSex.data ?? null) as Sex | null,
      reminderDay: profile.notifyWeekday ?? null,
      clinical: ownConsent.data?.clinical ?? false,
      educational: ownConsent.data?.educational ?? false,
      researchConsent: ownResearch.data?.consent ?? false
    };
    setName(seedVals.name);
    setProfession(seedVals.profession);
    setProfessionOther(seedVals.professionOther);
    setSex(seedVals.sex);
    setReminderDay(seedVals.reminderDay);
    setClinical(seedVals.clinical);
    setEducational(seedVals.educational);
    setResearchConsent(seedVals.researchConsent);
    setBaseline(snapshot(seedVals));
    setSeeded(true);
  }, [seeded, ready, profile, ownSex.data, ownConsent.data, ownResearch.data]);

  // Not signed in → send to login once auth has resolved.
  useEffect(() => {
    if (!loading && !user) {
      router.replace(prefix ? `${prefix}/login` : '/login');
    }
  }, [loading, user, router, prefix]);

  // Warn on tab close / refresh with unsaved changes (native prompt —
  // the browser won't let us style this one).
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  if (loading || !user || !profile) {
    return <div className="min-h-dvh bg-cream" />;
  }

  const nameValid = name.trim().length > 0;
  const professionOtherValid =
    !isTherapist || profession !== 'other' || professionOther.trim().length > 0;
  const saving =
    updateProfile.isPending || setOwnSex.isPending || setOwnConsent.isPending;

  // Guard in-app navigation: if there are unsaved changes, queue the nav
  // behind the confirm dialog; otherwise go straight away.
  const attemptLeave = (nav: () => void) => {
    if (dirty) setPendingLeave(() => nav);
    else nav();
  };

  // Locale-aware home for this role, in the CURRENT locale (so after a
  // language switch Back returns to the correctly-localed home rather than
  // the English `/` the old router.back() landed on).
  const roleHome =
    profile.role === 'clinician'
      ? '/clinician'
      : profile.role === 'physiotherapist'
        ? '/physio'
        : '/';
  const homeHref =
    locale === 'en'
      ? roleHome
      : `/${locale}${roleHome === '/' ? '' : roleHome}`;

  // Language: persist the choice (awaited, so the write can't be lost to
  // the page unload) and THEN reload into the new locale. Routed through
  // attemptLeave so unsaved form edits are confirmed first.
  const chooseLanguage = (target: AppLocale) => {
    const go = async () => {
      try {
        await setPreferredLocale.mutateAsync(target);
      } catch {
        // Persisting is best-effort; still switch the visible language.
      }
      window.location.assign(
        switchLocalePath(window.location.pathname, locale, target)
      );
    };
    attemptLeave(() => {
      void go();
    });
  };

  const onSave = async () => {
    if (!dirty || saving) return;
    if (!nameValid) {
      toast.error(t('nameRequired'));
      return;
    }
    if (!professionOtherValid) {
      toast.error(t('professionOtherRequired'));
      return;
    }
    const saved = current;
    try {
      await updateProfile.mutateAsync({
        displayName: name.trim(),
        ...(isTherapist
          ? {
              profession,
              professionOther:
                profession === 'other' ? professionOther.trim() : null
            }
          : {}),
        ...(isPatient ? { notifyWeekday: reminderDay } : {})
      });
      if (isPatient) {
        await setOwnSex.mutateAsync(sex);
        await setOwnConsent.mutateAsync({ clinical, educational });
        await setOwnResearch.mutateAsync({ consent: researchConsent });
      }
      setBaseline(saved);
      toast.success(t('saved'));
    } catch {
      toast.error(t('saveError'));
    }
  };

  const fieldLabel = 'block text-[13px] font-semibold text-ink-soft';
  const fieldHelper = 'mt-0.5 text-[12px] text-ink-muted';
  const inputClass =
    'mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none';

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[480px] items-center px-5 py-4">
          <button
            type="button"
            onClick={() => attemptLeave(() => router.push(homeHref))}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            {t('back')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[480px] px-5 py-8">
        <h1 className="font-display text-[26px] leading-tight text-ink">
          {t('title')}
        </h1>

        {/* Account */}
        <p className="eyebrow mt-7">{t('sectionAccount')}</p>

        {/* Name */}
        <div className="mt-4">
          <label htmlFor="profile-name" className={fieldLabel}>
            {t('nameLabel')}
          </label>
          <input
            id="profile-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className={inputClass}
          />
          <p className={fieldHelper}>{t('nameHelper')}</p>
          {!nameValid && name.length > 0 && (
            <p className="mt-1 text-[13px] text-amber-deep">
              {t('nameRequired')}
            </p>
          )}
        </div>

        {/* Email — read-only, plain text. */}
        <div className="mt-5">
          <p className={fieldLabel}>{t('emailLabel')}</p>
          <p className="mt-1 text-[15px] text-ink">{user.email ?? '\u2014'}</p>
          <p className={fieldHelper}>{t('emailHelper')}</p>
        </div>

        {/* Password — links to the existing reset flow. */}
        <div className="mt-5">
          <p className={fieldLabel}>{t('passwordLabel')}</p>
          <button
            type="button"
            onClick={() =>
              attemptLeave(() =>
                router.push(
                  prefix ? `${prefix}/reset-password` : '/reset-password'
                )
              )
            }
            className="mt-1.5 flex h-10 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('passwordChange')}
          </button>
        </div>

        {/* Profession — therapist accounts only. */}
        {isTherapist && (
          <div className="mt-6">
            <label htmlFor="profile-profession" className={fieldLabel}>
              {t('professionLabel')}
            </label>
            <select
              id="profile-profession"
              value={profession}
              onChange={(e) => setProfession(e.target.value as ProfessionCode)}
              className={`${inputClass} font-semibold`}
            >
              {professionOptions(locale === 'da' ? 'da' : 'en').map((opt) => (
                <option key={opt.code} value={opt.code}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className={fieldHelper}>{t('professionHelper')}</p>
            {profession === 'other' && (
              <>
                <input
                  type="text"
                  value={professionOther}
                  onChange={(e) => setProfessionOther(e.target.value)}
                  placeholder={t('professionOtherPlaceholder')}
                  maxLength={60}
                  className={inputClass}
                />
                {!professionOtherValid && (
                  <p className="mt-1 text-[13px] text-amber-deep">
                    {t('professionOtherRequired')}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* About you — patient accounts only (sex + reminder day). */}
        {isPatient && (
          <div className="mt-9 border-t border-stone/70 pt-7">
            <p className="eyebrow">{t('sectionAbout')}</p>
          </div>
        )}

        {/* Sex — patient accounts only. */}
        {isPatient && (
          <div className="mt-5">
            <label htmlFor="profile-sex" className={fieldLabel}>
              {t('sexLabel')}
            </label>
            <select
              id="profile-sex"
              value={sex ?? ''}
              disabled={ownSex.isLoading}
              onChange={(e) => setSex((e.target.value || null) as Sex | null)}
              className={inputClass}
            >
              <option value="">{t('sexUnset')}</option>
              {SEX_OPTS.map((v) => (
                <option key={v} value={v}>
                  {tSex(v)}
                </option>
              ))}
            </select>
            <p className={fieldHelper}>{t('sexHelper')}</p>
          </div>
        )}

        {/* Reminder day — patient accounts only. */}
        {isPatient && (
          <div className="mt-6">
            <label htmlFor="profile-reminder-day" className={fieldLabel}>
              {t('reminderDayLabel')}
            </label>
            <select
              id="profile-reminder-day"
              value={reminderDay ?? ''}
              onChange={(e) =>
                setReminderDay(
                  e.target.value === '' ? null : Number(e.target.value)
                )
              }
              className={inputClass}
            >
              <option value="" disabled>
                {t('reminderDayUnset')}
              </option>
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <option key={d} value={d}>
                  {tWeekday(`long.${d}`)}
                </option>
              ))}
            </select>
            <p className={fieldHelper}>{t('reminderDayHelper')}</p>
          </div>
        )}

        {/* Video consent — patient accounts only. Staged here; saved by
            the page's Save button. */}
        {isPatient && (
          <div className="mt-10 border-t border-stone/70 pt-7">
            <h2 className="eyebrow">{tRC('patientHeading')}</h2>
            <p className="mt-2 text-[12px] text-ink-muted">
              {tRC('patientHelper')}
            </p>
            <label className="mt-3 flex items-start gap-2.5 text-[14px] text-ink">
              <input
                type="checkbox"
                checked={researchConsent}
                onChange={(e) => setResearchConsent(e.target.checked)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-stone text-sage-deep focus:ring-sage"
              />
              <span>
                {tRC('label')}
                <span className="mt-0.5 block text-[13px] text-ink-muted">
                  {tRC('desc')}
                </span>
              </span>
            </label>
            <p className="mt-4 text-[12px] leading-relaxed text-ink-muted">
              {tRC('withdrawNote')}
            </p>
          </div>
        )}

        {isPatient && (
          <div className="mt-10 border-t border-stone/70 pt-7">
            <VideoConsentSettings
              clinical={clinical}
              educational={educational}
              onChange={(next) => {
                setClinical(next.clinical);
                setEducational(next.educational);
              }}
            />
          </div>
        )}

        {/* Language — applies live and persists itself; not under Save. */}
        <div className="mt-10 border-t border-stone/70 pt-7">
          <p className="eyebrow">{t('sectionLanguage')}</p>
          <div className="mt-3">
            <LanguageSelect variant="cards" onChoose={chooseLanguage} />
          </div>
        </div>

        {/* Appearance — colour palette + night mode. Applies live and
            persists itself; not under Save. */}
        <div className="mt-10 border-t border-stone/70 pt-7">
          <p className="eyebrow">{t('sectionAccessibility')}</p>
          <p className="mt-2 text-[12px] text-ink-muted">{t('appearanceHelper')}</p>
          <div className="mt-3">
            <AppearanceSettings />
          </div>
        </div>

        {/* Save — the single write for every form field above. Disabled
            until something changes. Last on the page. */}
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="mt-10 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? t('saving') : t('save')}
        </button>
      </main>

      {/* Unsaved-changes guard for in-app navigation. */}
      {pendingLeave && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/45 px-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-title"
        >
          <div className="w-full max-w-[360px] rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
            <h2 id="leave-title" className="font-display text-[18px] text-ink">
              {t('leaveTitle')}
            </h2>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
              {t('leaveBody')}
            </p>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setPendingLeave(null)}
                className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                {t('leaveCancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const nav = pendingLeave;
                  setPendingLeave(null);
                  nav?.();
                }}
                className="flex h-11 flex-1 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-4 text-[14px] font-semibold text-on-accent hover:bg-ink-soft"
              >
                {t('leaveConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
