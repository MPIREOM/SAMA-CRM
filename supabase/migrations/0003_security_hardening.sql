-- ============================================================================
-- SAMA CRM — Migration 0003
-- Hardening from Supabase security advisors:
--  1. handle_new_user() is a trigger function — it must not be callable via
--     the REST RPC surface by anon/authenticated.
--  2. my_role() is only evaluated inside RLS policies scoped `to
--     authenticated` — anon never needs EXECUTE.
--  3. pg_net extension should not live in the public schema.
-- ============================================================================

revoke all on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.my_role() from anon;

-- pg_net is not relocatable on all versions; try ALTER, fall back to
-- drop/recreate in the extensions schema (the cron job's net.http_post call
-- is stored as text and re-resolves at run time).
do $$
begin
  begin
    alter extension pg_net set schema extensions;
  exception
    when others then
      begin
        drop extension if exists pg_net;
        create extension pg_net with schema extensions;
      exception
        when others then null;
      end;
  end;
end $$;
