'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/lib/supabase/auth';
import {
  useAdminAccounts,
  useCreateAccount,
  useSetAdmin,
  useUpdateAccount,
  useSetAccountStatus,
  useDeleteAccount,
  useResetPassword,
  useActiveAccess,
  generateTempPassword,
  type AdminAccount,
  type ActiveAccessSession
} from '@/lib/supabase/admin';
import { useToast } from '@/components/feedback/Toast';
import { SkeletonBlock } from '@/components/feedback/Skeleton';
import { classifyError } from '@/lib/feedback';
import {
  professionOptions,
  professionLabel,
  type ProfessionCode
} from '@/lib/professionLabel';

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
  const tAdmin = useTranslations('admin');
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
      <AppHeader
        maxWidthClass="max-w-[640px]"
        back={{
          label: 'Back',
          onClick: () =>
            router.push(locale === 'en' ? '/clinician' : `/${locale}/clinician`)
        }}
        middle={
          <span className="eyebrow block truncate text-center">
            {tAdmin('eyebrow')}
          </span>
        }
      />

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
          <h2 className="font-display text-[18px] text-ink">{tAdmin('accountsTitle')}</h2>
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
              {tAdmin('accountsLoadError', { error: (accountsQuery.error as Error).message })}
            </p>
          )}
          {accountsQuery.data && (
            <AccountsList accounts={accountsQuery.data} />
          )}
        </section>

        <AccessSection enabled={!!profile && profile.isAdmin} />
      </main>
    </div>
  );
}

function CreateAccountSection() {
  const create = useCreateAccount();
  const toast = useToast();
  const tFeedback = useTranslations('feedback');
  const tAdmin = useTranslations('admin');
  const locale = useLocale();

  const [role, setRole] = useState<
    'patient' | 'clinician' | 'physiotherapist'
  >('patient');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [makeAdmin, setMakeAdmin] = useState(false);
  // Profession label for the non-physician professional role. Only
  // meaningful when role === 'physiotherapist'.
  const [profession, setProfession] = useState<ProfessionCode>(
    'physiotherapist'
  );
  const [professionOther, setProfessionOther] = useState('');
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
    // When the therapist role has profession "other", a free-text
    // description is required so the export reads meaningfully.
    !(
      role === 'physiotherapist' &&
      profession === 'other' &&
      !professionOther.trim()
    ) &&
    !create.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const res = await create.mutateAsync({
        role,
        email: email.trim(),
        displayName: displayName.trim(),
        tempPassword,
        isAdmin: makeAdmin,
        // Profession only applies to the non-physician professional
        // role; sent as null otherwise so the server stores nothing.
        profession: role === 'physiotherapist' ? profession : null,
        professionOther:
          role === 'physiotherapist' && profession === 'other'
            ? professionOther.trim()
            : null
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
      setProfession('physiotherapist');
      setProfessionOther('');
      setTempPassword(generateTempPassword());
    } catch (err) {
      // Error already surfaces in create.error and is shown inline,
      // but also show a toast so it's visible regardless of scroll.
      toast.error(tFeedback(classifyError(err)));
    }
  };

  return (
    <section className="mt-8 rounded-[var(--radius-card)] border border-stone bg-cream-soft p-5">
      <h2 className="font-display text-[18px] text-ink">{tAdmin('createAccount')}</h2>

      {createdInfo && (
        <div className="mt-4 rounded-[var(--radius-button)] border border-sage/30 bg-sage-soft/40 p-4">
          <p className="font-display text-[15px] text-ink">
            {tAdmin('accountCreated', { email: createdInfo.email })}
          </p>
          <p className="mt-1 text-[14px] text-ink-soft">
            {tAdmin('accountCreatedRole', { role: createdInfo.role })}
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
              {tAdmin('copyPassword')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreatedInfo(null)}
            className="mt-3 text-[14px] font-semibold text-ink-muted hover:text-ink-soft"
          >
            {tAdmin('dismiss')}
          </button>
        </div>
      )}

      <Field label={tAdmin('roleLabel')}>
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
            {tAdmin('roleTherapist')}
            <span className="block text-[12px] font-normal text-ink-muted">
              {tAdmin('roleTherapistHint')}
            </span>
          </button>
        </div>
      </Field>

      {/* Profession label — applies only to the therapist role. It is a
          display label (shown on screen and in the EHR export), not a
          permission. */}
      {role === 'physiotherapist' && (
        <Field
          label={tAdmin('professionLabel')}
          helper={tAdmin('professionHelper')}
        >
          <select
            value={profession}
            onChange={(e) =>
              setProfession(e.target.value as ProfessionCode)
            }
            className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-3 text-[14px] font-semibold text-ink focus:border-sage focus:outline-none"
          >
            {professionOptions(locale === 'da' ? 'da' : 'en').map((opt) => (
              <option key={opt.code} value={opt.code}>
                {opt.label}
              </option>
            ))}
          </select>
          {profession === 'other' && (
            <input
              type="text"
              value={professionOther}
              onChange={(e) => setProfessionOther(e.target.value)}
              placeholder={tAdmin('professionOtherPlaceholder')}
              maxLength={60}
              className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2.5 text-[14px] text-ink focus:border-sage focus:outline-none"
            />
          )}
        </Field>
      )}

      <Field label={tAdmin('emailLabel')} helper="Will be the sign-in identifier.">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="off"
          className={inputClasses}
          placeholder={tAdmin('emailPlaceholder')}
        />
      </Field>

      <Field
        label={tAdmin('displayNameLabel')}
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
        label={tAdmin('tempPasswordLabel')}
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
        className="mt-6 flex h-12 w-full items-center justify-center rounded-[var(--radius-button)] bg-sage-deep px-5 text-[15px] font-semibold text-on-accent hover:bg-ink-soft disabled:cursor-not-allowed disabled:bg-stone disabled:text-ink-soft"
      >
        {create.isPending ? '…' : tAdmin('createAccount')}
      </button>
    </section>
  );
}

