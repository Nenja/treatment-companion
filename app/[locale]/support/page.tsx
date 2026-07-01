'use client';

import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

/**
 * Help & support page (public).
 *
 * The simplest support surface for the pilot: a contact route and a few
 * common-question answers — no ticketing, no stored messages, no DB.
 * Support is fielded by a shared clinic inbox, set via the public env var
 * NEXT_PUBLIC_SUPPORT_EMAIL. When it isn't set, the page degrades to a
 * neutral "your clinic will give you the address" line rather than a
 * broken mailto.
 *
 * It is intentionally a PUBLIC route (see PUBLIC_PREFIXES in
 * lib/supabase/auth.tsx and the SetupGate exempt list): a locked-out user
 * must be able to reach it, and the app stores + privacy notice need a
 * stable support URL. It deliberately carries two things a patient-facing
 * clinical app needs — a "not for medical emergencies" notice, and the
 * GDPR access/erasure route (pointed at the same inbox).
 *
 * Danish strings are a first pass, flagged for native clinical review.
 */

const SUPPORT_EMAIL = (process.env.NEXT_PUBLIC_SUPPORT_EMAIL || '').trim();

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[18px] text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

export default function SupportPage() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('support');
  const prefix = locale === 'en' ? '' : `/${locale}`;

  const mailtoHref = SUPPORT_EMAIL
    ? `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(t('emailSubject'))}`
    : null;

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[560px] items-center px-5 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            {t('back')}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[560px] px-5 py-8">
        <h1 className="font-display text-[26px] leading-tight text-ink">
          {t('title')}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {t('intro')}
        </p>

        {/* Not for emergencies — a safety notice every patient-facing
            clinical surface needs. Styled as the app's amber caution block. */}
        <div
          className="mt-6 rounded-[var(--radius-card)] border border-amber-deep/40 bg-amber-soft px-4 py-3.5"
          role="note"
        >
          <p className="font-display text-[16px] text-ink">
            {t('emergencyTitle')}
          </p>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink">
            {t('emergencyBody')}
          </p>
        </div>

        {/* Contact the clinic inbox. */}
        <Section title={t('contactTitle')}>
          <p>{t('contactBody')}</p>
          {mailtoHref ? (
            <a
              href={mailtoHref}
              className="mt-2 inline-flex h-12 items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[16px] font-semibold text-on-accent hover:bg-ink-soft"
            >
              {t('emailButton')}
            </a>
          ) : (
            <p className="mt-2 text-[15px] text-ink-muted">{t('noEmailFallback')}</p>
          )}
        </Section>

        {/* A couple of common questions, with links to the existing flows. */}
        <Section title={t('faqTitle')}>
          <p className="font-semibold text-ink">{t('faqSigninQ')}</p>
          <p>
            {t('faqSigninBody')}{' '}
            <Link
              href={`${prefix}/forgot-password`}
              className="font-semibold text-sage-deep hover:text-ink"
            >
              {t('faqSigninLink')}
            </Link>
          </p>
          <p className="mt-3 font-semibold text-ink">{t('faqDataQ')}</p>
          <p>{t('faqDataBody')}</p>
        </Section>

        {/* GDPR route — access / erasure, via the same inbox. */}
        <Section title={t('dataTitle')}>
          <p>{t('dataBody')}</p>
          <p>
            <Link
              href={`${prefix}/privacy`}
              className="font-semibold text-sage-deep hover:text-ink"
            >
              {t('dataPrivacyLink')}
            </Link>
          </p>
        </Section>
      </main>
    </div>
  );
}
