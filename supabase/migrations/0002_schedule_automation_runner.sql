-- ============================================================================
-- SAMA CRM — Migration 0002
-- Schedule the automation-runner Edge Function daily via pg_cron + pg_net.
-- 05:00 UTC = 09:00 Asia/Muscat (a polite morning send time).
--
-- NOTE: the Bearer token below is the project's PUBLISHABLE anon key (safe to
-- commit). The Edge Function itself uses the service-role key from its own
-- environment; the anon JWT only satisfies the function gateway's JWT check.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-schedule idempotently.
do $$
begin
  perform cron.unschedule('sama-automation-runner-daily');
exception
  when others then null; -- job did not exist yet
end $$;

select cron.schedule(
  'sama-automation-runner-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://vsxesrhoovabgsmvodvh.supabase.co/functions/v1/automation-runner',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzeGVzcmhvb3ZhYmdzbXZvZHZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzMTQzODksImV4cCI6MjA5Nzg5MDM4OX0.kxf8ywEdoUGtCuofVLgLAHPrguoyLafrn-JJEIMsnF4'
    ),
    body := '{}'::jsonb
  );
  $$
);
