'use client';

import { useRouter } from 'next/navigation';

/**
 * Privacy & data information page.
 *
 * Plain-language explanation, for patients, of what data the app holds,
 * why, the legal basis, who can see it, the companies that help run the
 * service, where it is stored, how long it is kept, and how to exercise
 * data-protection rights.
 *
 * IMPORTANT — this is a WORKING DRAFT, not a finished legal privacy
 * notice. It is written to be accurate to how the app actually works, so
 * that a qualified data-protection adviser (DPO / legal) can review and
 * finalise it. Items only the data controller can supply are marked with
 * square brackets, e.g. [controller], [DPO contact], [retention period].
 * The editable source for this text is docs/PRIVACY_NOTICE_DRAFT.md, and
 * the related internal assessment is docs/DPIA.md. Danish / Swedish /
 * Norwegian versions must be prepared (by a qualified translator, not
 * machine-translated) before the app is used beyond the pilot.
 */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-[18px] text-ink">{title}</h2>
      <div className="mt-2 space-y-2 text-[15px] leading-relaxed text-ink-soft">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  const router = useRouter();

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
          Your data and privacy
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          This page explains, in plain language, what information this app
          holds about you, why, and the choices and rights you have. If
          anything here is unclear, your clinic can answer questions about
          your data.
        </p>

        <Section title="Who is responsible for your data">
          <p>
            The organisation responsible for your data (the data controller)
            is [controller — legal entity and address]. You can reach the
            person responsible for data protection at [DPO / data-protection
            contact]. For questions about your treatment, contact your clinic.
          </p>
        </Section>

        <Section title="What this app stores">
          <p>
            The app keeps a small amount of account information — your name,
            email address, and basic details such as your year of birth and
            sex.
          </p>
          <p>
            It keeps health information related to your spasticity treatment:
            your condition and which side of the body is affected; the
            treatment goals you and your care team agree; the weekly ratings
            and comments you enter; and the treatments your physician records,
            including the medicines, doses, and the muscles treated, and any
            pump or dose adjustments.
          </p>
          <p>
            Where your clinic uses them, it may also keep short videos of your
            movements (only with your separate agreement) and readings from a
            wearable activity sensor. Notes that your care team writes about
            your care are also stored.
          </p>
        </Section>

        <Section title="Why your data is collected">
          <p>
            Your weekly check-ins help your care team understand how your
            treatment is working between visits, so they can support and
            adjust your care. The information is used to provide your care.
          </p>
          <p>
            Separately, and only if you choose, a pseudonymised copy of your
            data may be used for approved research — this is described further
            below.
          </p>
        </Section>

        <Section title="The legal basis">
          <p>
            Your health information is processed so that your clinicians can
            provide your health care. Reminder notifications are sent only if
            you turn them on. Any use of your data for research relies on a
            separate legal basis and your separate agreement. [The exact legal
            bases under the GDPR and Danish law are to be confirmed by the
            data-protection adviser.]
          </p>
        </Section>

        <Section title="Who can see your data">
          <p>
            Your physician can see your goals and check-ins. A physiotherapist
            involved in your care can see them when you have shared access. A
            professional can only open your information after you give them a
            visit code, and that access is limited.
          </p>
          <p>
            Other patients can never see anything about you. A small technical
            team keeps the service running and may access data only as needed
            to do so, under a duty of confidentiality. Notes written between
            your professionals for your care are not shown to other patients.
          </p>
        </Section>

        <Section title="Companies that help run the service">
          <p>
            The app relies on a few service providers that process data on the
            controller’s behalf: a cloud database and file-storage provider and
            an application-hosting provider (used to store and run the service),
            and an error-monitoring service that helps find technical faults.
          </p>
          <p>
            To deliver reminder notifications, the app uses the notification
            service built into your phone or browser. These reminders contain
            only a generic message (for example, “Weekly check-in”) and never
            any health details. Some providers may process limited technical
            data outside the EU under approved safeguards. [The providers,
            their locations, and the safeguards are to be confirmed by the
            data-protection adviser.]
          </p>
        </Section>

        <Section title="Where your data is stored">
          <p>
            Your information is stored on secure cloud services located in the
            European Union [region to be confirmed].
          </p>
        </Section>

        <Section title="Use for research">
          <p>
            If you agree separately, a pseudonymised copy of your data — labelled
            only with a study code, not your name — may be used for approved
            scientific research. You can decline without affecting your care, and
            you can withdraw your agreement later.
          </p>
        </Section>

        <Section title="How long your data is kept">
          <p>
            Your data is kept for as long as it is needed for your care and for
            as long as the law requires medical records to be retained
            [retention period to be confirmed]. Research data is kept for the
            period set out for the relevant study.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            You can ask to see the information held about you, to correct it, to
            have it deleted (where this is not prevented by rules on keeping
            medical records), to restrict how it is used, to receive a copy, and
            to object to certain uses. Where processing relies on your agreement
            — for example for videos or research — you can withdraw that
            agreement.
          </p>
          <p>
            To exercise any of these rights, contact your clinic or [DPO /
            data-protection contact]. You also have the right to complain to
            Datatilsynet, the Danish Data Protection Agency.
          </p>
        </Section>

        <section className="mt-7 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-4">
          <p className="text-[14px] leading-relaxed text-ink-muted">
            This is a working draft, provided during the pilot stage. It
            describes how the app works today and is awaiting review by a
            qualified data-protection adviser. The responsible organisation,
            contact details, retention periods, and Danish, Swedish, and
            Norwegian translations will be finalised before the app is used
            more widely.
          </p>
        </section>
      </main>
    </div>
  );
}
