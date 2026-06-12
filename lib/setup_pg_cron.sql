-- Schedule the drip dispatcher (2026-06-12). Run once in the WhatsApp app's
-- Supabase SQL editor, AFTER migration_server_drip.sql and AFTER CRON_SECRET is
-- set on Vercel and the app is deployed.
--
-- There is NO custom domain, so the app is on a *.vercel.app URL which sits
-- behind Vercel Deployment Protection. We get through it the same way the Twilio
-- status callback does: the x-vercel-protection-bypass query param. So replace
-- THREE placeholders below:
--   <APP_URL>   the production *.vercel.app URL, e.g. https://whatsapp-xyz.vercel.app
--   <CRON_SECRET>   the value set for the CRON_SECRET env var on Vercel
--   <BYPASS>    Vercel → Settings → Deployment Protection → "Protection Bypass
--               for Automation" secret (same one the Twilio callback uses;
--               it's the VERCEL_AUTOMATION_BYPASS_SECRET env var)

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Every 5 minutes, POST the dispatcher. The bypass param clears Vercel's edge
-- protection; the x-cron-secret header is OUR auth inside the route.
select cron.schedule(
  'whatsapp-drip-dispatch',
  '*/5 * * * *',
  $$
  select net.http_post(
    url     := '<APP_URL>/api/cron/dispatch?x-vercel-protection-bypass=<BYPASS>&x-vercel-set-bypass-cookie=true',
    headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
    timeout_milliseconds := 55000
  );
  $$
);

-- Useful management commands:
--   select * from cron.job;                                  -- list jobs
--   select * from cron.job_run_details order by start_time desc limit 20;  -- recent runs
--   select cron.unschedule('whatsapp-drip-dispatch');        -- stop it
