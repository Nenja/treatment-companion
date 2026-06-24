-- ============================================================================
-- 0017 — Push subscription table.
--
-- Stores Web Push subscriptions for patients who have opted in.
-- One row per (patient, device/browser) since a single patient might
-- install the PWA on multiple devices.
--
-- The endpoint is the unique identifier — it's the URL the push service
-- (FCM/APNs proxy) uses to deliver to that specific browser. p256dh
-- and auth are the encryption keys needed to send the payload.
-- ============================================================================

create table push_subscription (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  -- The push service endpoint URL; unique per device/browser install.
  endpoint text not null unique,
  -- Encryption keys from the PushSubscription object.
  p256dh text not null,
  auth text not null,
  -- Locale we caught at subscription time, so notifications can be
  -- localised even if the patient isn't currently signed in.
  locale text not null default 'en'
    check (locale in ('en', 'da')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index push_subscription_profile_id_idx
  on push_subscription(profile_id);

alter table push_subscription enable row level security;

-- Patients can manage their own subscriptions; clinicians/admins don't
-- need to touch this table directly. The admin API routes use the
-- service role and bypass RLS entirely.

create policy push_subscription_self_select
  on push_subscription for select
  using (profile_id = auth.uid());

create policy push_subscription_self_insert
  on push_subscription for insert
  with check (profile_id = auth.uid());

create policy push_subscription_self_delete
  on push_subscription for delete
  using (profile_id = auth.uid());

-- Grants for the regular client roles (the public-schema grant
-- migration 0005 added usage for anon/authenticated already; this is
-- the table-level grant for the new table).
grant select, insert, delete on push_subscription to authenticated;
