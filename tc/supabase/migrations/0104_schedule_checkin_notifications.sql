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
-- PORTABILITY / CI: pg_cron and pg_net only exist on servers that ship them
-- (Supabase does; a vanilla Postgres / the CI image does not). This migration
-- GUARDS on extension availability, so it applies cleanly everywhere: on a
-- server without pg_cron it simply no-ops with a NOTICE and creates no job.
-- In production, run it where the extensions are available (enable them first
-- in Dashboard -> Database -> Extensions if needed) and it creates the job.
--
-- IDEMPOTENT: re-running drops and recreates the single named job.
-- ---------------------------------------------------------------------------

-- 1) Install the extensions only if this server actually provides them.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

-- 2) Schedule the daily job only if pg_cron is actually installed now.
--    07:00 UTC daily (~08:00-09:00 Danish local, depending on DST). Keep it
--    DAILY so every patient's chosen weekday is honoured by the function's
--    own logic. On a server without pg_cron this branch is skipped (NOTICE).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'send-checkin-notifications-daily') then
      perform cron.unschedule('send-checkin-notifications-daily');
    end if;

    perform cron.schedule(
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

    raise notice 'pg_cron: scheduled daily send-checkin-notifications (07:00 UTC).';
  else
    raise notice 'pg_cron not available on this server; skipping reminder schedule. Enable pg_cron + pg_net in production and re-run this migration.';
  end if;
end $$;