const PAGE_SIZE = 20;

function AccountsList({ accounts }: { accounts: AdminAccount[] }) {
  const tAdmin = useTranslations('admin');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<
    'all' | 'patient' | 'clinician' | 'physiotherapist' | 'admin'
  >('all');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all');
  const [page, setPage] = useState(1);

  // Filter + search entirely client-side. The list is loaded in full,
  // which is fine at pilot scale; if the account count grows large,
  // this is the point to move to server-side search and pagination.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) => {
      if (q) {
        const hay = `${a.displayName} ${a.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter === 'admin') {
        if (!a.isAdmin) return false;
      } else if (roleFilter !== 'all') {
        if (a.role !== roleFilter) return false;
      }
      if (statusFilter === 'active' && a.deactivatedAt) return false;
      if (statusFilter === 'inactive' && !a.deactivatedAt) return false;
      return true;
    });
  }, [accounts, search, roleFilter, statusFilter]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  // Any filter change resets to the first page so results stay visible.
  const onSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const selectClass =
    'rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] text-ink';

  if (accounts.length === 0) {
    return (
      <p className="mt-3 text-[14px] text-ink-muted">{tAdmin('noAccounts')}</p>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={tAdmin('searchPlaceholder')}
          className="flex-1 rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] text-ink"
        />
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value as typeof roleFilter);
            setPage(1);
          }}
          className={selectClass}
        >
          <option value="all">{tAdmin('filterRoleAll')}</option>
          <option value="patient">{tAdmin('filterRolePatient')}</option>
          <option value="clinician">{tAdmin('filterRoleClinician')}</option>
          <option value="physiotherapist">
            {tAdmin('filterRoleTherapist')}
          </option>
          <option value="admin">{tAdmin('filterRoleAdmin')}</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className={selectClass}
        >
          <option value="all">{tAdmin('filterStatusAll')}</option>
          <option value="active">{tAdmin('filterStatusActive')}</option>
          <option value="inactive">{tAdmin('filterStatusInactive')}</option>
        </select>
      </div>

      <p className="mt-2 text-[13px] text-ink-muted">
        {tAdmin('resultsCount', {
          shown: filtered.length,
          total: accounts.length
        })}
      </p>

      {filtered.length === 0 ? (
        <p className="mt-3 text-[14px] text-ink-muted">
          {tAdmin('noMatches')}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-stone overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream-soft">
          {pageItems.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:text-ink-muted"
          >
            {tAdmin('prevPage')}
          </button>
          <span className="text-[13px] text-ink-muted">
            {tAdmin('pageOf', { page: safePage, pages })}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages, p + 1))}
            disabled={safePage >= pages}
            className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:text-ink-muted"
          >
            {tAdmin('nextPage')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Active-access panel — admin/auditor visibility into who can currently
 * see a patient's record. Collapsed by default (it's a secondary,
 * occasionally-checked view); expanding it loads the live session list.
 * Read-only: this surfaces access, it does not yet revoke it.
 */
function AccessSection({ enabled }: { enabled: boolean }) {
  const tAdmin = useTranslations('admin');
  const [open, setOpen] = useState(false);
  const accessQuery = useActiveAccess(enabled && open);

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[18px] text-ink">
          {tAdmin('accessTitle')}
        </h2>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
        >
          {open ? tAdmin('accessHide') : tAdmin('accessShow')}
        </button>
      </div>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">
        {tAdmin('accessIntro')}
      </p>

      {open && (
        <div className="mt-3">
          {accessQuery.isLoading && (
            <p className="text-[14px] text-ink-muted">
              {tAdmin('accessLoading')}
            </p>
          )}
          {accessQuery.isError && (
            <p className="text-[14px] text-amber-deep">
              {tAdmin('accessError')}
            </p>
          )}
          {accessQuery.data && accessQuery.data.length === 0 && (
            <p className="text-[14px] text-ink-muted">
              {tAdmin('accessNone')}
            </p>
          )}
          {accessQuery.data && accessQuery.data.length > 0 && (
            <ul className="divide-y divide-stone overflow-hidden rounded-[var(--radius-card)] border border-stone bg-cream-soft">
              {accessQuery.data.map((sess: ActiveAccessSession) => (
                <li key={sess.sessionId} className="px-4 py-3 text-[14px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="font-semibold text-ink">
                      {sess.professionalName}
                    </span>
                    <span className="text-[13px] text-ink-muted">
                      {tAdmin('accessColSince')}: {fmt(sess.lastActivityAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-ink-soft">
                    {tAdmin('accessColPatient')}: {sess.patientName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One account in the admin list. Collapsed, it shows name, email,
 * role, and status badges. Expanded, it reveals a detail + management
 * panel: full profile info, an edit form (name, profession), the
 * admin toggle, deactivate/reactivate, and permanent delete.
 *
 * Destructive and sensitive actions each confirm before acting, and
 * the server enforces the same guard rails (no self-deactivation,
 * last-admin protection, typed-confirm for delete).
 */
function AccountRow({ account: a }: { account: AdminAccount }) {
  const tAdmin = useTranslations('admin');
  const { user } = useAuth();
  const toast = useToast();
  const locale = useLocale();
  const setAdmin = useSetAdmin();
  const updateAccount = useUpdateAccount();
  const setStatus = useSetAccountStatus();
  const deleteAccount = useDeleteAccount();
  const resetPassword = useResetPassword();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a.displayName);
  const [profession, setProfession] = useState<ProfessionCode>(
    (a.profession as ProfessionCode) ?? 'physiotherapist'
  );
  const [professionOther, setProfessionOther] = useState(
    a.professionOther ?? ''
  );
  // Permanent-delete gate: the admin must type the email to confirm.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteTyped, setDeleteTyped] = useState('');

  const isSelf = user?.id === a.id;
  const isDeactivated = a.deactivatedAt !== null;
  const isTherapist = a.role === 'physiotherapist';

  const onResetPassword = () => {
    resetPassword.mutate(
      { profileId: a.id },
      {
        onSuccess: (res) =>
          toast.success(
            tAdmin('passwordResetDone', { password: res.tempPassword })
          ),
        onError: (err) =>
          toast.error((err as Error).message ?? tAdmin('passwordResetError'))
      }
    );
  };

  const onSaveEdit = () => {
    if (name.trim().length === 0) {
      toast.error(tAdmin('nameEmpty'));
      return;
    }
    updateAccount.mutate(
      {
        profileId: a.id,
        displayName: name.trim(),
        ...(isTherapist
          ? {
              profession,
              professionOther:
                profession === 'other' ? professionOther.trim() : null
            }
          : {})
      },
      {
        onSuccess: () => {
          toast.success(tAdmin('accountUpdated'));
          setEditing(false);
        },
        onError: (err) =>
          toast.error((err as Error).message ?? tAdmin('couldNotUpdate'))
      }
    );
  };

  const onToggleAdmin = () => {
    setAdmin.mutate(
      { profileId: a.id, isAdmin: !a.isAdmin },
      {
        onError: (err) =>
          toast.error((err as Error).message ?? tAdmin('couldNotUpdate'))
      }
    );
  };

  const onToggleStatus = () => {
    setStatus.mutate(
      { profileId: a.id, deactivate: !isDeactivated },
      {
        onSuccess: () =>
          toast.success(
            isDeactivated ? tAdmin('accountReactivated') : tAdmin('accountDeactivated')
          ),
        onError: (err) =>
          toast.error((err as Error).message ?? tAdmin('couldNotUpdate'))
      }
    );
  };

  const onConfirmDelete = () => {
    deleteAccount.mutate(
      { profileId: a.id },
      {
        onSuccess: () => toast.success(tAdmin('accountDeleted')),
        onError: (err) =>
          toast.error((err as Error).message ?? tAdmin('couldNotDelete'))
      }
    );
  };

  const detailRow = (label: string, value: string) => (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-[13px] text-ink text-right">{value}</span>
    </div>
  );

  return (
    <li className={`px-4 py-3 ${isDeactivated ? 'opacity-70' : ''}`}>
      {/* Collapsed header — tap to expand. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[15px] text-ink">
            {a.displayName || '(no name)'}
          </span>
          <span className="block truncate text-[14px] text-ink-soft">
            {a.email}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {isDeactivated && (
            <span className="rounded-full border border-amber-deep/40 bg-amber-soft px-2 py-0.5 text-[12px] uppercase tracking-wider text-amber-deep">
              Inactive
            </span>
          )}
          {a.isAdmin && (
            <span className="rounded-full border border-sage/50 bg-sage-soft px-2 py-0.5 text-[12px] uppercase tracking-wider text-sage-deep">
              Admin
            </span>
          )}
          <span className="rounded-full border border-stone bg-cream px-2 py-0.5 text-[13px] uppercase tracking-wider text-ink-muted">
            {a.role}
          </span>
          <span
            aria-hidden
            className={`text-[14px] text-ink-muted transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          >
            ▾
          </span>
        </span>
      </button>

      {open && (
        <div className="mt-3 border-t border-stone/70 pt-3">
          {/* --- Profile detail --- */}
          {!editing && (
            <div className="rounded-[var(--radius-button)] bg-cream px-3 py-2">
              {detailRow(tAdmin('colName'), a.displayName || '(no name)')}
              {detailRow(tAdmin('colEmail'), a.email)}
              {detailRow(tAdmin('colRole'), a.role)}
              {isTherapist &&
                detailRow(
                  tAdmin('colProfession'),
                  professionLabel(
                    a.profession,
                    a.professionOther,
                    locale === 'da' ? 'da' : 'en'
                  ) ?? '—'
                )}
              {detailRow(
                tAdmin('colCreated'),
                new Date(a.createdAt).toLocaleDateString()
              )}
              {detailRow(
                tAdmin('colStatus'),
                isDeactivated
                  ? `Deactivated ${new Date(
                      a.deactivatedAt as string
                    ).toLocaleDateString()}`
                  : tAdmin('statusActive')
              )}
            </div>
          )}

          {/* --- Edit form --- */}
          {editing && (
            <div className="rounded-[var(--radius-button)] bg-cream px-3 py-3">
              <label className="block text-[13px] font-semibold text-ink-soft">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
              />
              {isTherapist && (
                <div className="mt-3">
                  <label className="block text-[13px] font-semibold text-ink-soft">
                    Profession
                  </label>
                  <select
                    value={profession}
                    onChange={(e) =>
                      setProfession(e.target.value as ProfessionCode)
                    }
                    className="mt-1 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] font-semibold text-ink focus:border-sage focus:outline-none"
                  >
                    {professionOptions(locale === 'da' ? 'da' : 'en').map(
                      (opt) => (
                        <option key={opt.code} value={opt.code}>
                          {opt.label}
                        </option>
                      )
                    )}
                  </select>
                  {profession === 'other' && (
                    <input
                      type="text"
                      value={professionOther}
                      onChange={(e) => setProfessionOther(e.target.value)}
                      placeholder={tAdmin('describeProfession')}
                      maxLength={60}
                      className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-2 text-[14px] text-ink focus:border-sage focus:outline-none"
                    />
                  )}
                </div>
              )}
              <p className="mt-2 text-[12px] text-ink-muted">
                Role cannot be changed here. To change a role, deactivate
                this account and create a new one.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onSaveEdit}
                  disabled={updateAccount.isPending}
                  className="rounded-[var(--radius-button)] bg-sage-deep px-3 py-1.5 text-[13px] font-semibold text-on-accent hover:bg-ink-soft disabled:opacity-50"
                >
                  {updateAccount.isPending ? tAdmin('saving') : tAdmin('save')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setName(a.displayName);
                  }}
                  className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* --- Actions --- */}
          {!editing && !confirmingDelete && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
              >
                {tAdmin('edit')}
              </button>
              <button
                type="button"
                onClick={onToggleAdmin}
                disabled={setAdmin.isPending || (isSelf && a.isAdmin)}
                className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {a.isAdmin ? tAdmin('removeAdmin') : tAdmin('makeAdmin')}
              </button>
              <button
                type="button"
                onClick={onResetPassword}
                disabled={resetPassword.isPending}
                className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetPassword.isPending
                  ? tAdmin('resettingPassword')
                  : tAdmin('resetPassword')}
              </button>
              <button
                type="button"
                onClick={onToggleStatus}
                disabled={setStatus.isPending || (isSelf && !isDeactivated)}
                className="rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDeactivated ? tAdmin('reactivate') : tAdmin('deactivate')}
              </button>
              {!isSelf && (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingDelete(true);
                    setDeleteTyped('');
                  }}
                  className="rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft px-3 py-1.5 text-[13px] font-semibold text-amber-deep hover:bg-amber-soft/70"
                >
                  Delete…
                </button>
              )}
            </div>
          )}

          {/* --- Permanent-delete confirmation --- */}
          {confirmingDelete && (
            <div className="mt-3 rounded-[var(--radius-button)] border border-amber-deep/40 bg-amber-soft/60 px-3 py-3">
              <p className="text-[13px] font-semibold text-ink">
                Permanently delete this account?
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
                This cannot be undone. It deletes the account and all of
                its data — for a patient, that includes every treatment
                cycle and check-in. Consider deactivating instead.
                To confirm, type the email below.
              </p>
              <input
                type="text"
                value={deleteTyped}
                onChange={(e) => setDeleteTyped(e.target.value)}
                placeholder={a.email}
                className="mt-2 block w-full rounded-[var(--radius-button)] border border-stone bg-cream px-3 py-2 text-[13px] text-ink focus:border-sage focus:outline-none"
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={
                    deleteTyped.trim() !== a.email || deleteAccount.isPending
                  }
                  className="rounded-[var(--radius-button)] bg-amber-deep px-3 py-1.5 text-[13px] font-semibold text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleteAccount.isPending
                    ? tAdmin('deleting')
                    : tAdmin('permanentlyDelete')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-[var(--radius-button)] border border-stone bg-cream-soft px-3 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-stone-soft"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </li>
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
