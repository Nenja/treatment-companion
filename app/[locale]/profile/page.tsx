'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useUpdateOwnProfile } from '@/lib/supabase/profile';
import { useOwnSex, useSetOwnSex, type Sex } from '@/lib/supabase/patientInfo';
import { useToast } from '@/components/feedback/Toast';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import {
  professionOptions,
  type ProfessionCode
} from '@/lib/professionLabel';

/**
 * Profile & settings page.
 *
 * One place for a signed-in user to see and adjust their own details:
 *   - Name (editable)
 *   - Email (read-only — it is the sign-in identifier)
 *   - Password (a link to the existing reset flow)
 *   - Profession (therapist accounts only — self-editable label)
 *   - Colour appearance (palette + night mode)
 *
 * Text size is deliberately NOT here — it stays in the account menu as
 * an always-one-tap accessibility control. Colours are a settled-once
 * preference and belong on this settings page.
 *
 * Reached from the account menu. Name and profession are saved
 * together via one "Save changes" action; appearance applies
 * immediately on tap (it has its own persistence).
 */
export default function ProfilePage() {
  const router = useRouter();
  const locale = useLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;
  const t = useTranslations('profile');
  const { user, profile, loading } = useAuth();
  const updateProfile = useUpdateOwnProfile();
  const toast = useToast();

  // Patient-only: self-reported sex. Only patient accounts have a
  // patient row, so this section shows for patients alone.
  const isPatient = profile?.role === 'patient';
  const ownSex = useOwnSex(!!isPatient);
  const setOwnSex = useSetOwnSex();
  const tSex = useTranslations('sex');
  const SEX_OPTS: Sex[] = ['female', 'male', 'other', 'preferNotToSay'];

  // Editable fields, seeded from the profile once it loads.
  const [name, setName] = useState('');
  const [profession, setProfession] = useState<ProfessionCode>(
    'physiotherapist'
  );
  const [professionOther, setProfessionOther] = useState('');
  const [seeded, setSeeded] = useState(false);

  // Seed the form from the profile the first time it is available.
  useEffect(() => {
    if (profile && !seeded) {
      setName(profile.displayName ?? '');
      if (profile.profession) {
        setProfession(profile.profession as ProfessionCode);
      }
      setProfessionOther(profile.professionOther ?? '');
      setSeeded(true);
    }
  }, [profile, seeded]);

  // Not signed in → send to login once auth has resolved.
  useEffect(() => {
    if (!loading && !user) {
      router.replace(prefix ? `${prefix}/login` : '/login');
    }
  }, [loading, user, router, prefix]);

  if (loading || !user || !profile) {
    return <div className="min-h-dvh bg-cream" />;
  }

  // The non-physician professional role carries an editable profession.
  const isTherapist = profile.role === 'physiotherapist';

  const nameValid = name.trim().length > 0;
  const professionOtherValid =
    !isTherapist || profession !== 'other' || professionOther.trim().length > 0;
  const canSave = nameValid && professionOtherValid && !updateProfile.isPending;

  const onSave = async () => {
    if (!canSave) return;
    try {
      await updateProfile.mutateAsync({
        displayName: name.trim(),
        // Profession is only sent for therapist accounts; for others it
        // is left untouched (undefined → not written).
        ...(isTherapist
          ? {
              profession,
              professionOther:
                profession === 'other' ? professionOther.trim() : null
            }
          : {})
      });
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
            onClick={() => router.back()}
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

        {/* Name — editable. */}
        <div className="mt-7">
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

        {/* Email — read-only. It is the sign-in identifier. */}
        <div className="mt-6">
          <p className={fieldLabel}>{t('emailLabel')}</p>
          <p className="mt-1.5 rounded-[var(--radius-button)] border border-stone bg-stone-soft px-3 py-2.5 text-[15px] text-ink-soft">
            {user.email ?? '—'}
          </p>
          <p className={fieldHelper}>{t('emailHelper')}</p>
        </div>

        {/* Password — links to the existing reset flow. */}
        <div className="mt-6">
          <p className={fieldLabel}>{t('passwordLabel')}</p>
          <button
            type="button"
            onClick={() =>
              router.push(
                prefix ? `${prefix}/reset-password` : '/reset-password'
              )
            }
            className="mt-1.5 flex h-11 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-4 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            {t('passwordChange')}
          </button>
        </div>

        {/* Profession — therapist accounts only, self-editable. */}
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
              {professionOptions(locale === 'da' ? 'da' : 'en').map(
                (opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.label}
                  </option>
                )
              )}
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

        {/* Sex — patient accounts only. Saves on change via its own
            patient-scoped action (independent of the name/profession
            Save button). */}
        {isPatient && (
          <div className="mt-6">
            <label htmlFor="profile-sex" className={fieldLabel}>
              {t('sexLabel')}
            </label>
            <select
              id="profile-sex"
              value={ownSex.data ?? ''}
              disabled={ownSex.isLoading || setOwnSex.isPending}
              onChange={(e) => {
                const v = (e.target.value || null) as Sex | null;
                setOwnSex.mutate(v, {
                  onSuccess: () => toast.success(t('sexSaved')),
                  onError: () => toast.error(t('sexError'))
                });
              }}
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

        {/* Save — applies name (and profession for therapists). */}
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className="mt-7 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
        >
          {updateProfile.isPending ? t('saving') : t('save')}
        </button>

        {/* Appearance — colour palette + night mode. Applies on tap;
            no Save needed (it has its own persistence). */}
        <div className="mt-10 border-t border-stone/70 pt-7">
          <h2 className="text-[13px] font-semibold text-ink-soft">
            {t('appearanceHeading')}
          </h2>
          <p className={fieldHelper}>{t('appearanceHelper')}</p>
          <div className="mt-3">
            <AppearanceSettings />
          </div>
        </div>
      </main>
    </div>
  );
}
