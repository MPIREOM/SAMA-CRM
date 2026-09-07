-- ============================================================================
-- SAMA — Migration 0008 — Close the PUBLIC execute grant on internal helpers
-- Postgres grants EXECUTE to PUBLIC on new functions by default; migration
-- 0005 revoked `anon` explicitly but anon still inherited PUBLIC on
-- bk_available_count. Verified with `set role anon` on 2026-09-07.
-- ============================================================================

revoke all on function public.bk_available_count(uuid, date, date, uuid) from public;
grant execute on function public.bk_available_count(uuid, date, date, uuid) to authenticated, service_role;

revoke all on function public.bk_generate_ref() from public;
revoke all on function public.bk_upsert_contact(text, text, text, text, text) from public;
revoke all on function public.bk_schedule_booking_messages(uuid) from public;
revoke all on function public.bk_send_at(text, date, date) from public;
grant execute on function public.bk_send_at(text, date, date) to authenticated, service_role;
revoke all on function public.bk_setting(text) from public;
grant execute on function public.bk_setting(text) to service_role;
revoke all on function public.bk_mirror_booking() from public;
revoke all on function public.bk_touch_updated_at() from public;

-- Pin search_path on the two helpers the Supabase linter flagged.
alter function public.bk_touch_updated_at() set search_path = public;
alter function public.bk_muscat_today() set search_path = public;
