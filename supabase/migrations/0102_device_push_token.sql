-- ============================================================================
-- 0102 — Native device push tokens (Capacitor / FCM).
--
-- The existing push_subscription table (0017) holds *Web Push* subscriptions
-- (endpoint + encryption keys) for the browser/PWA. The native mobile app
-- (Capacitor) uses Firebase Cloud Messaging instead, whose tokens are a single
-- opaque string per device — a different shape — so they live here.
--
-- Plan: use Firebase on BOTH Android and iOS so every device yields an FCM
-- token and the reminder sender has a single delivery path to extend later.
--
-- One row per (user, device). The token is the unique identifier; on a
-- reinstall or token refresh the same row is updated (the app re-registers).
-- ============================================================================

create table device_push_token (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profile(id) on delete cascade,
  token text not null unique,                       -- FCM registration token
  platform text not null check (platform in ('android', 'ios')),
  locale text not null default 'en' check (locale in ('en', 'da')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index device_push_token_profile_id_idx on device_push_token(profile_id);

alter table device_push_token enable row level security;

-- Users manage their own tokens; writes go through the RPC below. The reminder
-- sender uses the service role and bypasses RLS.
create policy device_push_token_self_select
  on device_push_token for select using (profile_id = auth.uid());
create policy device_push_token_self_delete
  on device_push_token for delete using (profile_id = auth.uid());

grant select, delete on device_push_token to authenticated;

-- Register (or refresh) the calling user's device token. Upsert on the token so
-- a refreshed token, or the same device moving to a different account, updates
-- in place rather than duplicating.
create or replace function register_device_push_token(
  p_token text,
  p_platform text,
  p_locale text default 'en'
) returns void as $$
declare
  v_profile uuid;
  v_locale  text;
begin
  v_profile := auth.uid();
  if v_profile is null then
    raise exception 'not authenticated';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'token required';
  end if;
  if p_platform not in ('android', 'ios') then
    raise exception 'invalid platform';
  end if;
  v_locale := case when p_locale in ('en', 'da') then p_locale else 'en' end;

  insert into device_push_token (profile_id, token, platform, locale)
  values (v_profile, p_token, p_platform, v_locale)
  on conflict (token) do update
    set profile_id   = excluded.profile_id,
        platform     = excluded.platform,
        locale       = excluded.locale,
        last_seen_at = now();
end;
$$ language plpgsql security definer;

grant execute on function register_device_push_token(text, text, text) to authenticated;
