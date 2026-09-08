-- ============================================================================
-- SAMA — Migration 0010 — Booking add-ons (APEX Zipline, 4WD transfers)
-- Additive: bk_addons, bk_booking_addons, bk_bookings.addons_omr; bk_quote
-- gains a p_addons parameter (old 6-arg signature dropped to avoid PostgREST
-- overload ambiguity); bk_create_booking reads p->'addons'.
-- Add-on prices are final prices (VAT inclusive) unless `taxable` is true, in
-- which case they join the room subtotal before service charge / tourism fee / VAT.
-- ============================================================================

create table if not exists public.bk_addons (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  kind            text not null default 'other' check (kind in ('activity','transfer','other')),
  name_en         text not null,
  name_ar         text not null,
  tagline_en      text,
  tagline_ar      text,
  description_en  text,
  description_ar  text,
  price_omr       numeric(10,3) not null check (price_omr >= 0),
  unit            text not null default 'per_person' check (unit in ('per_person','per_car','per_booking','per_night')),
  max_quantity    int not null default 10 check (max_quantity between 1 and 50),
  taxable         boolean not null default false,
  requires_note   boolean not null default false,
  note_hint_en    text,
  note_hint_ar    text,
  image           text,
  details         jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.bk_booking_addons (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references public.bk_bookings(id) on delete cascade,
  addon_id        uuid not null references public.bk_addons(id) on delete restrict,
  quantity        int not null check (quantity between 1 and 50),
  unit_price_omr  numeric(10,3) not null,
  total_omr       numeric(10,3) not null,
  taxable         boolean not null default false,
  note            text,
  status          text not null default 'requested' check (status in ('requested','confirmed','done','cancelled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (booking_id, addon_id)
);
create index if not exists idx_bk_booking_addons_booking on public.bk_booking_addons(booking_id);

alter table public.bk_bookings add column if not exists addons_omr numeric(10,3) not null default 0;

drop trigger if exists trg_bk_addons_touch on public.bk_addons;
create trigger trg_bk_addons_touch before update on public.bk_addons for each row execute function public.bk_touch_updated_at();
drop trigger if exists trg_bk_booking_addons_touch on public.bk_booking_addons;
create trigger trg_bk_booking_addons_touch before update on public.bk_booking_addons for each row execute function public.bk_touch_updated_at();

-- RLS: catalogue is public (active rows), booking add-ons are staff-only.
alter table public.bk_addons enable row level security;
alter table public.bk_booking_addons enable row level security;
drop policy if exists bk_addons_public_read on public.bk_addons;
create policy bk_addons_public_read on public.bk_addons for select to anon using (is_active = true);
drop policy if exists bk_addons_staff_read on public.bk_addons;
create policy bk_addons_staff_read on public.bk_addons for select to authenticated using (is_active = true or public.my_role() in ('super_admin','reservation_desk'));
drop policy if exists bk_addons_admin_write on public.bk_addons;
create policy bk_addons_admin_write on public.bk_addons for all to authenticated using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');
drop policy if exists bk_booking_addons_staff_read on public.bk_booking_addons;
create policy bk_booking_addons_staff_read on public.bk_booking_addons for select to authenticated using (public.my_role() in ('super_admin','reservation_desk'));
drop policy if exists bk_booking_addons_admin_write on public.bk_booking_addons;
create policy bk_booking_addons_admin_write on public.bk_booking_addons for all to authenticated using (public.my_role() = 'super_admin') with check (public.my_role() = 'super_admin');

-- ----------------------------------------------------------------------------
-- Seed: APEX Zipline (OMR 5 per rider for hotel guests), 4WD transfers
-- ----------------------------------------------------------------------------
insert into public.bk_addons (slug, kind, name_en, name_ar, tagline_en, tagline_ar, description_en, description_ar, price_omr, unit, max_quantity, taxable, requires_note, note_hint_en, note_hint_ar, image, details, sort_order)
values
  ('apex-zipline', 'activity', 'APEX Zipline', 'أبكس زيبلاين',
   '310 m over the canyon at up to 60 km/h — it starts right next to the hotel.',
   '310 متراً فوق الوادي بسرعة تصل إلى 60 كم/س — ينطلق من جوار الفندق مباشرة.',
   'Fly 310 metres across the canyon, about 20 metres above the terraces of Al Aqar, Al Shraija and Al Ain, at up to 60 km/h. The launch platform is a short walk from the hotel and the ride ends at Layali Al Jabal Al Akhdar. Hotel guests pay a special rate; we book your slot for the day you prefer and you pay with your room. Maximum rider weight 120 kg; children ride with a guardian''s consent.',
   'انطلقوا 310 أمتار فوق الوادي على ارتفاع نحو 20 متراً فوق مدرجات العقر والشريجة والعين، بسرعة تصل إلى 60 كم/س. منصة الانطلاق على بُعد خطوات من الفندق، وتنتهي الرحلة عند ليالي الجبل الأخضر. يحصل نزلاء الفندق على سعر خاص؛ نحجز لكم موعدكم في اليوم الذي تفضلونه وتدفعون مع فاتورة الغرفة. الحد الأقصى لوزن الراكب 120 كجم، ويشارك الأطفال بموافقة ولي الأمر.',
   5.000, 'per_person', 10, false, true,
   'Preferred day (arrival day, any day of your stay) and any riders under 16',
   'اليوم المفضل (يوم الوصول أو أي يوم خلال الإقامة) وعدد الراكبين تحت 16 عاماً',
   '/images/addons/apex-zipline.jpg',
   '{"length_m": 310, "height_m": 20, "speed_kmh": 60, "max_weight_kg": 120, "website": "https://www.apexzipline.com", "operator": "Al Jabal Adventures LLC"}', 10),

  ('transfer-up', 'transfer', '4WD transfer up — Birkat Al Mouz to the hotel', 'نقل بسيارة دفع رباعي صعوداً — من بركة الموز إلى الفندق',
   'Leave your car at the checkpoint car park; we bring you up the mountain.',
   'اتركوا سيارتكم في موقف نقطة التفتيش ونحن نصعد بكم إلى الجبل.',
   'The police checkpoint at Birkat Al Mouz does not allow 2WD cars up Jabal Al Akhdar. Park at the checkpoint car park and our 4WD collects you and your luggage and drives you to the hotel (about 45 minutes). Price is per car, up to 4 guests. Tell us your expected arrival time; we confirm the pickup by WhatsApp.',
   'لا تسمح نقطة التفتيش في بركة الموز بصعود سيارات الدفع الثنائي إلى الجبل الأخضر. اركنوا سيارتكم في موقف نقطة التفتيش وستقلّكم سيارة الدفع الرباعي مع أمتعتكم إلى الفندق (نحو 45 دقيقة). السعر للسيارة الواحدة حتى 4 نزلاء. أخبرونا بوقت وصولكم المتوقع وسنؤكد الموعد عبر واتساب.',
   15.000, 'per_car', 3, false, true,
   'Expected arrival time at the checkpoint and number of guests',
   'وقت الوصول المتوقع إلى نقطة التفتيش وعدد النزلاء',
   '/images/addons/transfer.jpg',
   '{"max_guests_per_car": 4, "pickup": "Birkat Al Mouz checkpoint car park", "duration_min": 45}', 20),

  ('transfer-down', 'transfer', '4WD transfer down — hotel to Birkat Al Mouz', 'نقل بسيارة دفع رباعي نزولاً — من الفندق إلى بركة الموز',
   'After check-out we drive you back down to your car.',
   'بعد تسجيل المغادرة نعيدكم إلى سيارتكم عند نقطة التفتيش.',
   'On your check-out day our 4WD takes you and your luggage from the hotel back to the Birkat Al Mouz checkpoint car park. Price is per car, up to 4 guests. Tell us what time you would like to leave.',
   'في يوم المغادرة تقلّكم سيارة الدفع الرباعي مع أمتعتكم من الفندق إلى موقف نقطة التفتيش في بركة الموز. السعر للسيارة الواحدة حتى 4 نزلاء. أخبرونا بالوقت الذي تودون المغادرة فيه.',
   15.000, 'per_car', 3, false, true,
   'Preferred departure time on check-out day',
   'وقت المغادرة المفضل في يوم تسجيل المغادرة',
   '/images/addons/transfer.jpg',
   '{"max_guests_per_car": 4, "dropoff": "Birkat Al Mouz checkpoint car park", "duration_min": 45}', 30)
on conflict (slug) do nothing;

-- ----------------------------------------------------------------------------
-- Quote with add-ons. Old 6-argument signature dropped (PostgREST overload).
-- ----------------------------------------------------------------------------
drop function if exists public.bk_quote(uuid, date, date, int, int, text);

create or replace function public.bk_quote(
  p_room_type_id uuid, p_check_in date, p_check_out date,
  p_adults int default 2, p_children int default 0, p_promo_code text default null,
  p_addons jsonb default null
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
  v_addon_lines jsonb := '[]'::jsonb;
  v_addons_taxable numeric := 0;
  v_addons_untaxed numeric := 0;
  v_item jsonb;
  v_ad record;
  v_qty int;
  v_line numeric;
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

  -- Add-ons: price always from the catalogue, never from the caller.
  if p_addons is not null and jsonb_typeof(p_addons) = 'array' then
    for v_item in select * from jsonb_array_elements(p_addons) loop
      v_qty := coalesce((v_item->>'quantity')::int, 0);
      if v_qty <= 0 then continue; end if;
      select * into v_ad from public.bk_addons a
       where a.is_active and (a.id::text = v_item->>'addon_id' or a.slug = v_item->>'slug')
       limit 1;
      if not found then raise exception 'addon_not_found' using errcode = '22023'; end if;
      if v_qty > v_ad.max_quantity then raise exception 'addon_quantity' using errcode = '22023'; end if;
      v_line := round(case when v_ad.unit = 'per_night' then v_ad.price_omr * v_qty * (p_check_out - p_check_in)
                           else v_ad.price_omr * v_qty end, 3);
      if v_ad.taxable then v_addons_taxable := v_addons_taxable + v_line; else v_addons_untaxed := v_addons_untaxed + v_line; end if;
      v_addon_lines := v_addon_lines || jsonb_build_object(
        'addon_id', v_ad.id, 'slug', v_ad.slug, 'kind', v_ad.kind,
        'name_en', v_ad.name_en, 'name_ar', v_ad.name_ar,
        'unit', v_ad.unit, 'quantity', v_qty, 'unit_price', v_ad.price_omr,
        'total', v_line, 'taxable', v_ad.taxable, 'note', v_item->>'note');
    end loop;
  end if;

  v_taxable := v_subtotal - v_discount + v_addons_taxable;
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
  v_total := round(v_taxable + v_service + v_tourism + v_vat + v_addons_untaxed, 3);

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
    'addons', v_addon_lines,
    'addons_total', round(v_addons_taxable + v_addons_untaxed, 3),
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
revoke all on function public.bk_quote(uuid, date, date, int, int, text, jsonb) from public;
grant execute on function public.bk_quote(uuid, date, date, int, int, text, jsonb) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Booking creation now stores add-ons (p->'addons' = [{addon_id|slug, quantity, note}])
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
  v_line jsonb;
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

  v_quote := public.bk_quote(v_rt.id, v_check_in, v_check_out, v_adults, v_children, p->>'promo_code', p->'addons');
  v_contact := public.bk_upsert_contact(v_name, v_phone, v_email, v_lang, p->>'nationality');
  v_ref := public.bk_generate_ref();

  insert into public.bk_bookings (
    ref, contact_id, guest_name, guest_email, guest_phone, nationality, preferred_lang,
    room_type_id, room_id, check_in, check_out, adults, children, status,
    nightly_rates, room_subtotal_omr, discount_omr, addons_omr, service_charge_omr, tourism_fee_omr, vat_omr, total_omr,
    promo_code, special_requests, internal_notes, source, created_by
  ) values (
    v_ref, v_contact, v_name, v_email, v_phone, nullif(trim(coalesce(p->>'nationality','')),''), v_lang,
    v_rt.id, v_room_id, v_check_in, v_check_out, v_adults, v_children, v_status,
    v_quote->'nightly', (v_quote->>'room_subtotal')::numeric, (v_quote->>'discount')::numeric, (v_quote->>'addons_total')::numeric,
    (v_quote->>'service_charge')::numeric, (v_quote->>'tourism_fee')::numeric, (v_quote->>'vat')::numeric, (v_quote->>'total')::numeric,
    v_quote->>'promo_code', nullif(trim(coalesce(p->>'special_requests','')),''), nullif(trim(coalesce(p->>'internal_notes','')),''),
    v_source, nullif(p->>'created_by','')::uuid
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(coalesce(v_quote->'addons', '[]'::jsonb)) loop
    insert into public.bk_booking_addons (booking_id, addon_id, quantity, unit_price_omr, total_omr, taxable, note)
    values (v_id, (v_line->>'addon_id')::uuid, (v_line->>'quantity')::int, (v_line->>'unit_price')::numeric,
            (v_line->>'total')::numeric, (v_line->>'taxable')::boolean, nullif(trim(coalesce(v_line->>'note','')),''));
  end loop;

  perform public.bk_schedule_booking_messages(v_id);

  return (select to_jsonb(b) from public.bk_bookings b where b.id = v_id);
end $$;
revoke all on function public.bk_create_booking(jsonb) from public, anon;
grant execute on function public.bk_create_booking(jsonb) to authenticated, service_role;

-- Cancelling a booking cancels its add-on requests too.
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
      update public.bk_booking_addons
         set status = 'cancelled'
       where booking_id = new.id and status in ('requested','confirmed');
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
