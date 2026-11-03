-- ============================================================================
-- 0014 — First-party website analytics (no cookies, no third parties)
--
-- One row per guest-site event, written only by the app's /api/bk/track route
-- with the service role. Privacy model:
--   • no IP address is stored — visitor_id is a SHA-256 of (IP, user agent,
--     day, server secret), so it changes every day and cannot be reversed;
--   • session_id is a random id kept in the browser's sessionStorage (not a
--     cookie) and gone when the tab closes;
--   • country comes from the hosting edge (two-letter code), never a city.
-- Staff read it through the back-office (service role); anon/authenticated
-- have no access.
-- ============================================================================

create table if not exists public.bk_web_events (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  kind          text not null default 'pageview' check (kind in ('pageview', 'booking_review')),
  visitor_id    text not null,
  session_id    text not null,
  path          text not null,               -- without query string, e.g. /en/book
  page_type     text not null default 'other' check (page_type in
                  ('home', 'rooms', 'room', 'results', 'booking', 'confirmation', 'manage', 'content', 'other')),
  locale        text,
  referrer_host text,                        -- e.g. www.google.com; null = direct / internal
  source        text not null default 'direct', -- utm_source, else a channel derived from the referrer
  utm_medium    text,
  utm_campaign  text,
  country       text,
  device        text check (device in ('mobile', 'tablet', 'desktop')),
  browser       text,
  room_slug     text,                        -- booking step: which category
  booking_ref   text                         -- confirmation page
);

create index if not exists idx_bk_web_events_created on public.bk_web_events(created_at);
create index if not exists idx_bk_web_events_kind_created on public.bk_web_events(kind, created_at);

alter table public.bk_web_events enable row level security;
revoke all on table public.bk_web_events from anon, authenticated;
grant all on table public.bk_web_events to service_role;
