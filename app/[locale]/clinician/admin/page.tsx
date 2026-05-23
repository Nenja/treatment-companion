'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useAdminAccounts,
  useCreateAccount,
  useSetAdmin,
  generateTempPassword,
  type AdminAccount
} from '@/lib/supabase/admin';
import { AccountMenu } from '@/components/layout/AccountMenu';
import { useToast } from '@/components/feedback/Toast';
import { SkeletonBlock } from '@/components/feedback/Skeleton';
import { classifyError } from '@/lib/feedback';

/**
 * Clinician-facing admin: create new patient/clinician accounts and
 * see a list of who exists. Lives at /clinician/admin.
 *
 * Auth gating is enforced both client-side (redirect non-clinicians)
 * and server-side (the API routes verify the caller's role).
 *
 * Created accounts get a randomly-generated temporary password that
 * is shown ONCE on screen for the admin to communicate out-of-band.
 * The patient/clinician changes it via the standard "forgot password"
 * flow at their next sign-in (or directly in Supabase for now).
 */
export default function AdminPage() {
  const router = useRouter();
  const locale = useLocale();
  const { user, profile, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user || !profile) {
      router.replace(locale === 'en' ? '/login' : `/${locale}/login`);
      return;
    }
    if (!profile.isAdmin) {
      router.replace(locale === 'en' ? '/' : `/${locale}`);
    }
  }, [authLoading, user, profile, router, locale]);

  const accountsQuery = useAdminAccounts(
    !!profile && profile.isAdmin
  );

  if (authLoading || !profile || !profile.isAdmin) {
    return <div className="min-h-dvh bg-cream" />;
  }

  return (
    <div className="min-h-dvh bg-cream">
      <header className="border-b border-stone/70 bg-cream-soft/50">
        <div className="mx-auto flex max-w-[640px] items-center justify-between px-5 py-4">
          <button
            type="button"
            onClick={() =>
              router.push(
                locale === 'en' ? '/clinician' : `/${locale}/clinician`
              )
            }
            className="text-[14px] font-semibold text-ink-soft hover:text-ink"
          >
            ← Back
          </button>
          <span className="eyebrow">Admin</span>
          <AccountMenu />
        </div>
      </header>

      <main className="mx-auto max-w-[640px] px-5 pb-16 pt-6">
        <h1 className="font-display text-[24px] leading-tight text-ink">
          Admin
        </h1>
        <p className="mt-1 text-[14px] text-ink-soft">
          Create new patient or clinician accounts and review the
          account list.
        </p>

        <CreateAccountSection />

        <section className="mt-10">
          <h2 className="font-display text-[18px] text-ink">Accounts</h2>
          {accountsQuery.isLoading && (
            <ul className="mt-3 divide-y divide-stone overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream-soft">
              {[0, 1, 2].map((i) => (
                <li key={i} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <SkeletonBlock width="w-2/5" height="h-4" />
                      <SkeletonBlock width="w-3/5" height="h-3" />
                    </div>
                    <SkeletonBlock width="w-16" height="h-4" shape="rounded-full" />
                  </div>
                  <SkeletonBlock width="w-1/3" height="h-3" className="mt-1.5" />
                </li>
              ))}
            </ul>
          )}
          {accountsQuery.isError && (
            <p className="mt-3 text-[14px] text-amber-deep">
              Could not load accounts: {(accountsQuery.error as Error).message}
            </p>
          )}
          {accountsQuery.data && (
            <AccountsList accounts={accountsQuery.data} />
          )}
        </section>
      </main>
    </div>
  );
}

