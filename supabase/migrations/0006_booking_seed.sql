-- ============================================================================
-- SAMA — Migration 0006 — Booking engine seed data
-- Room types (the six real ones), 60 rooms, weekend rate plan, settings,
-- and hand-over of booking messaging from the CRM automations to the engine.
-- Idempotent: room types keyed by slug, rooms by room_number, settings by key.
-- Unit counts and rates are PLACEHOLDERS except: 60 total, 14 chalets.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Room types
-- ----------------------------------------------------------------------------
insert into public.bk_room_types
  (slug, crm_value, name_en, name_ar, tagline_en, tagline_ar, description_en, description_ar,
   view_en, view_ar, bed_config_en, bed_config_ar, size_sqm, max_adults, max_children,
   amenities, images, base_rate_omr, sort_order)
values
  ('deluxe-mountain-view', 'Deluxe Room Mountain View',
   'Deluxe Room — Mountain & Sunset View', 'غرفة ديلوكس — إطلالة الجبل والغروب',
   'Twin beds, private balcony over the pool and the canyon.', 'سريران منفصلان وشرفة خاصة تطل على المسبح والوادي.',
   'A calm 27 m² room with a private balcony facing the mountains and the swimming pool — the sunset side of the hotel. Twin beds, a work desk, tea and coffee tray, and a marble bathroom. Ideal for friends or couples who prefer separate beds.',
   'غرفة هادئة بمساحة 27 م² مع شرفة خاصة تطل على الجبال والمسبح في الجهة المواجهة للغروب. سريران منفصلان، مكتب، ركن للشاي والقهوة، وحمام رخامي. مثالية للأصدقاء أو الأزواج الذين يفضلون سريرين منفصلين.',
   'Mountain, pool & sunset', 'الجبل والمسبح والغروب', '2 twin beds (90 × 130 cm)', 'سريران منفصلان (90 × 130 سم)', 27, 2, 1,
   '["wifi","ac","heating","balcony","tv","tea_coffee","minibar","safe","hairdryer","toiletries","room_service","mountain_view","pool_view"]',
   '{"/images/rooms/deluxe-mountain-view/1.jpg","/images/rooms/deluxe-mountain-view/2.jpg","/images/rooms/deluxe-mountain-view/3.jpg"}',
   55.000, 10),

  ('deluxe-city-view', 'Deluxe Room City View',
   'Deluxe Room — City & Sunrise View', 'غرفة ديلوكس — إطلالة المدينة والشروق',
   'King bed and a balcony that catches the first light over Sayq.', 'سرير كينغ وشرفة تستقبل أول خيوط الشمس فوق سيق.',
   'A 27 m² room with a king bed and a private balcony facing Sayq village and the sunrise. Work desk, tea and coffee tray, and a marble bathroom. Our most popular room for couples.',
   'غرفة بمساحة 27 م² مع سرير كينغ وشرفة خاصة تطل على قرية سيق والشروق. مكتب، ركن للشاي والقهوة، وحمام رخامي. الغرفة الأكثر طلباً للأزواج.',
   'City & sunrise', 'المدينة والشروق', '1 king bed (181 × 210 cm)', 'سرير كينغ (181 × 210 سم)', 27, 2, 1,
   '["wifi","ac","heating","balcony","tv","tea_coffee","minibar","safe","hairdryer","toiletries","room_service","city_view"]',
   '{"/images/rooms/deluxe-city-view/1.jpg","/images/rooms/deluxe-city-view/2.jpg"}',
   50.000, 20),

  ('family-deluxe', 'Family Deluxe',
   'Family Deluxe Room', 'غرفة عائلية ديلوكس',
   'Room for the whole family, sunrise side.', 'غرفة تتسع للعائلة في جهة الشروق.',
   'A 27 m² family room with a king bed, space for children, a balcony on the sunrise side and one bathroom. Extra beds available on request (OMR 10 per night). Close to the children''s park.',
   'غرفة عائلية بمساحة 27 م² مع سرير كينغ ومساحة للأطفال وشرفة في جهة الشروق وحمام واحد. تتوفر أسرّة إضافية عند الطلب (10 ر.ع لليلة). قريبة من حديقة الأطفال.',
   'City & sunrise', 'المدينة والشروق', '1 king bed + extra bed on request', 'سرير كينغ + سرير إضافي عند الطلب', 27, 2, 2,
   '["wifi","ac","heating","balcony","tv","tea_coffee","minibar","safe","hairdryer","toiletries","room_service","city_view","family"]',
   '{"/images/rooms/family-deluxe/1.jpg","/images/rooms/family-deluxe/2.jpg"}',
   70.000, 30),

  ('chalet', 'Chalet',
   'Chalet', 'شاليه',
   'Your own garden on the edge of the canyon, next to the pool.', 'حديقتك الخاصة على حافة الوادي بجوار المسبح.',
   'One-bedroom chalets set in a private garden near the swimming pool, facing the canyon and the sunset. King bed, sitting corner, tea and coffee tray. The quietest way to stay on the mountain — we have 14 of them.',
   'شاليهات بغرفة نوم واحدة في حديقة خاصة قرب المسبح، تطل على الوادي والغروب. سرير كينغ، ركن جلوس، وركن للشاي والقهوة. الخيار الأكثر هدوءاً للإقامة على الجبل — لدينا 14 شاليهاً.',
   'Canyon, pool & sunset', 'الوادي والمسبح والغروب', '1 king bed', 'سرير كينغ', null, 2, 1,
   '["wifi","ac","heating","private_garden","tv","tea_coffee","minibar","safe","hairdryer","toiletries","room_service","mountain_view","pool_view"]',
   '{"/images/rooms/chalet/1.jpg","/images/rooms/chalet/2.jpg"}',
   65.000, 40),

  ('sama-suite-city-view', 'Sama Suite City View',
   'Sama Suite — City View', 'جناح سما — إطلالة المدينة',
   'Two balconies, a sitting area and two bathrooms.', 'شرفتان وركن جلوس وحمّامان.',
   'A 29 m² suite with a king bed, a separate sitting area, two balconies on the sunrise side and two bathrooms. Room for a family or for a longer stay with space to breathe.',
   'جناح بمساحة 29 م² مع سرير كينغ وركن جلوس منفصل وشرفتين في جهة الشروق وحمّامين. مناسب للعائلة أو للإقامات الطويلة مع مساحة أرحب.',
   'City & sunrise', 'المدينة والشروق', '1 king bed (181 × 210 cm)', 'سرير كينغ (181 × 210 سم)', 29, 2, 1,
   '["wifi","ac","heating","balcony","sitting_area","two_bathrooms","tv","tea_coffee","minibar","safe","hairdryer","bathrobe","toiletries","room_service","city_view"]',
   '{"/images/rooms/sama-suite-city-view/1.jpg","/images/rooms/sama-suite-city-view/2.jpg"}',
   85.000, 50),

  ('sama-suite-mountain-view', 'Sama Suite Mountain View',
   'Sama Suite — Mountain View with Jacuzzi', 'جناح سما — إطلالة الجبل مع جاكوزي',
   'Mountain sunset, two balconies and a private jacuzzi.', 'غروب الجبل وشرفتان وجاكوزي خاص.',
   'Our signature 29 m² suite on the sunset side: twin beds, two balconies over the mountains, a sitting area, and two bathrooms — one with a private jacuzzi. The room to book for an occasion.',
   'جناحنا المميز بمساحة 29 م² في جهة الغروب: سريران منفصلان، شرفتان تطلان على الجبال، ركن جلوس، وحمّامان أحدهما مع جاكوزي خاص. الخيار الأمثل للمناسبات.',
   'Mountain & sunset', 'الجبل والغروب', '2 twin beds (90 × 130 cm)', 'سريران منفصلان (90 × 130 سم)', 29, 2, 1,
   '["wifi","ac","heating","balcony","jacuzzi","sitting_area","two_bathrooms","tv","tea_coffee","minibar","safe","hairdryer","bathrobe","toiletries","room_service","mountain_view"]',
   '{"/images/rooms/sama-suite-mountain-view/1.jpg","/images/rooms/sama-suite-mountain-view/2.jpg"}',
   95.000, 60)
