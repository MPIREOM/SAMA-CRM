-- 0013: twin or king. Room types can offer a choice of bed layout (the two
-- Deluxe rooms at launch); the guest picks one when booking, staff assign a
-- room with that layout. Availability stays per room type.

alter table public.bk_room_types
  add column if not exists bed_options text[] not null default '{}';
comment on column public.bk_room_types.bed_options is 'Bed layouts the guest may choose (twin, king); empty = one fixed layout described by bed_config_*';

alter table public.bk_rooms
  add column if not exists bed_type text;
alter table public.bk_rooms drop constraint if exists bk_rooms_bed_type_check;
alter table public.bk_rooms
  add constraint bk_rooms_bed_type_check check (bed_type is null or bed_type in ('twin', 'king'));
comment on column public.bk_rooms.bed_type is 'Physical bed layout of this room (twin | king); null = not recorded yet';

alter table public.bk_bookings
  add column if not exists bed_preference text;
alter table public.bk_bookings drop constraint if exists bk_bookings_bed_preference_check;
alter table public.bk_bookings
  add constraint bk_bookings_bed_preference_check check (bed_preference is null or bed_preference in ('twin', 'king'));
comment on column public.bk_bookings.bed_preference is 'Bed layout the guest chose (twin | king); staff assign a matching room';

-- The two Deluxe rooms offer both layouts. Website guests must choose; a
-- staff booking without a choice takes the first entry.
update public.bk_room_types set bed_options = array['twin', 'king'] where slug in ('deluxe-mountain-view', 'deluxe-city-view') and bed_options = '{}';

-- bk_create_booking: accept bed_preference (same body as 0010 otherwise).
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
revoke all on function public.bk_create_booking(jsonb) from public, anon;
grant execute on function public.bk_create_booking(jsonb) to authenticated, service_role;
