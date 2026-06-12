-- Schedule the drip dispatcher (2026-06-12). Run once in the WhatsApp app's
-- Supabase SQL editor, AFTER migration_server_drip.sql and AFTER CRON_SECRET is
-- set on Vercel and the app is deployed.
--
-- Before running, replace the two placeholders below:
--   <APP_URL>      e.g. https://wa.erehomes.ae   (use the PRODUCTION custom
--                  domain — the *.vercel.app host may be gated by Vercel SSO)
--   <CRON_SECRET>  the exact value you set for the CRON_SECRET env var on Vercel

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 5 minutes, POST the dispatcher. It self-secures on the x-cron-secret
-- header, sends whatever drip messages are due, and returns quickly.
select cron.schedule(
  'whatsapp-drip-dispatch',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := '<APP_URL>/api/cron/dispatch',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Useful management commands:
--   select * from cron.job;                                  -- list jobs
--   select * from cron.job_run_details order by start_time desc limit 20;  -- recent runs
--   select cron.unschedule('whatsapp-drip-dispatch');        -- stop it
