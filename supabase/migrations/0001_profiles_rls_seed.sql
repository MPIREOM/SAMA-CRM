-- ============================================================================
-- SAMA CRM — Migration 0001
-- Profiles + roles, RLS policies for all tables, automation seeds,
-- realtime for messages, and supporting indexes.
--
-- Idempotent: safe to run more than once.
-- Assumes the core schema (contacts, bookings, automations, campaigns,
-- messages) already exists.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Small additive columns the app needs
-- ----------------------------------------------------------------------------
-- Kiosk check-in captures an optional nationality.
alter table public.contacts add column if not exists nationality text;

-- ----------------------------------------------------------------------------
-- 2. Profiles table (staff roles)
--    super_admin      → full access
--    reservation_desk → bookings, inbox, contacts only
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'reservation_desk'
    check (role in ('super_admin', 'reservation_desk')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Role lookup used by RLS policies. SECURITY DEFINER so it can read profiles
-- without recursing through profiles' own RLS.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_role() from public;
grant execute on function public.my_role() to authenticated, anon;

-- Auto-create a profile whenever a user signs up / is invited.
-- The FIRST user ever created becomes super_admin automatically; everyone
-- after that defaults to reservation_desk (or the role passed in the invite's
-- user_metadata.role).
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
      when new.raw_user_meta_data ->> 'role' in ('super_admin', 'reservation_desk')
        then new.raw_user_meta_data ->> 'role'
      else 'reservation_desk'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. RLS policies
-- ----------------------------------------------------------------------------
alter table public.contacts    enable row level security;
alter table public.bookings    enable row level security;
alter table public.automations enable row level security;
alter table public.campaigns   enable row level security;
alter table public.messages    enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.my_role() = 'super_admin');

drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles
  for insert to authenticated
  with check (public.my_role() = 'super_admin');

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.my_role() = 'super_admin')
  with check (public.my_role() = 'super_admin');

drop policy if exists profiles_delete_admin on public.profiles;
create policy profiles_delete_admin on public.profiles
  for delete to authenticated
  using (public.my_role() = 'super_admin');

