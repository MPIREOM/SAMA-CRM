-- ============================================================================
-- SAMA — Migration 0005 — Booking engine schema (additive only, bk_ prefix)
--
-- Tables:  bk_room_types, bk_rooms, bk_rate_plans, bk_inventory_blocks,
--          bk_bookings, bk_settings, bk_scheduled_messages, bk_message_log,
--          bk_audit_log
-- RPCs:    bk_availability (anon), bk_quote (anon), bk_create_booking
--          (service role / staff), bk_cancel_booking (service role / staff),
--          bk_public_settings (anon)
-- Storage: bucket bk-room-images (public read, staff write)
--
-- Guests live in the existing CRM `contacts` table; staff roles come from
-- the existing `profiles` table. bk_bookings mirror into CRM `bookings`.
-- Nothing in the pre-existing schema is dropped, renamed or altered.
-- Idempotent: safe to run more than once.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
create table if not exists public.bk_room_types (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  crm_value      text not null unique,              -- matches CRM ROOM_TYPES value
  name_en        text not null,
  name_ar        text not null,
  tagline_en     text,
  tagline_ar     text,
  description_en text,
  description_ar text,
  view_en        text,
  view_ar        text,
  bed_config_en  text,
  bed_config_ar  text,
  size_sqm       numeric(6,1),
  max_adults     int  not null default 2 check (max_adults between 1 and 10),
  max_children   int  not null default 1 check (max_children between 0 and 10),
  amenities      jsonb not null default '[]'::jsonb, -- array of amenity keys
  images         text[] not null default '{}',
  base_rate_omr  numeric(10,3) not null check (base_rate_omr >= 0),
  sort_order     int  not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.bk_rooms (
  id            uuid primary key default gen_random_uuid(),
  room_type_id  uuid not null references public.bk_room_types(id) on delete restrict,
  room_number   text not null unique,
  floor         text,
  status        text not null default 'active' check (status in ('active','maintenance')),
  notes         text,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_bk_rooms_type on public.bk_rooms(room_type_id);

create table if not exists public.bk_rate_plans (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  room_type_id  uuid references public.bk_room_types(id) on delete cascade, -- null = all types
  start_date    date not null,
  end_date      date not null,                   -- inclusive
  rate_omr      numeric(10,3),                   -- null = percentage adjustment only
  adjust_pct    numeric(6,2),                    -- e.g. 20 = +20 % on base (used when rate_omr is null)
  min_stay      int not null default 1 check (min_stay between 1 and 30),
  days_of_week  int[],                           -- 0=Sun … 6=Sat, null = every day
  priority      int not null default 0,
  is_active     boolean not null default true,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (end_date >= start_date),
  check (rate_omr is not null or adjust_pct is not null)
);
create index if not exists idx_bk_rate_plans_dates on public.bk_rate_plans(start_date, end_date);

create table if not exists public.bk_inventory_blocks (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid references public.bk_rooms(id) on delete cascade,
  room_type_id  uuid references public.bk_room_types(id) on delete cascade,
  start_date    date not null,                   -- first blocked night
  end_date      date not null,                   -- exclusive (like check_out)
  kind          text not null default 'block' check (kind in ('block','maintenance','stop_sell')),
  reason        text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  check (end_date > start_date),
  check (room_id is not null or room_type_id is not null)
);
create index if not exists idx_bk_blocks_dates on public.bk_inventory_blocks(start_date, end_date);

create table if not exists public.bk_bookings (
  id                  uuid primary key default gen_random_uuid(),
  ref                 text not null unique,
  contact_id          uuid references public.contacts(id) on delete set null,
  guest_name          text not null,
  guest_email         text,
  guest_phone         text not null,             -- E.164
  nationality         text,
  preferred_lang      text not null default 'en' check (preferred_lang in ('en','ar')),
  room_type_id        uuid not null references public.bk_room_types(id) on delete restrict,
  room_id             uuid references public.bk_rooms(id) on delete set null,
  check_in            date not null,
  check_out           date not null,
  nights              int generated always as (check_out - check_in) stored,
  adults              int not null default 2 check (adults between 1 and 20),
  children            int not null default 0 check (children between 0 and 20),
  status              text not null default 'confirmed'
                      check (status in ('pending','confirmed','checked_in','checked_out','cancelled','no_show')),
  nightly_rates       jsonb not null default '[]'::jsonb, -- [{"date":"2026-09-12","rate":55.000}]
  room_subtotal_omr   numeric(10,3) not null default 0,
  discount_omr        numeric(10,3) not null default 0,
  service_charge_omr  numeric(10,3) not null default 0,
  tourism_fee_omr     numeric(10,3) not null default 0,
  vat_omr             numeric(10,3) not null default 0,
  total_omr           numeric(10,3) not null default 0,
  promo_code          text,
  special_requests    text,
  internal_notes      text,
  source              text not null default 'website'
                      check (source in ('website','staff','phone','walk_in','ota')),
  created_by          uuid,                      -- staff user id when source <> website
  cancelled_at        timestamptz,
  cancel_reason       text,
  checked_in_at       timestamptz,
  checked_out_at      timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists idx_bk_bookings_dates on public.bk_bookings(check_in, check_out);
create index if not exists idx_bk_bookings_type on public.bk_bookings(room_type_id);
create index if not exists idx_bk_bookings_room on public.bk_bookings(room_id);
create index if not exists idx_bk_bookings_status on public.bk_bookings(status);
create index if not exists idx_bk_bookings_contact on public.bk_bookings(contact_id);
create index if not exists idx_bk_bookings_phone on public.bk_bookings(guest_phone);

create table if not exists public.bk_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.bk_scheduled_messages (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references public.bk_bookings(id) on delete cascade,
  channel     text not null check (channel in ('email','whatsapp')),
  kind        text not null check (kind in ('confirmation','pre_arrival','post_stay')),
  send_at     timestamptz not null,
  status      text not null default 'pending'
              check (status in ('pending','sending','sent','failed','stubbed','cancelled','skipped')),
  attempts    int not null default 0,
  last_error  text,
  sent_at     timestamptz,
  locked_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (booking_id, channel, kind)
);
create index if not exists idx_bk_sched_due on public.bk_scheduled_messages(status, send_at);

create table if not exists public.bk_message_log (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid references public.bk_bookings(id) on delete set null,
  scheduled_id        uuid references public.bk_scheduled_messages(id) on delete set null,
  channel             text not null check (channel in ('email','whatsapp')),
  kind                text not null,
  recipient           text,
  provider_message_id text,
  payload             jsonb,
  status              text not null,             -- sent|failed|stubbed|delivered|read|test
  error               text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_bk_msglog_booking on public.bk_message_log(booking_id, created_at desc);
create index if not exists idx_bk_msglog_provider on public.bk_message_log(provider_message_id);

create table if not exists public.bk_audit_log (
  id            uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email   text,
  action        text not null,
  entity        text not null,
  entity_id     text,
  diff          jsonb,
  created_at    timestamptz not null default now()
);
create index if not exists idx_bk_audit_created on public.bk_audit_log(created_at desc);

-- updated_at maintenance -------------------------------------------------------
create or replace function public.bk_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['bk_room_types','bk_rooms','bk_rate_plans','bk_bookings','bk_scheduled_messages']
  loop
    execute format('drop trigger if exists trg_%s_touch on public.%s', t, t);
    execute format('create trigger trg_%s_touch before update on public.%s for each row execute function public.bk_touch_updated_at()', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 2. Row Level Security
--    anon: read active room types only (public catalogue) + RPCs.
--    authenticated staff (profiles): read everything; writes for super_admin.
--    All app writes go through server actions using the service role.
-- ----------------------------------------------------------------------------
alter table public.bk_room_types         enable row level security;
alter table public.bk_rooms              enable row level security;
alter table public.bk_rate_plans         enable row level security;
alter table public.bk_inventory_blocks   enable row level security;
alter table public.bk_bookings           enable row level security;
alter table public.bk_settings           enable row level security;
alter table public.bk_scheduled_messages enable row level security;
alter table public.bk_message_log        enable row level security;
alter table public.bk_audit_log          enable row level security;

drop policy if exists bk_room_types_public_read on public.bk_room_types;
create policy bk_room_types_public_read on public.bk_room_types
  for select to anon using (is_active = true);
drop policy if exists bk_room_types_staff_read on public.bk_room_types;
create policy bk_room_types_staff_read on public.bk_room_types
  for select to authenticated using (is_active = true or public.my_role() in ('super_admin','reservation_desk'));

do $$
declare t text;
begin
  foreach t in array array['bk_rooms','bk_rate_plans','bk_inventory_blocks','bk_bookings','bk_settings','bk_scheduled_messages','bk_message_log','bk_audit_log']
  loop
    execute format('drop policy if exists %s_staff_read on public.%s', t, t);
    execute format($p$create policy %s_staff_read on public.%s for select to authenticated using (public.my_role() in ('super_admin','reservation_desk'))$p$, t, t);
  end loop;
  foreach t in array array['bk_room_types','bk_rooms','bk_rate_plans','bk_inventory_blocks','bk_bookings','bk_settings','bk_scheduled_messages']
  loop
    execute format('drop policy if exists %s_admin_write on public.%s', t, t);
    execute format($p$create policy %s_admin_write on public.%s for all to authenticated using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin')$p$, t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3. Helpers: settings, dates, rates
-- ----------------------------------------------------------------------------
create or replace function public.bk_setting(p_key text)
returns jsonb language sql stable security definer set search_path = public as $$
  select value from public.bk_settings where key = p_key
$$;
revoke all on function public.bk_setting(text) from public, anon, authenticated;

create or replace function public.bk_muscat_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Muscat')::date
$$;

-- Effective nightly rate for a room type on one date:
-- highest-priority active plan covering the date (and weekday) wins; a plan
-- with adjust_pct applies a % on the base; otherwise base_rate_omr.
create or replace function public.bk_effective_rate(p_room_type_id uuid, p_date date)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  v_base numeric;
  v_plan record;
begin
  select base_rate_omr into v_base from public.bk_room_types where id = p_room_type_id;
  if v_base is null then return null; end if;

  select rate_omr, adjust_pct into v_plan
  from public.bk_rate_plans
  where is_active
    and (room_type_id = p_room_type_id or room_type_id is null)
    and p_date between start_date and end_date
    and (days_of_week is null or extract(dow from p_date)::int = any(days_of_week))
  order by priority desc, (room_type_id is not null) desc, created_at desc
  limit 1;

  if not found then return round(v_base, 3); end if;
  if v_plan.rate_omr is not null then return round(v_plan.rate_omr, 3); end if;
  return round(v_base * (1 + coalesce(v_plan.adjust_pct, 0) / 100.0), 3);
end $$;

-- Minimum stay applying to a check-in date (highest-priority matching plan).
create or replace function public.bk_min_stay(p_room_type_id uuid, p_check_in date)
returns int language sql stable security definer set search_path = public as $$
  select coalesce((
    select min_stay from public.bk_rate_plans
    where is_active and (room_type_id = p_room_type_id or room_type_id is null)
      and p_check_in between start_date and end_date
      and (days_of_week is null or extract(dow from p_check_in)::int = any(days_of_week))
    order by priority desc, (room_type_id is not null) desc, created_at desc
    limit 1), 1)
$$;

create or replace function public.bk_nightly_rates(p_room_type_id uuid, p_check_in date, p_check_out date)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('date', d::date, 'rate', public.bk_effective_rate(p_room_type_id, d::date)) order by d), '[]'::jsonb)
  from generate_series(p_check_in, p_check_out - 1, interval '1 day') d
$$;

-- Rooms of a type available for EVERY night in [check_in, check_out).
-- Per night: active rooms − distinct room-level blocked rooms − all rooms if a
-- type-level stop-sell covers the night − live bookings of that type.
create or replace function public.bk_available_count(
  p_room_type_id uuid, p_check_in date, p_check_out date, p_exclude_booking uuid default null
) returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_rooms int;
  v_min int;
  v_night date;
  v_avail int;
begin
  select count(*) into v_rooms from public.bk_rooms where room_type_id = p_room_type_id and status = 'active';
  if v_rooms = 0 then return 0; end if;
  v_min := v_rooms;
  for v_night in select d::date from generate_series(p_check_in, p_check_out - 1, interval '1 day') d loop
    if exists (select 1 from public.bk_inventory_blocks b
               where b.room_type_id = p_room_type_id and b.room_id is null
                 and b.start_date <= v_night and b.end_date > v_night) then
      return 0;
    end if;
    select v_rooms
      - (select count(distinct b.room_id) from public.bk_inventory_blocks b
           join public.bk_rooms r on r.id = b.room_id
          where r.room_type_id = p_room_type_id and r.status = 'active'
            and b.start_date <= v_night and b.end_date > v_night)
      - (select count(*) from public.bk_bookings k
          where k.room_type_id = p_room_type_id
            and k.status not in ('cancelled','no_show')
            and (p_exclude_booking is null or k.id <> p_exclude_booking)
            and k.check_in <= v_night and k.check_out > v_night)
    into v_avail;
    if v_avail < v_min then v_min := v_avail; end if;
    if v_min <= 0 then return 0; end if;
  end loop;
  return greatest(v_min, 0);
end $$;

-- ----------------------------------------------------------------------------
-- 4. Public RPCs: availability + quote (anon-callable, read only)
-- ----------------------------------------------------------------------------
create or replace function public.bk_availability(
  p_check_in date, p_check_out date, p_adults int default 2, p_children int default 0
) returns table (
  room_type_id uuid, slug text, available_count int, nightly jsonb,
  room_subtotal numeric, min_stay int, min_stay_ok boolean, fits_capacity boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  v_max_nights int := coalesce((public.bk_setting('booking')->>'max_nights')::int, 30);
begin
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;
  if p_check_in < public.bk_muscat_today() then
    raise exception 'past_date' using errcode = '22023';
  end if;
  if (p_check_out - p_check_in) > v_max_nights then
    raise exception 'too_many_nights' using errcode = '22023';
  end if;
  return query
  select rt.id, rt.slug,
         public.bk_available_count(rt.id, p_check_in, p_check_out),
         public.bk_nightly_rates(rt.id, p_check_in, p_check_out),
         (select coalesce(sum((e->>'rate')::numeric), 0) from jsonb_array_elements(public.bk_nightly_rates(rt.id, p_check_in, p_check_out)) e),
         public.bk_min_stay(rt.id, p_check_in),
         (p_check_out - p_check_in) >= public.bk_min_stay(rt.id, p_check_in),
         (coalesce(p_adults,2) <= rt.max_adults and coalesce(p_children,0) <= rt.max_children)
  from public.bk_room_types rt
  where rt.is_active
  order by rt.sort_order, rt.name_en;
end $$;
grant execute on function public.bk_availability(date, date, int, int) to anon, authenticated, service_role;

-- Itemised quote. Money math is the single source of truth (mirrored in
-- src/lib/booking-engine/pricing.ts for the UI + tests).
create or replace function public.bk_quote(
  p_room_type_id uuid, p_check_in date, p_check_out date,
  p_adults int default 2, p_children int default 0, p_promo_code text default null
) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_taxes jsonb := coalesce(public.bk_setting('taxes'), '{}'::jsonb);
  v_promo jsonb := coalesce(public.bk_setting('promo'), '{}'::jsonb);
  v_nightly jsonb;
  v_subtotal numeric := 0;
  v_discount numeric := 0;
  v_discount_pct numeric := 0;
  v_taxable numeric;
  v_service numeric := 0;
  v_tourism numeric := 0;
  v_vat numeric := 0;
  v_vat_base numeric;
  v_total numeric;
  v_code jsonb;
  v_promo_valid boolean := false;
  v_rt record;
begin
  select * into v_rt from public.bk_room_types where id = p_room_type_id and is_active;
  if not found then raise exception 'room_type_not_found' using errcode = '22023'; end if;
  if p_check_in is null or p_check_out is null or p_check_out <= p_check_in then
    raise exception 'invalid_dates' using errcode = '22023';
  end if;

  v_nightly := public.bk_nightly_rates(p_room_type_id, p_check_in, p_check_out);
  select coalesce(sum((e->>'rate')::numeric), 0) into v_subtotal from jsonb_array_elements(v_nightly) e;
  v_subtotal := round(v_subtotal, 3);

  if p_promo_code is not null and length(trim(p_promo_code)) > 0 then
    select c into v_code from jsonb_array_elements(coalesce(v_promo->'codes','[]'::jsonb)) c
     where upper(c->>'code') = upper(trim(p_promo_code))
       and coalesce((c->>'enabled')::boolean, true)
       and (c->>'valid_until' is null or (c->>'valid_until')::date >= public.bk_muscat_today())
     limit 1;
    if v_code is not null then
      v_promo_valid := true;
      v_discount_pct := coalesce((v_code->>'percent')::numeric, 0);
      v_discount := round(v_subtotal * v_discount_pct / 100.0, 3);
    end if;
  end if;

  v_taxable := v_subtotal - v_discount;
  if coalesce((v_taxes->>'service_charge_enabled')::boolean, true) then
    v_service := round(v_taxable * coalesce((v_taxes->>'service_charge_pct')::numeric, 8) / 100.0, 3);
  end if;
  if coalesce((v_taxes->>'tourism_fee_enabled')::boolean, true) then
    v_tourism := round(v_taxable * coalesce((v_taxes->>'tourism_fee_pct')::numeric, 4) / 100.0, 3);
  end if;
  if coalesce((v_taxes->>'vat_enabled')::boolean, true) then
    v_vat_base := case when coalesce((v_taxes->>'vat_on_fees')::boolean, true)
                       then v_taxable + v_service + v_tourism else v_taxable end;
    v_vat := round(v_vat_base * coalesce((v_taxes->>'vat_pct')::numeric, 5) / 100.0, 3);
  end if;
  v_total := round(v_taxable + v_service + v_tourism + v_vat, 3);

  return jsonb_build_object(
    'room_type_id', p_room_type_id,
    'slug', v_rt.slug,
    'check_in', p_check_in, 'check_out', p_check_out,
    'nights', p_check_out - p_check_in,
    'adults', p_adults, 'children', p_children,
    'nightly', v_nightly,
    'room_subtotal', v_subtotal,
    'promo_code', case when v_promo_valid then upper(trim(p_promo_code)) else null end,
    'promo_valid', v_promo_valid,
    'discount_pct', v_discount_pct,
    'discount', v_discount,
    'service_charge', v_service,
    'tourism_fee', v_tourism,
    'vat', v_vat,
    'total', v_total,
    'taxes', jsonb_build_object(
      'service_charge_pct', coalesce((v_taxes->>'service_charge_pct')::numeric, 8),
      'tourism_fee_pct', coalesce((v_taxes->>'tourism_fee_pct')::numeric, 4),
      'vat_pct', coalesce((v_taxes->>'vat_pct')::numeric, 5),
      'service_charge_enabled', coalesce((v_taxes->>'service_charge_enabled')::boolean, true),
      'tourism_fee_enabled', coalesce((v_taxes->>'tourism_fee_enabled')::boolean, true),
      'vat_enabled', coalesce((v_taxes->>'vat_enabled')::boolean, true),
      'vat_on_fees', coalesce((v_taxes->>'vat_on_fees')::boolean, true)
    ),
    'available_count', public.bk_available_count(p_room_type_id, p_check_in, p_check_out),
    'min_stay', public.bk_min_stay(p_room_type_id, p_check_in),
    'fits_capacity', (coalesce(p_adults,2) <= v_rt.max_adults and coalesce(p_children,0) <= v_rt.max_children)
  );
end $$;
grant execute on function public.bk_quote(uuid, date, date, int, int, text) to anon, authenticated, service_role;

-- Whitelisted settings for the public site.
create or replace function public.bk_public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from public.bk_settings
  where key in ('times','cancellation','contact','booking','taxes','reviews','hotel')
$$;
grant execute on function public.bk_public_settings() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. Scheduling helpers
-- ----------------------------------------------------------------------------
create or replace function public.bk_send_at(p_kind text, p_check_in date, p_check_out date)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  m jsonb := coalesce(public.bk_setting('messaging'), '{}'::jsonb);
  v_days int; v_time text; v_at timestamptz;
begin
  if p_kind = 'confirmation' then return now(); end if;
  if p_kind = 'pre_arrival' then
    v_days := coalesce((m->>'pre_arrival_days_before')::int, 3);
    v_time := coalesce(m->>'pre_arrival_time', '10:00');
    v_at := ((p_check_in - v_days)::text || ' ' || v_time)::timestamp at time zone 'Asia/Muscat';
    -- Booked inside the window → send shortly after confirmation instead of never.
    if v_at < now() then v_at := now() + interval '3 minutes'; end if;
    return v_at;
  end if;
  if p_kind = 'post_stay' then
    v_days := coalesce((m->>'post_stay_days_after')::int, 1);
    v_time := coalesce(m->>'post_stay_time', '11:00');
    return ((p_check_out + v_days)::text || ' ' || v_time)::timestamp at time zone 'Asia/Muscat';
  end if;
  raise exception 'unknown_kind %', p_kind;
end $$;

-- Ensure the six scheduled rows exist for a booking (idempotent).
create or replace function public.bk_schedule_booking_messages(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare b record; k text; c text;
begin
  select * into b from public.bk_bookings where id = p_booking_id;
  if not found then return; end if;
  foreach k in array array['confirmation','pre_arrival','post_stay'] loop
    foreach c in array array['email','whatsapp'] loop
      insert into public.bk_scheduled_messages (booking_id, channel, kind, send_at, status)
      values (p_booking_id, c, k, public.bk_send_at(k, b.check_in, b.check_out),
              case when c = 'email' and (b.guest_email is null or b.guest_email = '') then 'skipped' else 'pending' end)
      on conflict (booking_id, channel, kind) do nothing;
    end loop;
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 6. Ref generation + contact upsert
-- ----------------------------------------------------------------------------
create or replace function public.bk_generate_ref()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_ref text; i int; v_yy text := to_char(now() at time zone 'Asia/Muscat', 'YY');
begin
  loop
    v_ref := 'SAMA-' || v_yy || '-';
    for i in 1..6 loop
      v_ref := v_ref || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.bk_bookings where ref = v_ref)
          and not exists (select 1 from public.bookings where ref = v_ref);
  end loop;
  return v_ref;
end $$;

-- Upsert a CRM contact by phone. Never touches consent fields.
create or replace function public.bk_upsert_contact(
  p_name text, p_phone text, p_email text, p_lang text, p_nationality text
) returns uuid language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.contacts where phone = p_phone;
  if v_id is not null then
    update public.contacts
       set name = coalesce(nullif(trim(p_name), ''), name),
           email = coalesce(nullif(trim(p_email), ''), email),
           lang = coalesce(p_lang, lang),
           nationality = coalesce(nullif(trim(p_nationality), ''), nationality)
     where id = v_id;
    return v_id;
  end if;
  insert into public.contacts (name, phone, email, lang, nationality, consent, tags)
  values (coalesce(nullif(trim(p_name), ''), p_phone), p_phone, nullif(trim(p_email), ''), coalesce(p_lang, 'ar'),
          nullif(trim(p_nationality), ''), false, array['website'])
  on conflict (phone) do update set name = excluded.name
  returning id into v_id;
  return v_id;
end $$;

-- ----------------------------------------------------------------------------
-- 7. Mirror bk_bookings → CRM bookings (same id / ref), cancel side effects,
--    reschedule on date change.
-- ----------------------------------------------------------------------------
create or replace function public.bk_mirror_booking()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_crm_type text; v_status text; v_source text;
begin
  select crm_value into v_crm_type from public.bk_room_types where id = new.room_type_id;
  v_status := case new.status
                when 'cancelled' then 'Cancelled'
                when 'no_show' then 'Cancelled'
                when 'checked_out' then 'Completed'
                else 'Confirmed' end;
  v_source := case when new.source = 'website' then 'Website'
                   when new.source = 'ota' then 'OTA'
                   else 'Offline' end;

  insert into public.bookings (id, ref, contact_id, guest, phone, check_in, check_out, room_type, source, status, created_at)
  values (new.id, new.ref, new.contact_id, new.guest_name, new.guest_phone, new.check_in, new.check_out,
          v_crm_type, v_source, v_status, new.created_at)
  on conflict (id) do update
    set ref = excluded.ref, contact_id = excluded.contact_id, guest = excluded.guest, phone = excluded.phone,
        check_in = excluded.check_in, check_out = excluded.check_out, room_type = excluded.room_type,
        source = excluded.source, status = excluded.status;

  if tg_op = 'UPDATE' then
    if new.status in ('cancelled','no_show') and old.status not in ('cancelled','no_show') then
      update public.bk_scheduled_messages
         set status = 'cancelled'
       where booking_id = new.id and status in ('pending','failed');
    end if;
    if (new.check_in <> old.check_in or new.check_out <> old.check_out)
       and new.status not in ('cancelled','no_show') then
      update public.bk_scheduled_messages s
         set send_at = public.bk_send_at(s.kind, new.check_in, new.check_out)
       where s.booking_id = new.id and s.kind in ('pre_arrival','post_stay') and s.status = 'pending';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_bk_bookings_mirror on public.bk_bookings;
create trigger trg_bk_bookings_mirror
  after insert or update on public.bk_bookings
  for each row execute function public.bk_mirror_booking();

-- ----------------------------------------------------------------------------
-- 8. Transactional booking creation + cancellation
-- ----------------------------------------------------------------------------
create or replace function public.bk_create_booking(p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_rt record;
  v_check_in date := (p->>'check_in')::date;
  v_check_out date := (p->>'check_out')::date;
  v_adults int := coalesce((p->>'adults')::int, 2);
  v_children int := coalesce((p->>'children')::int, 0);
  v_lang text := case when p->>'preferred_lang' = 'ar' then 'ar' else 'en' end;
  v_source text := coalesce(p->>'source', 'website');
  v_phone text := p->>'guest_phone';
  v_email text := nullif(trim(coalesce(p->>'guest_email','')), '');
  v_name text := trim(coalesce(p->>'guest_name',''));
  v_quote jsonb;
  v_avail int;
  v_contact uuid;
  v_ref text;
  v_id uuid;
  v_status text := coalesce(p->>'status', 'confirmed');
  v_room_id uuid := nullif(p->>'room_id','')::uuid;
  v_max_advance int := coalesce((public.bk_setting('booking')->>'max_advance_days')::int, 365);
begin
  if v_name = '' then raise exception 'guest_name_required' using errcode = '22023'; end if;
  if v_phone is null or v_phone !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'invalid_phone' using errcode = '22023'; end if;
  if v_check_in is null or v_check_out is null or v_check_out <= v_check_in then raise exception 'invalid_dates' using errcode = '22023'; end if;
  if v_source = 'website' and v_check_in < public.bk_muscat_today() then raise exception 'past_date' using errcode = '22023'; end if;
  if v_check_in > public.bk_muscat_today() + v_max_advance then raise exception 'too_far_ahead' using errcode = '22023'; end if;

  select * into v_rt from public.bk_room_types where id = (p->>'room_type_id')::uuid and is_active;
  if not found then raise exception 'room_type_not_found' using errcode = '22023'; end if;
  if v_source = 'website' and (v_adults > v_rt.max_adults or v_children > v_rt.max_children) then
    raise exception 'capacity_exceeded' using errcode = '22023';
  end if;

  -- Serialise bookings per room type: prevents two guests taking the last room.
  perform pg_advisory_xact_lock(hashtext(v_rt.id::text));

  v_avail := public.bk_available_count(v_rt.id, v_check_in, v_check_out);
  if v_avail <= 0 then raise exception 'sold_out' using errcode = 'P0001'; end if;
  if v_source = 'website' and (v_check_out - v_check_in) < public.bk_min_stay(v_rt.id, v_check_in) then
    raise exception 'min_stay' using errcode = '22023';
  end if;
  if v_room_id is not null then
    if not exists (select 1 from public.bk_rooms where id = v_room_id and room_type_id = v_rt.id and status = 'active') then
      raise exception 'room_invalid' using errcode = '22023';
    end if;
    if exists (select 1 from public.bk_bookings k where k.room_id = v_room_id and k.status not in ('cancelled','no_show')
                 and k.check_in < v_check_out and k.check_out > v_check_in)
       or exists (select 1 from public.bk_inventory_blocks b where b.room_id = v_room_id and b.start_date < v_check_out and b.end_date > v_check_in) then
      raise exception 'room_unavailable' using errcode = 'P0001';
    end if;
  end if;

  v_quote := public.bk_quote(v_rt.id, v_check_in, v_check_out, v_adults, v_children, p->>'promo_code');
  v_contact := public.bk_upsert_contact(v_name, v_phone, v_email, v_lang, p->>'nationality');
  v_ref := public.bk_generate_ref();

  insert into public.bk_bookings (
    ref, contact_id, guest_name, guest_email, guest_phone, nationality, preferred_lang,
    room_type_id, room_id, check_in, check_out, adults, children, status,
    nightly_rates, room_subtotal_omr, discount_omr, service_charge_omr, tourism_fee_omr, vat_omr, total_omr,
    promo_code, special_requests, internal_notes, source, created_by
  ) values (
    v_ref, v_contact, v_name, v_email, v_phone, nullif(trim(coalesce(p->>'nationality','')),''), v_lang,
    v_rt.id, v_room_id, v_check_in, v_check_out, v_adults, v_children, v_status,
    v_quote->'nightly', (v_quote->>'room_subtotal')::numeric, (v_quote->>'discount')::numeric,
    (v_quote->>'service_charge')::numeric, (v_quote->>'tourism_fee')::numeric, (v_quote->>'vat')::numeric, (v_quote->>'total')::numeric,
    v_quote->>'promo_code', nullif(trim(coalesce(p->>'special_requests','')),''), nullif(trim(coalesce(p->>'internal_notes','')),''),
    v_source, nullif(p->>'created_by','')::uuid
  ) returning id into v_id;

  perform public.bk_schedule_booking_messages(v_id);

  return (select to_jsonb(b) from public.bk_bookings b where b.id = v_id);
end $$;
revoke all on function public.bk_create_booking(jsonb) from public, anon;
grant execute on function public.bk_create_booking(jsonb) to authenticated, service_role;

create or replace function public.bk_cancel_booking(p_booking_id uuid, p_reason text default null, p_actor uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare b record;
begin
  select * into b from public.bk_bookings where id = p_booking_id for update;
  if not found then raise exception 'booking_not_found' using errcode = '22023'; end if;
  if b.status in ('cancelled','no_show','checked_out') then
    raise exception 'not_cancellable' using errcode = '22023';
  end if;
  update public.bk_bookings
     set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(coalesce(p_reason,'')),'')
   where id = p_booking_id;
  insert into public.bk_audit_log (actor_user_id, action, entity, entity_id, diff)
  values (p_actor, 'booking.cancel', 'bk_bookings', p_booking_id::text, jsonb_build_object('reason', p_reason, 'previous_status', b.status));
  return (select to_jsonb(x) from public.bk_bookings x where x.id = p_booking_id);
end $$;
revoke all on function public.bk_cancel_booking(uuid, text, uuid) from public, anon;
grant execute on function public.bk_cancel_booking(uuid, text, uuid) to authenticated, service_role;

-- Internal helpers are not part of the public RPC surface.
revoke all on function public.bk_generate_ref() from public, anon, authenticated;
revoke all on function public.bk_upsert_contact(text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.bk_schedule_booking_messages(uuid) from public, anon, authenticated;
revoke all on function public.bk_send_at(text, date, date) from public, anon;
revoke all on function public.bk_mirror_booking() from public, anon, authenticated;
revoke all on function public.bk_touch_updated_at() from public, anon, authenticated;
grant execute on function public.bk_effective_rate(uuid, date) to anon, authenticated, service_role;
grant execute on function public.bk_nightly_rates(uuid, date, date) to anon, authenticated, service_role;
grant execute on function public.bk_available_count(uuid, date, date, uuid) to authenticated, service_role;
revoke all on function public.bk_available_count(uuid, date, date, uuid) from anon;
grant execute on function public.bk_min_stay(uuid, date) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 9. Storage bucket for room images (public read, staff write)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bk-room-images', 'bk-room-images', true)
on conflict (id) do nothing;

drop policy if exists bk_room_images_public_read on storage.objects;
create policy bk_room_images_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'bk-room-images');
drop policy if exists bk_room_images_staff_write on storage.objects;
create policy bk_room_images_staff_write on storage.objects
  for insert to authenticated with check (bucket_id = 'bk-room-images' and public.my_role() = 'super_admin');
drop policy if exists bk_room_images_staff_delete on storage.objects;
create policy bk_room_images_staff_delete on storage.objects
  for delete to authenticated using (bucket_id = 'bk-room-images' and public.my_role() = 'super_admin');