function CreateAccountSection() {
  const create = useCreateAccount();
  const toast = useToast();
  const tFeedback = useTranslations('feedback');

  const [role, setRole] = useState<
    'patient' | 'clinician' | 'physiotherapist'
  >('patient');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [createdInfo, setCreatedInfo] = useState<{
    email: string;
    role: string;
    tempPassword: string;
  } | null>(null);

  // Generate an initial password on first render. The admin can edit
  // or regenerate before submitting.
  useEffect(() => {
    if (!tempPassword) setTempPassword(generateTempPassword());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSubmit =
    email.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    displayName.trim() &&
    tempPassword.length >= 8 &&
    !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const res = await create.mutateAsync({
        role,
        email: email.trim(),
        displayName: displayName.trim(),
        tempPassword,
        isAdmin: makeAdmin
      });
      setCreatedInfo({
        email: res.email,
        role: res.role,
        tempPassword
      });
      toast.success(tFeedback('successAccountCreated'));
      // Reset form for the next account.
      setEmail('');
      setDisplayName('');
      setMakeAdmin(false);
      setTempPassword(generateTempPassword());
    } catch (err) {
      // Error already surfaces in create.error and is shown inline,
      // but also show a toast so it's visible regardless of scroll.
      toast.error(tFeedback(classifyError(err)));
    }
  };

  return (
    <section className="mt-8 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
      <h2 className="font-display text-[18px] text-ink">Create account</h2>

      {createdInfo && (
        <div className="mt-4 rounded-[var(--radius-button)] border border-sage/30 bg-sage-soft/40 p-4">
          <p className="font-display text-[15px] text-ink">
            Account created: {createdInfo.email}
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            Role: {createdInfo.role}. Share the temporary password with
            them; they should change it at first sign-in.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="block flex-1 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 font-mono text-[14px] text-ink">
              {createdInfo.tempPassword}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(createdInfo.tempPassword);
              }}
              className="flex h-10 items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream px-3 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedInfo(null)}
            className="mt-3 text-[14px] font-semibold text-ink-muted hover:text-ink-soft"
          >
            Dismiss
          </button>
        </div>
      )}

      <Field label="Role">
        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setRole('patient')}
            className={`rounded-[var(--radius-button)] border px-3 py-3 text-left text-[14px] font-semibold ${
              role === 'patient'
                ? 'border-sage bg-sage-soft text-sage-deep'
                : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
            }`}
          >
            Patient
          </button>
          <button
            type="button"
            onClick={() => setRole('clinician')}
            className={`rounded-[var(--radius-button)] border px-3 py-3 text-left text-[14px] font-semibold ${
              role === 'clinician'
                ? 'border-sage bg-sage-soft text-sage-deep'
                : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
            }`}
          >
            Physician
          </button>
          <button
            type="button"
            onClick={() => setRole('physiotherapist')}
            className={`rounded-[var(--radius-button)] border px-3 py-3 text-left text-[14px] font-semibold ${
              role === 'physiotherapist'
                ? 'border-sage bg-sage-soft text-sage-deep'
                : 'border-stone bg-cream text-ink-soft hover:bg-stone-soft'
            }`}
          >
            Physiotherapist
          </button>
        </div>
      </Field>

      <Field label="Email" helper="Will be the sign-in identifier.">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          className={inputClasses}
          placeholder="patient@example.com"
        />
      </Field>

      <Field
        label="Display name"
        helper="Shown to the clinician in the patient list and the patient view."
      >
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="off"
          className={inputClasses}
          maxLength={80}
        />
      </Field>

      <Field
        label="Temporary password"
        helper="Auto-generated. Share with the new user. They should change it at first sign-in."
      >
        <div className="flex items-stretch gap-2">
          <input
            type="text"
            value={tempPassword}
            onChange={(e) => setTempPassword(e.target.value)}
            autoComplete="off"
            className={`${inputClasses} font-mono`}
          />
          <button
            type="button"
            onClick={() => setTempPassword(generateTempPassword())}
            className="flex h-[44px] items-center justify-center rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft"
          >
            Regenerate
          </button>
        </div>
      </Field>

      {create.isError && (
        <p className="mt-3 text-[14px] text-amber-deep">
          {(create.error as Error).message}
        </p>
      )}

      {/* Admin capability — orthogonal to the role above. */}
      <label className="mt-5 flex items-start gap-3">
        <input
          type="checkbox"
          checked={makeAdmin}
          onChange={(e) => setMakeAdmin(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-sage-deep"
        />
        <span>
          <span className="block text-[14px] font-semibold text-ink">
            Also make this account an admin
          </span>
          <span className="block text-[13px] text-ink-muted">
            Admins can create accounts and manage admin access. This is
            separate from the role above.
          </span>
        </span>
      </label>

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-cream-soft hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-muted"
      >
        {create.isPending ? '…' : 'Create account'}
      </button>
    </section>
  );
}

function AccountsList({ accounts }: { accounts: AdminAccount[] }) {
  const setAdmin = useSetAdmin();
  const { user } = useAuth();
  const toast = useToast();

  if (accounts.length === 0) {
    return (
      <p className="mt-3 text-[14px] text-ink-muted">No accounts yet.</p>
    );
  }

  const toggleAdmin = (a: AdminAccount) => {
    setAdmin.mutate(
      { profileId: a.id, isAdmin: !a.isAdmin },
      {
        onError: (err) =>
          toast.error(
            (err as Error).message ?? 'Could not update admin status.'
          )
      }
    );
  };

  return (
    <ul className="mt-3 divide-y divide-stone overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream-soft">
      {accounts.map((a) => {
        const isSelf = user?.id === a.id;
        return (
          <li key={a.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[15px] text-ink">
                  {a.displayName || '(no name)'}
                </p>
                <p className="truncate text-[14px] text-ink-soft">
                  {a.email}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {a.isAdmin && (
                  <span className="rounded-full border border-sage/50 bg-sage-soft px-2 py-0.5 text-[12px] uppercase tracking-wider text-sage-deep">
                    Admin
                  </span>
                )}
                <span className="rounded-full border border-stone bg-cream px-2 py-0.5 text-[14px] uppercase tracking-wider text-ink-muted">
                  {a.role}
                </span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-[14px] text-ink-muted">
                Created {new Date(a.createdAt).toLocaleDateString()}
              </p>
              {/* Admin toggle. A user cannot revoke their own admin
                  access — the server enforces this too. */}
              <button
                type="button"
                disabled={
                  setAdmin.isPending || (isSelf && a.isAdmin)
                }
                onClick={() => toggleAdmin(a)}
                className="shrink-0 rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {a.isAdmin ? 'Remove admin' : 'Make admin'}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const inputClasses =
  'mt-1.5 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2.5 text-[15px] text-ink placeholder:text-ink-muted focus:border-sage focus:outline-none';

function Field({
  label,
  helper,
  children
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6">
      <label className="block text-[14px] font-semibold text-ink">
        {label}
      </label>
      {helper && <p className="mt-1 text-[14px] text-ink-muted">{helper}</p>}
      {children}
    </div>
  );
}
