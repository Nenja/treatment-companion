'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { requestTutorialReplay } from '@/lib/tutorialReplay';
import { LanguageSelect, switchLocalePath } from '@/components/settings/LanguageSelect';
import { VersionTag } from '@/components/layout/VersionTag';
import { useSetPreferredLocale, type AppLocale } from '@/lib/supabase/locale';
import { VideoConsentSettings } from '@/components/settings/VideoConsentSettings';
import { WearableConnectPanel } from '@/components/patient/WearableConnectPanel';
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
  const tAppearance = useTranslations('appearance');
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

  // Per-section unsaved-change flags, so a collapsed section can flag that
  // it holds edits (an "Edited" chip) without the user opening it.
  const base =
    seeded && baseline
      ? (JSON.parse(baseline) as {
          n: string;
          pf: ProfessionCode;
          po: string;
          sx: Sex | null;
          rd: number | null;
          cc: boolean;
          ce: boolean;
          rc: boolean;
        })
      : null;
  const detailsDirty =
    !!base &&
    (name.trim() !== base.n ||
      sex !== base.sx ||
      (isTherapist &&
        (profession !== base.pf || professionOther.trim() !== base.po)));
  const shareDirty =
    !!base &&
    (researchConsent !== base.rc ||
      clinical !== base.cc ||
      educational !== base.ce);
  const detailsSummary = [name.trim(), user.email ?? '']
    .filter(Boolean)
    .join(' \u00B7 ');

  // Undo: revert every staged field to the last-saved baseline. Nothing is
  // written; `dirty` then goes false and the save bar hides.
  const discardChanges = () => {
    if (!base) return;
    setName(base.n);
    setProfession(base.pf);
    setProfessionOther(base.po);
    setSex(base.sx);
    setReminderDay(base.rd);
    setClinical(base.cc);
    setEducational(base.ce);
    setResearchConsent(base.rc);
  };

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
      // Pin the locale via NEXT_LOCALE BEFORE navigating, so the detection
      // middleware doesn't bounce an unprefixed (English) target back to the
      // previous locale — the "can't switch back to English" bug. Set first
      // (synchronously) so it holds even if the persist write is slow/fails.
      document.cookie = `NEXT_LOCALE=${target}; path=/; max-age=31536000; samesite=lax`;
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
    'mt-1.5 block w-full rounded-[var(--radius-button)] border border-ink-muted bg-cream-soft px-3 py-2.5 text-[15px] text-ink focus:border-sage focus:outline-none';

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

      <main className={`mx-auto max-w-[480px] px-5 py-8 ${dirty ? 'pb-28' : ''}`}>
        <h1 className="font-display text-[26px] leading-tight text-ink">
          {t('title')}
        </h1>

        {/* Reminders — patient only. Staged (saved by the bar below). */}
        {isPatient && (
          <div className="mt-7">
            <p className="eyebrow">{t('sectionReminders')}</p>
            <div className="mt-4">
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
          </div>
        )}

        {/* Language — applies live and persists itself; not under Save. */}
        <div
          className={
            isPatient ? 'mt-10 border-t border-stone/70 pt-7' : 'mt-7'
          }
        >
          <div className="flex items-baseline justify-between gap-3">
            <p className="eyebrow">{t('sectionLanguage')}</p>
            <span className="text-[11px] font-medium text-ink-muted">
              {t('savesAutomatically')}
            </span>
          </div>
          <div className="mt-3">
            <LanguageSelect variant="cards" onChoose={chooseLanguage} />
          </div>
        </div>

        {/* Appearance — colour palette + night mode. Applies live; collapsed
            by default. Quick text-size + night mode also live in the account
            menu, so the full palette here is fine to tuck away. */}
        <CollapsibleSection
          title={t('sectionAccessibility')}
          summary={t('appearanceHelper')}
          hint={t('savesAutomatically')}
        >
          <AppearanceSettings />
        </CollapsibleSection>

        {/* Your details — identity, changed rarely. Collapsed by default. */}
        <CollapsibleSection
          title={t('sectionDetails')}
          summary={detailsSummary}
          edited={detailsDirty}
          editedLabel={t('edited')}
        >
          <div>
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

          <div className="mt-5">
            <p className={fieldLabel}>{t('emailLabel')}</p>
            <p className="mt-1 text-[15px] text-ink">{user.email ?? '—'}</p>
            <p className={fieldHelper}>{t('emailHelper')}</p>
          </div>

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

          {isTherapist && (
            <div className="mt-6">
              <label htmlFor="profile-profession" className={fieldLabel}>
                {t('professionLabel')}
              </label>
              <select
                id="profile-profession"
                value={profession}
                onChange={(e) =>
                  setProfession(e.target.value as ProfessionCode)
                }
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

          {isPatient && (
            <div className="mt-6">
              <label htmlFor="profile-sex" className={fieldLabel}>
                {t('sexLabel')}
              </label>
              <select
                id="profile-sex"
                value={sex ?? ''}
                disabled={ownSex.isLoading}
                onChange={(e) =>
                  setSex((e.target.value || null) as Sex | null)
                }
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
        </CollapsibleSection>

        {/* What you share — the three sharing controls consolidated under
            one heading. Patient only. Research + video are staged (saved by
            the bar); the wearable connects on its own. Wording unchanged. */}
        {isPatient && (
          <CollapsibleSection
            title={t('sectionSharing')}
            summary={t('sharingSummary')}
            edited={shareDirty}
            editedLabel={t('edited')}
          >
            <p className="text-[13px] leading-relaxed text-ink-muted">
              {t('sharingIntro')}
            </p>

            <div className="mt-5">
              <h2 className="eyebrow">{tRC('patientHeading')}</h2>
              <p className="mt-2 text-[12px] text-ink-muted">
                {tRC('patientHelper')}
              </p>
              <label className="mt-3 flex items-start gap-2.5 text-[14px] text-ink">
                <input
                  type="checkbox"
                  checked={researchConsent}
                  onChange={(e) => setResearchConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-ink-muted text-sage-deep focus:ring-sage"
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

            <div className="mt-6 border-t border-stone/60 pt-6">
              <VideoConsentSettings
                clinical={clinical}
                educational={educational}
                onChange={(next) => {
                  setClinical(next.clinical);
                  setEducational(next.educational);
                }}
              />
            </div>

            {/* Wearable connects on its own and renders nothing when the
                feature is off, so no forced divider here. */}
            <div className="mt-6">
              <WearableConnectPanel />
            </div>
          </CollapsibleSection>
        )}

        {/* Help — replay the onboarding walkthrough. */}
        <div className="mt-10 border-t border-stone/70 pt-7">
          <p className="eyebrow">{t('sectionHelp')}</p>
          <p className="mt-2 text-[12px] text-ink-muted">
            {t('tutorialReplayHelper')}
          </p>
          <button
            type="button"
            onClick={() =>
              attemptLeave(() => {
                requestTutorialReplay();
                window.location.assign(homeHref);
              })
            }
            className="mt-3 inline-flex h-11 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-4 text-[14px] font-semibold text-ink hover:bg-stone-soft"
          >
            {tAppearance('showTutorialAgain')}
          </button>
        </div>

        <VersionTag className="mt-10 block text-center text-[11px] text-ink-muted" />
      </main>

      {/* Sticky save bar — appears only when there are unsaved form edits, so
          its presence IS the "you have changes to save" signal. The self-saving
          sections (language, appearance, wearable) never trigger it. */}
      {seeded && dirty && (
        <div className="fixed inset-x-0 bottom-0 z-[110] border-t border-stone bg-cream/95 px-5 py-3 shadow-[0_-2px_12px_rgba(31,36,33,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-[480px] items-center gap-2.5">
            <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-amber-deep">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-amber-deep"
                aria-hidden
              />
              <span className="truncate">{t('unsavedChanges')}</span>
            </span>
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving}
              className="ml-auto flex h-11 shrink-0 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('discard')}
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="flex h-11 shrink-0 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? t('saving') : t('save')}
            </button>
          </div>
        </div>
      )}

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

function CollapsibleSection({
  title,
  summary,
  hint,
  edited,
  editedLabel,
  defaultOpen = false,
  children
}: {
  title: string;
  summary?: string;
  hint?: string;
  edited?: boolean;
  editedLabel?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-10 border-t border-stone/70 pt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="eyebrow">{title}</span>
          {!open && summary && (
            <span className="mt-1 block truncate text-[13px] text-ink-muted">
              {summary}
            </span>
          )}
        </span>
        {edited && editedLabel ? (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-amber-deep">
            <span
              className="h-1.5 w-1.5 rounded-full bg-amber-deep"
              aria-hidden
            />
            {editedLabel}
          </span>
        ) : hint ? (
          <span className="shrink-0 text-[11px] font-medium text-ink-muted">
            {hint}
          </span>
        ) : null}
        <svg
          aria-hidden
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-ink-soft transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      {open && <div className="mt-5">{children}</div>}
    </div>
  );
}
