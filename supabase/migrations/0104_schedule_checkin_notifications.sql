-- 0104_schedule_checkin_notifications.sql
-- ---------------------------------------------------------------------------
-- Daily trigger for the `send-checkin-notifications` Edge Function.
--
-- The function (deployed SEPARATELY via the Supabase dashboard — it is not part
-- of the GitHub -> Vercel flow) self-selects, each UTC day, the patients whose
-- `notify_weekday` matches today and sends their due reminders (initial +
-- ~6-day follow-up). So it only needs ONE invocation per day; it decides
-- who/what. This migration sets up that daily invocation with pg_cron + pg_net.
--
-- SECRETS ARE READ FROM SUPABASE VAULT BY NAME — never hard-coded here, so no
-- secret ever lands in the repo. Before this job can work you must store two
-- vault secrets ONCE (run those by hand in the SQL editor — see BUILD.txt;
-- do NOT commit them):
--     cron_secret    -> the CRON_SECRET the function checks (sent as
--                       Authorization: Bearer <cron_secret>)
--     checkin_fn_url -> https://<project-ref>.supabase.co/functions/v1/send-checkin-notifications
--
-- Requires the pg_cron and pg_net extensions. If the CREATE EXTENSION lines
-- error under your role, enable them first in
-- Dashboard -> Database -> Extensions, then re-run this file.
--
-- IDEMPOTENT: re-running drops and recreates the single named job.
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any previous copy of this job so the migration is safe to re-run.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'send-checkin-notifications-daily') then
    perform cron.unschedule('send-checkin-notifications-daily');
  end if;
end $$;

-- 07:00 UTC daily (~08:00-09:00 Danish local, depending on DST). Adjust the
-- cron expression if you want a different time, but keep it DAILY so every
-- patient's chosen weekday is honoured by the function's own logic.
select cron.schedule(
  'send-checkin-notifications-daily',
  '0 7 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'checkin_fn_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);