-- contacts: both roles read/write, only super_admin deletes ------------------
drop policy if exists contacts_select_staff on public.contacts;
create policy contacts_select_staff on public.contacts
  for select to authenticated
  using (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists contacts_insert_staff on public.contacts;
create policy contacts_insert_staff on public.contacts
  for insert to authenticated
  with check (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists contacts_update_staff on public.contacts;
create policy contacts_update_staff on public.contacts
  for update to authenticated
  using (public.my_role() in ('super_admin', 'reservation_desk'))
  with check (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists contacts_delete_admin on public.contacts;
create policy contacts_delete_admin on public.contacts
  for delete to authenticated
  using (public.my_role() = 'super_admin');

-- bookings: both roles read/write, only super_admin deletes ------------------
drop policy if exists bookings_select_staff on public.bookings;
create policy bookings_select_staff on public.bookings
  for select to authenticated
  using (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists bookings_insert_staff on public.bookings;
create policy bookings_insert_staff on public.bookings
  for insert to authenticated
  with check (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists bookings_update_staff on public.bookings;
create policy bookings_update_staff on public.bookings
  for update to authenticated
  using (public.my_role() in ('super_admin', 'reservation_desk'))
  with check (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists bookings_delete_admin on public.bookings;
create policy bookings_delete_admin on public.bookings
  for delete to authenticated
  using (public.my_role() = 'super_admin');

-- messages: both roles read/write (inbox), only super_admin deletes ----------
drop policy if exists messages_select_staff on public.messages;
create policy messages_select_staff on public.messages
  for select to authenticated
  using (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists messages_insert_staff on public.messages;
create policy messages_insert_staff on public.messages
  for insert to authenticated
  with check (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists messages_update_staff on public.messages;
create policy messages_update_staff on public.messages
  for update to authenticated
  using (public.my_role() in ('super_admin', 'reservation_desk'))
  with check (public.my_role() in ('super_admin', 'reservation_desk'));

drop policy if exists messages_delete_admin on public.messages;
create policy messages_delete_admin on public.messages
  for delete to authenticated
  using (public.my_role() = 'super_admin');

-- automations: super_admin only ----------------------------------------------
drop policy if exists automations_all_admin on public.automations;
create policy automations_all_admin on public.automations
  for all to authenticated
  using (public.my_role() = 'super_admin')
  with check (public.my_role() = 'super_admin');

-- campaigns: super_admin only -------------------------------------------------
drop policy if exists campaigns_all_admin on public.campaigns;
create policy campaigns_all_admin on public.campaigns
  for all to authenticated
  using (public.my_role() = 'super_admin')
  with check (public.my_role() = 'super_admin');

-- ----------------------------------------------------------------------------
-- 4. Seed the five automations (skip any trigger_kind that already exists)
--    Templates are bilingual: Arabic, divider, English.
--    {{terms_link}} is replaced at send time from the TERMS_LINK env var.
-- ----------------------------------------------------------------------------
insert into public.automations (name, trigger_kind, offset_days, channel, msg_type, market, template, enabled)
select * from (values
  (
    'Booking confirmation | تأكيد الحجز',
    'booking_created', 0, 'whatsapp', 'utility', 'All',
    'عزيزي/عزيزتي {{name}}،' || chr(10) ||
    'تم تأكيد حجزكم في فندق سما ✅' || chr(10) ||
    'رقم الحجز: {{ref}}' || chr(10) ||
    'الوصول: {{check_in}} — المغادرة: {{check_out}}' || chr(10) ||
    'نوع الغرفة: {{room_type}}' || chr(10) ||
    'نتطلع لاستقبالكم!' || chr(10) ||
    '⸻⸻⸻' || chr(10) ||
    'Dear {{name}},' || chr(10) ||
    'Your booking at Sama Hotel is confirmed ✅' || chr(10) ||
    'Confirmation no: {{ref}}' || chr(10) ||
    'Check-in: {{check_in}} — Check-out: {{check_out}}' || chr(10) ||
    'Room type: {{room_type}}' || chr(10) ||
    'We look forward to welcoming you!',
    true
  ),
  (
    'Pre-arrival | قبل الوصول',
    'pre_arrival', 2, 'whatsapp', 'utility', 'All',
    'عزيزي/عزيزتي {{name}}،' || chr(10) ||
    'نذكّركم بموعد وصولكم إلى فندق سما بعد يومين ({{check_in}}) — حجز رقم {{ref}}.' || chr(10) ||
    'تسجيل الدخول من الساعة 2 ظهراً. لأي طلب خاص، راسلونا هنا.' || chr(10) ||
    '⸻⸻⸻' || chr(10) ||
    'Dear {{name}},' || chr(10) ||
    'A friendly reminder: your arrival at Sama Hotel is in 2 days ({{check_in}}) — booking {{ref}}.' || chr(10) ||
    'Check-in starts at 2 PM. For any special request, just reply here.',
    true
  ),
  (
    'Post-stay review | تقييم بعد الإقامة',
    'post_stay', 1, 'whatsapp', 'utility', 'All',
    'عزيزي/عزيزتي {{name}}،' || chr(10) ||
    'شكراً لاختياركم فندق سما! نأمل أن تكون إقامتكم ممتعة.' || chr(10) ||
    'يسعدنا سماع رأيكم — شاركونا تقييمكم برد على هذه الرسالة.' || chr(10) ||
    '⸻⸻⸻' || chr(10) ||
    'Dear {{name}},' || chr(10) ||
    'Thank you for staying at Sama Hotel! We hope you enjoyed your visit.' || chr(10) ||
    'We would love your feedback — simply reply to this message with your review.',
    true
  ),
  (
    'Birthday | تهنئة عيد الميلاد',
    'birthday', 0, 'whatsapp', 'marketing', 'Oman+GCC',
    'عزيزي/عزيزتي {{name}}،' || chr(10) ||
    'كل عام وأنتم بخير! 🎂 يسعدنا في فندق سما أن نهنئكم بعيد ميلادكم.' || chr(10) ||
    'استمتعوا بعرض خاص في إقامتكم القادمة. الشروط: {{terms_link}}' || chr(10) ||
    'للإلغاء أرسل "إلغاء"' || chr(10) ||
    '⸻⸻⸻' || chr(10) ||
    'Dear {{name}},' || chr(10) ||
    'Happy birthday from all of us at Sama Hotel! 🎂' || chr(10) ||
    'Enjoy a special offer on your next stay. Terms: {{terms_link}}' || chr(10) ||
    'Reply STOP to opt out',
    true
  ),
  (
    'Win-back | استعادة الضيوف',
    'win_back', 335, 'whatsapp', 'marketing', 'Oman+GCC',
    'عزيزي/عزيزتي {{name}}،' || chr(10) ||
    'اشتقنا لكم في فندق سما! لقد مضى قرابة عام على آخر زيارة لكم.' || chr(10) ||
    'عودوا إلينا واستمتعوا بعرض ترحيبي خاص. الشروط: {{terms_link}}' || chr(10) ||
    'للإلغاء أرسل "إلغاء"' || chr(10) ||
    '⸻⸻⸻' || chr(10) ||
    'Dear {{name}},' || chr(10) ||
    'We miss you at Sama Hotel! It has been almost a year since your last stay.' || chr(10) ||
    'Come back and enjoy a special welcome-back offer. Terms: {{terms_link}}' || chr(10) ||
    'Reply STOP to opt out',
    true
  )
) as seed(name, trigger_kind, offset_days, channel, msg_type, market, template, enabled)
where not exists (
  select 1 from public.automations a where a.trigger_kind = seed.trigger_kind
);

-- ----------------------------------------------------------------------------
-- 5. Realtime for the WhatsApp inbox
-- ----------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

-- Realtime delivers old row data on UPDATE only with full replica identity.
alter table public.messages replica identity full;

-- ----------------------------------------------------------------------------
-- 6. Indexes for the hot paths
-- ----------------------------------------------------------------------------
create index if not exists idx_bookings_check_in  on public.bookings (check_in);
create index if not exists idx_bookings_check_out on public.bookings (check_out);
create index if not exists idx_bookings_contact   on public.bookings (contact_id);
create index if not exists idx_messages_contact   on public.messages (contact_id, sent_at desc);
create index if not exists idx_messages_automation on public.messages (automation_id, booking_id);
create index if not exists idx_messages_automation_contact on public.messages (automation_id, contact_id, sent_at);
create index if not exists idx_contacts_birthday  on public.contacts (birthday);
create index if not exists idx_contacts_last_stay on public.contacts (last_stay);
create index if not exists idx_contacts_market    on public.contacts (market);
