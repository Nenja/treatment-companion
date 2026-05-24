'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

/**
 * Privacy & data information page.
 *
 * Plain-language explanation, for patients, of what data the app holds,
 * why, who can see it, where it is stored, and how to ask for access
 * or deletion. Reachable from the account menu and the login screen.
 *
 * IMPORTANT — this is honest pilot-stage information, NOT a finished
 * legal privacy policy. It describes how the app actually works and
 * states plainly that formal review is pending. A privacy policy that
 * meets GDPR / Danish health-data requirements must be written and
 * reviewed by someone qualified before any non-pilot use; this page is
 * a placeholder for that, deliberately not pretending to be it.
 */
export default function PrivacyPage() {
  const router = useRouter();
  const locale = useLocale();
  const prefix = locale === 'en' ? '' : `/${locale}`;

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[560px] items-center px-5 py-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            Back
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[560px] px-5 py-8">
        <h1 className="font-display text-[26px] leading-tight text-ink">
          Your data
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          This page explains, in plain language, what information this
          app holds about you and how it is used. If anything here is
          unclear, ask your clinic — they can answer questions about
          your data.
        </p>

        <section className="mt-7">
          <h2 className="font-display text-[18px] text-ink">
            What this app stores
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            The app keeps the treatment goals you and your care team set,
            the weekly ratings you enter, any notes you add, and a small
            amount of account information such as your name and email.
            It also keeps a record of your treatments as entered by your
            physician.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-[18px] text-ink">
            Why it is collected
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Your weekly check-ins help your care team understand how
            your treatment is going between visits. The information is
            used to support your care — nothing more.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-[18px] text-ink">
            Who can see it
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Your physician and, where involved in your care, your
            physiotherapist can see your goals and check-ins. Other
            patients cannot see anything about you. A professional can
            only access your information after you give them a visit
            code.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-[18px] text-ink">
            Where it is stored
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            Your information is stored on secure servers located in the
            European Union.
          </p>
        </section>

        <section className="mt-6">
          <h2 className="font-display text-[18px] text-ink">
            Seeing or removing your data
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
            You can ask to see the information the app holds about you,
            or ask for it to be removed. To do either, contact your
            clinic and they will arrange it for you.
          </p>
        </section>

        <section className="mt-7 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
          <p className="text-[14px] leading-relaxed text-ink-muted">
            This app is currently in a pilot stage. The information on
            this page describes how the app works today. A full privacy
            policy will be provided before the app is used more widely.
          </p>
        </section>
      </main>
    </div>
  );
}
