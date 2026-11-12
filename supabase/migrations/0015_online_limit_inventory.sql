-- 0015: real room counts, no jacuzzi in the Sama Suite, and a per-type
-- "rooms for sale online" limit that staff set on /rooms.
--
-- online_limit caps how many rooms of a type the WEBSITE may hold on any one
-- night (website-source bookings only). null = no cap: every free room is
-- sold online. Staff bookings are never capped — they can still sell the
-- rooms kept off the website. Physical availability always wins: the website
-- never sells a room that is booked, blocked or in maintenance.

alter table public.bk_room_types
  add column if not exists online_limit int;
alter table public.bk_room_types drop constraint if exists bk_room_types_online_limit_check;
alter table public.bk_room_types
  add constraint bk_room_types_online_limit_check check (online_limit is null or online_limit between 0 and 1000);
comment on column public.bk_room_types.online_limit is 'Max rooms of this type the website may hold per night (website bookings only); null = all free rooms';

-- Rooms of a type the website may still sell for EVERY night in [check_in, check_out):
-- the physical count, further capped by online_limit − website bookings on the busiest night.
create or replace function public.bk_web_available_count(
  p_room_type_id uuid, p_check_in date, p_check_out date
) returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_phys int := public.bk_available_count(p_room_type_id, p_check_in, p_check_out);
  v_limit int;
  v_peak int;
begin
  select online_limit into v_limit from public.bk_room_types where id = p_room_type_id;
  if v_limit is null or v_phys <= 0 then return v_phys; end if;
  select coalesce(max(c), 0) into v_peak from (
    select count(*)::int c
      from generate_series(p_check_in, p_check_out - 1, interval '1 day') d
      join public.bk_bookings k
        on k.room_type_id = p_room_type_id
       and k.source = 'website'
       and k.status not in ('cancelled','no_show')
       and k.check_in <= d::date and k.check_out > d::date
     group by d
  ) x;
  return greatest(least(v_phys, v_limit - v_peak), 0);
end $$;
revoke all on function public.bk_web_available_count(uuid, date, date) from public, anon;
grant execute on function public.bk_web_available_count(uuid, date, date) to authenticated, service_role;

-- bk_availability is the guest search: it now reports the website count.
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
         public.bk_web_available_count(rt.id, p_check_in, p_check_out),
         public.bk_nightly_rates(rt.id, p_check_in, p_check_out),
         (select coalesce(sum((e->>'rate')::numeric), 0) from jsonb_array_elements(public.bk_nightly_rates(rt.id, p_check_in, p_check_out)) e),
         public.bk_min_stay(rt.id, p_check_in),
         (p_check_out - p_check_in) >= public.bk_min_stay(rt.id, p_check_in),
         (coalesce(p_adults,2) <= rt.max_adults and coalesce(p_children,0) <= rt.max_children)
  from public.bk_room_types rt
  where rt.is_active
  order by rt.sort_order, rt.name_en;
end $$;

-- bk_quote: same body as 0010 plus web_available_count (available_count stays
-- the physical count the staff booking form shows).
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
    'web_available_count', public.bk_web_available_count(p_room_type_id, p_check_in, p_check_out),
    'min_stay', public.bk_min_stay(p_room_type_id, p_check_in),
    'fits_capacity', (coalesce(p_adults,2) <= v_rt.max_adults and coalesce(p_children,0) <= v_rt.max_children)
  );
end $$;

-- bk_create_booking: same body as 0013; website bookings check the online limit.
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
  v_bed text := nullif(trim(coalesce(p->>'bed_preference','')), '');
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
  -- Bed layout: only meaningful for types that offer a choice. A missing
  -- choice takes the type's first option; an unknown one is rejected.
  if coalesce(array_length(v_rt.bed_options, 1), 0) > 0 then
    if v_bed is null then
      v_bed := v_rt.bed_options[1];
    elsif not (v_bed = any (v_rt.bed_options)) then
      raise exception 'invalid_bed_preference' using errcode = '22023';
    end if;
  else
    v_bed := null;
  end if;

  perform pg_advisory_xact_lock(hashtext(v_rt.id::text));

  -- Website bookings are also held to the type's online limit (0015).
  v_avail := case when v_source = 'website'
                  then public.bk_web_available_count(v_rt.id, v_check_in, v_check_out)
                  else public.bk_available_count(v_rt.id, v_check_in, v_check_out) end;
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
    promo_code, special_requests, internal_notes, bed_preference, source, created_by
  ) values (
    v_ref, v_contact, v_name, v_email, v_phone, nullif(trim(coalesce(p->>'nationality','')),''), v_lang,
    v_rt.id, v_room_id, v_check_in, v_check_out, v_adults, v_children, v_status,
    v_quote->'nightly', (v_quote->>'room_subtotal')::numeric, (v_quote->>'discount')::numeric, (v_quote->>'addons_total')::numeric,
    (v_quote->>'service_charge')::numeric, (v_quote->>'tourism_fee')::numeric, (v_quote->>'vat')::numeric, (v_quote->>'total')::numeric,
    v_quote->>'promo_code', nullif(trim(coalesce(p->>'special_requests','')),''), nullif(trim(coalesce(p->>'internal_notes','')),''), v_bed,
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

-- ----------------------------------------------------------------------------
-- Real inventory: 4 Family Deluxe, 2 Sama Suite City View, 2 Sama Suite
-- Mountain View. Drops the placeholder rooms beyond those counts; a room that
-- a booking or block references is kept (set it to maintenance on /rooms).
-- ----------------------------------------------------------------------------
delete from public.bk_rooms r
 where r.room_number in ('305','306','307','308','403','404','405','413','414','415')
   and not exists (select 1 from public.bk_bookings k where k.room_id = r.id)
   and not exists (select 1 from public.bk_inventory_blocks b where b.room_id = r.id);

-- ----------------------------------------------------------------------------
-- Sama Suite — Mountain View: no jacuzzi.
-- ----------------------------------------------------------------------------
update public.bk_room_types set
  name_en = 'Sama Suite — Mountain View',
  name_ar = 'جناح سما — إطلالة الجبل',
  tagline_en = 'Mountain sunset, two balconies and a sitting area.',
  tagline_ar = 'غروب الجبل وشرفتان وركن جلوس.',
  description_en = 'Our signature 29 m² suite on the sunset side: twin beds, two balconies over the mountains, a sitting area and two bathrooms. The room to book for an occasion.',
  description_ar = 'جناحنا المميز بمساحة 29 م² في جهة الغروب: سريران منفصلان، شرفتان تطلان على الجبال، ركن جلوس وحمّامان. الخيار الأمثل للمناسبات.',
  amenities = amenities - 'jacuzzi'
where slug = 'sama-suite-mountain-view';
