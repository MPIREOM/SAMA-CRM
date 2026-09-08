-- ============================================================================
-- SAMA — Migration 0007 — Scheduled-message dispatcher trigger
-- pg_cron + pg_net call the app's /api/cron/dispatch every 10 minutes as a
-- belt-and-braces companion to Vercel Cron (vercel.json, every 15 minutes).
-- Both are idempotent: the dispatcher locks rows before sending.
-- URL and bearer secret are read from bk_settings('cron') at run time, so
-- changing the deployed domain only needs a settings update.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  perform cron.unschedule('bk-dispatch-10min');
exception
  when others then null;
end $$;

select cron.schedule(
  'bk-dispatch-10min',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select value->>'dispatch_url' from public.bk_settings where key = 'cron'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value->>'secret' from public.bk_settings where key = 'cron')
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
