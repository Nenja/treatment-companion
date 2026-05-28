'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import { useCurrentClinicianSession } from '@/lib/supabase/clinicianSession';
import {
  usePatientInfo,
  useSetPatientInfo,
  ageFromDob,
  yearsSince,
  type AffectedSide,
  type AmbulationStatus,
  type Etiology
} from '@/lib/supabase/patientInfo';
import { useToast } from '@/components/feedback/Toast';
import { AppShell } from '@/components/layout/AppShell';
import { SkeletonScreen } from '@/components/feedback/SkeletonScreen';

const ETIOLOGY_VALUES: Etiology[] = [
  'stroke',
  'tbi',
  'cerebralPalsy',
  'multipleSclerosis',
  'spinalCordInjury',
  'hereditarySpasticParaplegia',
  'other'
];

const AMBULATION_VALUES: AmbulationStatus[] = [
  'independent',
  'withAid',
  'wheelchair',
  'nonAmbulant'
];

const SIDE_VALUES: AffectedSide[] = ['left', 'right', 'bilateral'];

/**
 * Patient clinical-background page. Accessible to clinicians AND
 * therapists who have an active session for the patient. View + edit
 * the optional structured fields plus free-text background notes.
 * Patients do not see this page.
 */
export default function PatientInfoPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('patientInfo');
  const tEt = useTranslations('etiology');
  const tAmb = useTranslations('ambulation');
  const tSide = useTranslations('side');
  const toast = useToast();

  const { user, profile, loading: authLoading } = useAuth();
  const sessionQuery = useCurrentClinicianSession(
    profile?.id ?? null,
    profile?.role
  );
  const patientId = sessionQuery.data?.patientId ?? null;
  const info = usePatientInfo(patientId);
  const save = useSetPatientInfo();

  // Auth + role gating: clinician or therapist only.
  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (profile.role !== 'clinician' && profile.role !== 'physiotherapist') {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  // Back to the appropriate patient page for the caller's role.
  const back = () => {
    const path =
      profile?.role === 'physiotherapist'
        ? '/physio/patient'
        : '/clinician/patient';
    router.push(locale === 'en' ? path : `/${locale}${path}`);
  };

  const [editing, setEditing] = useState(false);
  const [dob, setDob] = useState('');
  const [etiology, setEtiology] = useState<Etiology | ''>('');
  const [etiologyDetail, setEtiologyDetail] = useState('');
  const [affectedSide, setAffectedSide] = useState<AffectedSide | ''>('');
  const [onsetYear, setOnsetYear] = useState('');
  const [ambulation, setAmbulation] = useState<AmbulationStatus | ''>('');
  const [notes, setNotes] = useState('');

  // Hydrate the form from server data once the query resolves; do this
  // each time editing is entered so the form reflects current values.
  useEffect(() => {
    if (!info.data) return;
    setDob(info.data.dateOfBirth ?? '');
    setEtiology(info.data.etiology ?? '');
    setEtiologyDetail(info.data.etiologyDetail ?? '');
    setAffectedSide(info.data.affectedSide ?? '');
    setOnsetYear(info.data.onsetYear ? String(info.data.onsetYear) : '');
    setAmbulation(info.data.ambulation ?? '');
    setNotes(info.data.backgroundNotes ?? '');
  }, [info.data, editing]);

  const onSave = () => {
    if (!patientId) return;
    const onsetNum = onsetYear.trim() ? parseInt(onsetYear, 10) : NaN;
    save.mutate(
      {
        patientId,
        dateOfBirth: dob.trim() || null,
        etiology: (etiology || null) as Etiology | null,
        etiologyDetail: etiologyDetail.trim() || null,
        affectedSide: (affectedSide || null) as AffectedSide | null,
        onsetYear: Number.isFinite(onsetNum) ? onsetNum : null,
        ambulation: (ambulation || null) as AmbulationStatus | null,
        backgroundNotes: notes.trim() || null
      },
      {
        onSuccess: () => {
          toast.success(t('saved'));
          setEditing(false);
        },
        onError: () => toast.error(t('saveError'))
      }
    );
  };

  if (authLoading || !user || !profile) {
    return (
      <AppShell>
        <SkeletonScreen />
      </AppShell>
    );
  }

  if (sessionQuery.status === 'success' && !sessionQuery.data) {
    // No active session — bounce to the unlock screen for the role.
    const unlockPath =
      profile.role === 'physiotherapist' ? '/physio' : '/clinician';
    router.replace(locale === 'en' ? unlockPath : `/${locale}${unlockPath}`);
    return (
      <AppShell>
        <SkeletonScreen />
      </AppShell>
    );
  }

  if (!info.data) {
    return (
      <AppShell>
        <SkeletonScreen />
      </AppShell>
    );
  }

  const age = ageFromDob(info.data.dateOfBirth);
  const ySince = yearsSince(info.data.onsetYear);

  return (
    <AppShell>
      <button
        type="button"
        onClick={back}
        className="mb-3 inline-flex items-center gap-1 text-[14px] font-semibold text-sage-deep hover:text-ink"
      >
        ← {t('back')}
      </button>

      <h1 className="font-display text-[26px] leading-tight text-ink">
        {info.data.displayName}
      </h1>
      <p className="mt-1 text-[14px] text-ink-muted">{t('subtitle')}</p>

      {!editing ? (
        <>
          <section className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
            <Row label={t('dob')}>
              {info.data.dateOfBirth
                ? `${info.data.dateOfBirth}${
                    age !== null ? ` · ${t('ageYears', { age })}` : ''
                  }`
                : t('notRecorded')}
            </Row>
            <Row label={t('etiology')}>
              {info.data.etiology
                ? tEt(info.data.etiology) +
                  (info.data.etiologyDetail
                    ? ` — ${info.data.etiologyDetail}`
                    : '')
                : t('notRecorded')}
            </Row>
            <Row label={t('affectedSide')}>
              {info.data.affectedSide
                ? tSide(info.data.affectedSide)
                : t('notRecorded')}
            </Row>
            <Row label={t('onsetYear')}>
              {info.data.onsetYear
                ? `${info.data.onsetYear}${
                    ySince !== null
                      ? ` · ${t('yearsSince', { years: ySince })}`
                      : ''
                  }`
                : t('notRecorded')}
            </Row>
            <Row label={t('ambulation')}>
              {info.data.ambulation
                ? tAmb(info.data.ambulation)
                : t('notRecorded')}
            </Row>
            <Row label={t('notes')}>
              {info.data.backgroundNotes ? (
                <span className="whitespace-pre-wrap">
                  {info.data.backgroundNotes}
                </span>
              ) : (
                t('notRecorded')
              )}
            </Row>
          </section>

          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-6 flex h-11 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft"
          >
            {t('edit')}
          </button>
        </>
      ) : (
        <section className="mt-6 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
          <Field label={t('dob')}>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            />
          </Field>
          <Field label={t('etiology')}>
            <select
              value={etiology}
              onChange={(e) => setEtiology(e.target.value as Etiology | '')}
              className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            >
              <option value="">{t('selectPlaceholder')}</option>
              {ETIOLOGY_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tEt(v)}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={etiologyDetail}
              onChange={(e) => setEtiologyDetail(e.target.value)}
              maxLength={500}
              placeholder={t('etiologyDetailPlaceholder')}
              className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            />
          </Field>
          <Field label={t('affectedSide')}>
            <select
              value={affectedSide}
              onChange={(e) =>
                setAffectedSide(e.target.value as AffectedSide | '')
              }
              className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            >
              <option value="">{t('selectPlaceholder')}</option>
              {SIDE_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tSide(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('onsetYear')}>
            <input
              type="number"
              inputMode="numeric"
              value={onsetYear}
              onChange={(e) => setOnsetYear(e.target.value)}
              min={1900}
              max={new Date().getFullYear()}
              placeholder="YYYY"
              className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            />
          </Field>
          <Field label={t('ambulation')}>
            <select
              value={ambulation}
              onChange={(e) =>
                setAmbulation(e.target.value as AmbulationStatus | '')
              }
              className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
            >
              <option value="">{t('selectPlaceholder')}</option>
              {AMBULATION_VALUES.map((v) => (
                <option key={v} value={v}>
                  {tAmb(v)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('notes')}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder={t('notesPlaceholder')}
              className="block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[14px] leading-relaxed text-ink focus:border-sage focus:outline-none"
            />
          </Field>

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={save.isPending}
              className="rounded-[var(--radius-button)] bg-sage-deep px-4 py-2 text-[14px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
            >
              {save.isPending ? '…' : t('save')}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={save.isPending}
              className="rounded-[var(--radius-button)] border border-stone bg-cream px-4 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              {t('cancel')}
            </button>
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Row({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-stone/60 py-2 last:border-b-0">
      <div className="eyebrow">{label}</div>
      <div className="mt-0.5 text-[14px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 last:mb-0">
      <label className="block text-[14px] font-semibold text-ink">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