on conflict (slug) do update set
  crm_value = excluded.crm_value, name_en = excluded.name_en, name_ar = excluded.name_ar,
  tagline_en = excluded.tagline_en, tagline_ar = excluded.tagline_ar,
  description_en = excluded.description_en, description_ar = excluded.description_ar,
  view_en = excluded.view_en, view_ar = excluded.view_ar,
  bed_config_en = excluded.bed_config_en, bed_config_ar = excluded.bed_config_ar,
  size_sqm = excluded.size_sqm, max_adults = excluded.max_adults, max_children = excluded.max_children,
  amenities = excluded.amenities, images = excluded.images, sort_order = excluded.sort_order;
-- (base_rate_omr intentionally NOT overwritten on re-run so staff edits survive)

-- ----------------------------------------------------------------------------
-- 2. Rooms — 60 units (placeholder numbering; only 60 total / 14 chalets confirmed)
-- ----------------------------------------------------------------------------
with spec as (
  select 'deluxe-mountain-view' slug, '1' floor, 101 first_no, 14 cnt, 'R' prefix union all
  select 'deluxe-city-view', '2', 201, 14, 'R' union all
  select 'family-deluxe', '3', 301, 8, 'R' union all
  select 'sama-suite-city-view', '4', 401, 5, 'R' union all
  select 'sama-suite-mountain-view', '4', 411, 5, 'R' union all
  select 'chalet', 'Garden', 1, 14, 'C'
)
insert into public.bk_rooms (room_type_id, room_number, floor, sort_order)
select rt.id,
       case when s.prefix = 'C' then 'C' || lpad(n::text, 2, '0') else n::text end,
       s.floor,
       case when s.prefix = 'C' then 500 + n else n end
