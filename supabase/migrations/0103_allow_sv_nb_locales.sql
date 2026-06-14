-- 0103: allow Swedish (sv) and Norwegian Bokmål (nb) as the in-app UI language.
--
-- The initial schema (0001) constrained profile.preferred_locale to ('en','da').
-- Widen it so the login/profile language picker can store the two new locales.
--
-- NOTE: the push-token locale checks (push_subscription in 0017,
-- device_push_token in 0102) and the register_device_push_token clamp are left
-- as-is for now — push reminder TEXT is not yet localized to sv/nb, so those
-- tokens continue to fall back to en/da. Relaxing them is a separate follow-up
-- that goes together with localizing the send-checkin-notifications edge fn.
alter table profile drop constraint if exists profile_preferred_locale_check;
alter table profile
  add constraint profile_preferred_locale_check
  check (preferred_locale in ('en', 'da', 'sv', 'nb'));
