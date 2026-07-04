-- ============================================================================
-- SAMA CRM — Migration 0004
-- SECURITY FIX: handle_new_user previously honored raw_user_meta_data.role,
-- which is CLIENT-CONTROLLED on self-signup — anyone holding the public anon
-- key could have registered themselves as super_admin.
--
-- New rules:
--   * the very first user still bootstraps as super_admin (fresh install UX);
--   * everyone else is reservation_desk, no exceptions;
--   * role changes happen only via an existing super_admin updating profiles
--     (RLS already restricts that) or via SQL in the dashboard.
--
-- ALSO: disable public email signups in Supabase Auth settings — staff
-- accounts should be created from the dashboard (Auth → Add user).
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    case
      when (select count(*) from public.profiles) = 0 then 'super_admin'
      else 'reservation_desk'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