from spec s
join public.bk_room_types rt on rt.slug = s.slug
cross join lateral generate_series(s.first_no, s.first_no + s.cnt - 1) n
on conflict (room_number) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Weekend rate plan: Thursday & Friday nights +20 % for two years
-- ----------------------------------------------------------------------------
insert into public.bk_rate_plans (name, room_type_id, start_date, end_date, adjust_pct, min_stay, days_of_week, priority)
select 'Weekend (Thu & Fri nights) +20%', null, current_date, current_date + interval '2 years', 20, 1, array[4,5], 10
where not exists (select 1 from public.bk_rate_plans where name = 'Weekend (Thu & Fri nights) +20%');

-- ----------------------------------------------------------------------------
-- 4. Settings
-- ----------------------------------------------------------------------------
insert into public.bk_settings (key, value) values
  ('taxes', '{"service_charge_pct": 8, "service_charge_enabled": true, "tourism_fee_pct": 4, "tourism_fee_enabled": true, "vat_pct": 5, "vat_enabled": true, "vat_on_fees": true}'),
  ('times', '{"check_in": "14:00", "check_out": "12:00"}'),
  ('cancellation', '{"hours_before": 48,
     "policy_en": "Free cancellation up to 48 hours before check-in (2:00 PM hotel time). Cancellations after that, and no-shows, are charged the first night. Group bookings follow the terms on their confirmation.",
     "policy_ar": "إلغاء مجاني حتى 48 ساعة قبل موعد تسجيل الوصول (الساعة 2:00 ظهراً بتوقيت الفندق). يتم احتساب قيمة الليلة الأولى في حال الإلغاء بعد ذلك أو عدم الحضور. تخضع حجوزات المجموعات للشروط الواردة في تأكيد الحجز."}'),
  ('contact', '{"phone": "+96822507681", "whatsapp": "+96899475688", "email": "reservations@samahotel.net",
     "maps_link": "https://www.google.com/maps/place/Sama+Al+Akhdar+Hotel,+Sayq/@23.0722417,57.6665111,17z",
     "address_en": "Sayq, Jabal Al Akhdar, Ad Dakhiliyah, Sultanate of Oman", "address_ar": "سيق، الجبل الأخضر، محافظة الداخلية، سلطنة عُمان",
     "instagram": "", "website": "https://samahotel.net"}'),
  ('hotel', '{"name_en": "Sama Hotel", "name_ar": "فندق سما", "altitude_m": 2000, "drive_from_muscat_h": 2, "units": 60,
     "legal_name": "Riyadha Al Jabal Al Akhdar Trading Co. L.L.C (Sama Hotels)", "star_rating": 3}'),
  ('reviews', '{"google": "", "tripadvisor": ""}'),
  ('booking', '{"max_nights": 30, "max_advance_days": 365, "weekend_days": [4,5], "extra_bed_omr": 10, "child_free_under": 8, "rate_limit_per_min": 10}'),
  ('messaging', '{"email_enabled": true, "whatsapp_enabled": true,
     "pre_arrival_days_before": 3, "pre_arrival_time": "10:00", "post_stay_days_after": 1, "post_stay_time": "11:00",
     "test_phone": "", "test_email": "",
     "whatsapp_templates": {"confirmation": "sama_booking_confirmation", "pre_arrival": "sama_pre_arrival_guide", "post_stay": "sama_post_stay_review"}}'),
  ('promo', '{"codes": [{"code": "SAMA10", "percent": 10, "valid_until": "2027-09-30", "enabled": true, "note": "Returning-guest code sent in the post-stay message"}]}'),
  ('cron', jsonb_build_object('secret', encode(gen_random_bytes(24), 'hex'), 'dispatch_url', 'https://sama-crm.vercel.app/api/cron/dispatch'))
on conflict (key) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Hand booking messaging over to the engine (reversible in /automations)
-- ----------------------------------------------------------------------------
update public.automations
   set enabled = false
 where trigger_kind in ('booking_created', 'pre_arrival', 'post_stay')
   and enabled = true;
