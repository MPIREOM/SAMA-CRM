// Seed data mirroring supabase/migrations/0006_booking_seed.sql (six real room
// types, 60 rooms, weekend rate plan, settings) plus the five CRM automations
// from 0001 with the booking-driven ones disabled, and two staff profiles for
// the GoTrue emulation. Ids are deterministic so tests can reference them.

import { muscatToday } from "../../src/lib/booking-engine";
import type { Db, Row } from "./db";

const pad = (n: number, width: number) => String(n).padStart(width, "0");
/** Deterministic, well-formed v4-looking UUIDs: <prefix>-0000-4000-8000-<12 digits>. */
export const fixedId = (prefix: string, n: number): string => `${prefix}-0000-4000-8000-${pad(n, 12)}`;

export const ROOM_TYPE_IDS = {
  "deluxe-mountain-view": fixedId("10000000", 1),
  "deluxe-city-view": fixedId("10000000", 2),
  "family-deluxe": fixedId("10000000", 3),
  chalet: fixedId("10000000", 4),
  "sama-suite-city-view": fixedId("10000000", 5),
  "sama-suite-mountain-view": fixedId("10000000", 6),
} as const;

export const WEEKEND_PLAN_ID = fixedId("30000000", 1);

/** Add-ons from migration 0010 (deterministic ids so tests can reference them). */
export const ADDON_IDS = {
  "apex-zipline": fixedId("60000000", 1),
  "transfer-up": fixedId("60000000", 2),
  "transfer-down": fixedId("60000000", 3),
} as const;

export const USERS = {
  admin: { id: fixedId("40000000", 1), email: "admin@sama.test", password: "Admin1234!", full_name: "Sama Admin", role: "super_admin" },
  desk: { id: fixedId("40000000", 2), email: "desk@sama.test", password: "Desk1234!", full_name: "Front Desk", role: "reservation_desk" },
} as const;

export const CRON_SECRET = "mock-cron-secret";

const ROOM_TYPES: Row[] = [
  {
    id: ROOM_TYPE_IDS["deluxe-mountain-view"],
    slug: "deluxe-mountain-view",
    crm_value: "Deluxe Room Mountain View",
    name_en: "Deluxe Room — Mountain & Sunset View",
    name_ar: "غرفة ديلوكس — إطلالة الجبل والغروب",
    tagline_en: "Twin beds, private balcony over the pool and the canyon.",
    tagline_ar: "سريران منفصلان وشرفة خاصة تطل على المسبح والوادي.",
    description_en:
      "A calm 27 m² room with a private balcony facing the mountains and the swimming pool — the sunset side of the hotel. Twin beds, a work desk, tea and coffee tray, and a marble bathroom. Ideal for friends or couples who prefer separate beds.",
    description_ar:
      "غرفة هادئة بمساحة 27 م² مع شرفة خاصة تطل على الجبال والمسبح في الجهة المواجهة للغروب. سريران منفصلان، مكتب، ركن للشاي والقهوة، وحمام رخامي. مثالية للأصدقاء أو الأزواج الذين يفضلون سريرين منفصلين.",
    view_en: "Mountain, pool & sunset",
    view_ar: "الجبل والمسبح والغروب",
    bed_config_en: "2 twin beds (90 × 130 cm)",
    bed_config_ar: "سريران منفصلان (90 × 130 سم)",
    size_sqm: 27,
    max_adults: 2,
    max_children: 1,
    amenities: ["wifi", "ac", "heating", "balcony", "tv", "tea_coffee", "minibar", "safe", "hairdryer", "toiletries", "room_service", "mountain_view", "pool_view"],
    images: ["/images/rooms/deluxe-mountain-view/1.jpg", "/images/rooms/deluxe-mountain-view/2.jpg", "/images/rooms/deluxe-mountain-view/3.jpg", "/images/rooms/deluxe-mountain-view/4.jpg"],
    base_rate_omr: 55,
    sort_order: 10,
  },
  {
    id: ROOM_TYPE_IDS["deluxe-city-view"],
    slug: "deluxe-city-view",
    crm_value: "Deluxe Room City View",
    name_en: "Deluxe Room — City & Sunrise View",
    name_ar: "غرفة ديلوكس — إطلالة المدينة والشروق",
    tagline_en: "King bed and a balcony that catches the first light over Sayq.",
    tagline_ar: "سرير كينغ وشرفة تستقبل أول خيوط الشمس فوق سيق.",
    description_en:
      "A 27 m² room with a king bed and a private balcony facing Sayq village and the sunrise. Work desk, tea and coffee tray, and a marble bathroom. Our most popular room for couples.",
    description_ar: "غرفة بمساحة 27 م² مع سرير كينغ وشرفة خاصة تطل على قرية سيق والشروق. مكتب، ركن للشاي والقهوة، وحمام رخامي. الغرفة الأكثر طلباً للأزواج.",
    view_en: "City & sunrise",
    view_ar: "المدينة والشروق",
    bed_config_en: "1 king bed (181 × 210 cm)",
    bed_config_ar: "سرير كينغ (181 × 210 سم)",
    size_sqm: 27,
    max_adults: 2,
    max_children: 1,
    amenities: ["wifi", "ac", "heating", "balcony", "tv", "tea_coffee", "minibar", "safe", "hairdryer", "toiletries", "room_service", "city_view"],
    images: ["/images/rooms/deluxe-city-view/1.jpg", "/images/rooms/deluxe-city-view/2.jpg", "/images/rooms/deluxe-city-view/3.jpg", "/images/rooms/deluxe-city-view/4.jpg"],
    base_rate_omr: 50,
    sort_order: 20,
  },
  {
    id: ROOM_TYPE_IDS["family-deluxe"],
    slug: "family-deluxe",
    crm_value: "Family Deluxe",
    name_en: "Family Deluxe Room",
    name_ar: "غرفة عائلية ديلوكس",
    tagline_en: "Room for the whole family, sunrise side.",
    tagline_ar: "غرفة تتسع للعائلة في جهة الشروق.",
    description_en:
      "A 27 m² family room with a king bed, space for children, a balcony on the sunrise side and one bathroom. Extra beds available on request (OMR 10 per night). Close to the children's park.",
    description_ar:
      "غرفة عائلية بمساحة 27 م² مع سرير كينغ ومساحة للأطفال وشرفة في جهة الشروق وحمام واحد. تتوفر أسرّة إضافية عند الطلب (10 ر.ع لليلة). قريبة من حديقة الأطفال.",
    view_en: "City & sunrise",
    view_ar: "المدينة والشروق",
    bed_config_en: "1 king bed + extra bed on request",
    bed_config_ar: "سرير كينغ + سرير إضافي عند الطلب",
    size_sqm: 27,
    max_adults: 2,
    max_children: 2,
    amenities: ["wifi", "ac", "heating", "balcony", "tv", "tea_coffee", "minibar", "safe", "hairdryer", "toiletries", "room_service", "city_view", "family"],
    images: ["/images/rooms/family-deluxe/1.jpg", "/images/rooms/family-deluxe/2.jpg", "/images/rooms/family-deluxe/3.jpg", "/images/rooms/family-deluxe/4.jpg", "/images/rooms/family-deluxe/5.jpg"],
    base_rate_omr: 70,
    sort_order: 30,
  },
  {
    id: ROOM_TYPE_IDS.chalet,
    slug: "chalet",
    crm_value: "Chalet",
    name_en: "Chalet",
    name_ar: "شاليه",
    tagline_en: "Your own garden on the edge of the canyon, next to the pool.",
    tagline_ar: "حديقتك الخاصة على حافة الوادي بجوار المسبح.",
    description_en:
      "One-bedroom chalets set in a private garden near the swimming pool, facing the canyon and the sunset. King bed, sitting corner, tea and coffee tray. The quietest way to stay on the mountain — we have 14 of them.",
    description_ar:
      "شاليهات بغرفة نوم واحدة في حديقة خاصة قرب المسبح، تطل على الوادي والغروب. سرير كينغ، ركن جلوس، وركن للشاي والقهوة. الخيار الأكثر هدوءاً للإقامة على الجبل — لدينا 14 شاليهاً.",
    view_en: "Canyon, pool & sunset",
    view_ar: "الوادي والمسبح والغروب",
    bed_config_en: "1 king bed",
    bed_config_ar: "سرير كينغ",
    size_sqm: null,
    max_adults: 2,
    max_children: 1,
    amenities: ["wifi", "ac", "heating", "private_garden", "tv", "tea_coffee", "minibar", "safe", "hairdryer", "toiletries", "room_service", "mountain_view", "pool_view"],
    images: ["/images/rooms/chalet/1.jpg", "/images/rooms/chalet/2.jpg", "/images/rooms/chalet/3.jpg", "/images/rooms/chalet/4.jpg", "/images/rooms/chalet/5.jpg", "/images/rooms/chalet/6.jpg"],
    base_rate_omr: 65,
    sort_order: 40,
  },
  {
    id: ROOM_TYPE_IDS["sama-suite-city-view"],
    slug: "sama-suite-city-view",
    crm_value: "Sama Suite City View",
    name_en: "Sama Suite — City View",
    name_ar: "جناح سما — إطلالة المدينة",
    tagline_en: "Two balconies, a sitting area and two bathrooms.",
    tagline_ar: "شرفتان وركن جلوس وحمّامان.",
    description_en:
      "A 29 m² suite with a king bed, a separate sitting area, two balconies on the sunrise side and two bathrooms. Room for a family or for a longer stay with space to breathe.",
    description_ar: "جناح بمساحة 29 م² مع سرير كينغ وركن جلوس منفصل وشرفتين في جهة الشروق وحمّامين. مناسب للعائلة أو للإقامات الطويلة مع مساحة أرحب.",
    view_en: "City & sunrise",
    view_ar: "المدينة والشروق",
    bed_config_en: "1 king bed (181 × 210 cm)",
    bed_config_ar: "سرير كينغ (181 × 210 سم)",
    size_sqm: 29,
    max_adults: 2,
    max_children: 1,
    amenities: ["wifi", "ac", "heating", "balcony", "sitting_area", "two_bathrooms", "tv", "tea_coffee", "minibar", "safe", "hairdryer", "bathrobe", "toiletries", "room_service", "city_view"],
    images: ["/images/rooms/sama-suite-city-view/1.jpg", "/images/rooms/sama-suite-city-view/2.jpg", "/images/rooms/sama-suite-city-view/3.jpg", "/images/rooms/sama-suite-city-view/4.jpg"],
    base_rate_omr: 85,
    sort_order: 50,
  },
  {
    id: ROOM_TYPE_IDS["sama-suite-mountain-view"],
    slug: "sama-suite-mountain-view",
    crm_value: "Sama Suite Mountain View",
    name_en: "Sama Suite — Mountain View with Jacuzzi",
    name_ar: "جناح سما — إطلالة الجبل مع جاكوزي",
    tagline_en: "Mountain sunset, two balconies and a private jacuzzi.",
    tagline_ar: "غروب الجبل وشرفتان وجاكوزي خاص.",
    description_en:
      "Our signature 29 m² suite on the sunset side: twin beds, two balconies over the mountains, a sitting area, and two bathrooms — one with a private jacuzzi. The room to book for an occasion.",
    description_ar: "جناحنا المميز بمساحة 29 م² في جهة الغروب: سريران منفصلان، شرفتان تطلان على الجبال، ركن جلوس، وحمّامان أحدهما مع جاكوزي خاص. الخيار الأمثل للمناسبات.",
    view_en: "Mountain & sunset",
    view_ar: "الجبل والغروب",
    bed_config_en: "2 twin beds (90 × 130 cm)",
    bed_config_ar: "سريران منفصلان (90 × 130 سم)",
    size_sqm: 29,
    max_adults: 2,
    max_children: 1,
    amenities: ["wifi", "ac", "heating", "balcony", "jacuzzi", "sitting_area", "two_bathrooms", "tv", "tea_coffee", "minibar", "safe", "hairdryer", "bathrobe", "toiletries", "room_service", "mountain_view"],
    images: ["/images/rooms/sama-suite-mountain-view/1.jpg", "/images/rooms/sama-suite-mountain-view/2.jpg", "/images/rooms/sama-suite-mountain-view/3.jpg", "/images/rooms/sama-suite-mountain-view/4.jpg"],
    base_rate_omr: 95,
    sort_order: 60,
  },
];

// Rooms — 60 units (placeholder numbering; only 60 total / 14 chalets confirmed).
const ROOM_SPEC: { slug: keyof typeof ROOM_TYPE_IDS; floor: string; first: number; count: number; prefix: "R" | "C" }[] = [
  { slug: "deluxe-mountain-view", floor: "1", first: 101, count: 14, prefix: "R" },
  { slug: "deluxe-city-view", floor: "2", first: 201, count: 14, prefix: "R" },
  { slug: "family-deluxe", floor: "3", first: 301, count: 8, prefix: "R" },
  { slug: "sama-suite-city-view", floor: "4", first: 401, count: 5, prefix: "R" },
  { slug: "sama-suite-mountain-view", floor: "4", first: 411, count: 5, prefix: "R" },
  { slug: "chalet", floor: "Garden", first: 1, count: 14, prefix: "C" },
];

function rooms(): Row[] {
  const out: Row[] = [];
  let seq = 0;
  for (const s of ROOM_SPEC) {
    for (let n = s.first; n < s.first + s.count; n++) {
      seq += 1;
      out.push({
        id: fixedId("20000000", seq),
        room_type_id: ROOM_TYPE_IDS[s.slug],
        room_number: s.prefix === "C" ? `C${pad(n, 2)}` : String(n),
        floor: s.floor,
        sort_order: s.prefix === "C" ? 500 + n : n,
      });
    }
  }
  return out;
}

// Add-ons — migration 0010 seed, verbatim (APEX Zipline OMR 5 per rider, 4WD transfers OMR 15 per car).
const ADDONS: Row[] = [
  {
    id: ADDON_IDS["apex-zipline"],
    slug: "apex-zipline",
    kind: "activity",
    name_en: "APEX Zipline",
    name_ar: "أبكس زيبلاين",
    tagline_en: "310 m over the canyon at up to 60 km/h — it starts right next to the hotel.",
    tagline_ar: "310 متراً فوق الوادي بسرعة تصل إلى 60 كم/س — ينطلق من جوار الفندق مباشرة.",
    description_en:
      "Fly 310 metres across the canyon, about 20 metres above the terraces of Al Aqar, Al Shraija and Al Ain, at up to 60 km/h. The launch platform is a short walk from the hotel and the ride ends at Layali Al Jabal Al Akhdar. Hotel guests pay a special rate; we book your slot for the day you prefer and you pay with your room. Maximum rider weight 120 kg; children ride with a guardian's consent.",
    description_ar:
      "انطلقوا 310 أمتار فوق الوادي على ارتفاع نحو 20 متراً فوق مدرجات العقر والشريجة والعين، بسرعة تصل إلى 60 كم/س. منصة الانطلاق على بُعد خطوات من الفندق، وتنتهي الرحلة عند ليالي الجبل الأخضر. يحصل نزلاء الفندق على سعر خاص؛ نحجز لكم موعدكم في اليوم الذي تفضلونه وتدفعون مع فاتورة الغرفة. الحد الأقصى لوزن الراكب 120 كجم، ويشارك الأطفال بموافقة ولي الأمر.",
    price_omr: 5,
    unit: "per_person",
    max_quantity: 10,
    taxable: false,
    requires_note: true,
    note_hint_en: "Preferred day (arrival day, any day of your stay) and any riders under 16",
    note_hint_ar: "اليوم المفضل (يوم الوصول أو أي يوم خلال الإقامة) وعدد الراكبين تحت 16 عاماً",
    image: "/images/addons/apex-zipline.jpg",
    details: { length_m: 310, height_m: 20, speed_kmh: 60, max_weight_kg: 120, website: "https://www.apexzipline.com", operator: "Al Jabal Adventures LLC" },
    sort_order: 10,
  },
  {
    id: ADDON_IDS["transfer-up"],
    slug: "transfer-up",
    kind: "transfer",
    name_en: "4WD transfer up — Birkat Al Mouz to the hotel",
    name_ar: "نقل بسيارة دفع رباعي صعوداً — من بركة الموز إلى الفندق",
    tagline_en: "Leave your car at the checkpoint car park; we bring you up the mountain.",
    tagline_ar: "اتركوا سيارتكم في موقف نقطة التفتيش ونحن نصعد بكم إلى الجبل.",
    description_en:
      "The police checkpoint at Birkat Al Mouz does not allow 2WD cars up Jabal Al Akhdar. Park at the checkpoint car park and our 4WD collects you and your luggage and drives you to the hotel (about 45 minutes). Price is per car, up to 4 guests. Tell us your expected arrival time; we confirm the pickup by WhatsApp.",
    description_ar:
      "لا تسمح نقطة التفتيش في بركة الموز بصعود سيارات الدفع الثنائي إلى الجبل الأخضر. اركنوا سيارتكم في موقف نقطة التفتيش وستقلّكم سيارة الدفع الرباعي مع أمتعتكم إلى الفندق (نحو 45 دقيقة). السعر للسيارة الواحدة حتى 4 نزلاء. أخبرونا بوقت وصولكم المتوقع وسنؤكد الموعد عبر واتساب.",
    price_omr: 15,
    unit: "per_car",
    max_quantity: 3,
    taxable: false,
    requires_note: true,
    note_hint_en: "Expected arrival time at the checkpoint and number of guests",
    note_hint_ar: "وقت الوصول المتوقع إلى نقطة التفتيش وعدد النزلاء",
    image: "/images/addons/transfer.jpg",
    details: { max_guests_per_car: 4, pickup: "Birkat Al Mouz checkpoint car park", duration_min: 45 },
    sort_order: 20,
  },
  {
    id: ADDON_IDS["transfer-down"],
    slug: "transfer-down",
    kind: "transfer",
    name_en: "4WD transfer down — hotel to Birkat Al Mouz",
    name_ar: "نقل بسيارة دفع رباعي نزولاً — من الفندق إلى بركة الموز",
    tagline_en: "After check-out we drive you back down to your car.",
    tagline_ar: "بعد تسجيل المغادرة نعيدكم إلى سيارتكم عند نقطة التفتيش.",
    description_en:
      "On your check-out day our 4WD takes you and your luggage from the hotel back to the Birkat Al Mouz checkpoint car park. Price is per car, up to 4 guests. Tell us what time you would like to leave.",
    description_ar:
      "في يوم المغادرة تقلّكم سيارة الدفع الرباعي مع أمتعتكم من الفندق إلى موقف نقطة التفتيش في بركة الموز. السعر للسيارة الواحدة حتى 4 نزلاء. أخبرونا بالوقت الذي تودون المغادرة فيه.",
    price_omr: 15,
    unit: "per_car",
    max_quantity: 3,
    taxable: false,
    requires_note: true,
    note_hint_en: "Preferred departure time on check-out day",
    note_hint_ar: "وقت المغادرة المفضل في يوم تسجيل المغادرة",
    image: "/images/addons/transfer.jpg",
    details: { max_guests_per_car: 4, dropoff: "Birkat Al Mouz checkpoint car park", duration_min: 45 },
    sort_order: 30,
  },
];

const SETTINGS: Row[] = [
  { key: "taxes", value: { service_charge_pct: 8, service_charge_enabled: true, tourism_fee_pct: 4, tourism_fee_enabled: true, vat_pct: 5, vat_enabled: true, vat_on_fees: true } },
  { key: "times", value: { check_in: "14:00", check_out: "12:00" } },
  {
    key: "cancellation",
    value: {
      hours_before: 48,
      policy_en:
        "Free cancellation up to 48 hours before check-in (2:00 PM hotel time). Cancellations after that, and no-shows, are charged the first night. Group bookings follow the terms on their confirmation.",
      policy_ar:
        "إلغاء مجاني حتى 48 ساعة قبل موعد تسجيل الوصول (الساعة 2:00 ظهراً بتوقيت الفندق). يتم احتساب قيمة الليلة الأولى في حال الإلغاء بعد ذلك أو عدم الحضور. تخضع حجوزات المجموعات للشروط الواردة في تأكيد الحجز.",
    },
  },
  {
    key: "contact",
    value: {
      phone: "+96822507681",
      whatsapp: "+96899475688",
      email: "reservations@samahotel.net",
      maps_link: "https://www.google.com/maps/place/Sama+Al+Akhdar+Hotel,+Sayq/@23.0722417,57.6665111,17z",
      address_en: "Sayq, Jabal Al Akhdar, Ad Dakhiliyah, Sultanate of Oman",
      address_ar: "سيق، الجبل الأخضر، محافظة الداخلية، سلطنة عُمان",
      instagram: "",
      website: "https://samahotel.net",
    },
  },
  {
    key: "hotel",
    value: {
      name_en: "Sama Hotel",
      name_ar: "فندق سما",
      altitude_m: 2000,
      drive_from_muscat_h: 2,
      units: 60,
      legal_name: "Riyadha Al Jabal Al Akhdar Trading Co. L.L.C (Sama Hotels)",
      star_rating: 3,
    },
  },
  { key: "reviews", value: { google: "", tripadvisor: "" } },
  { key: "booking", value: { max_nights: 30, max_advance_days: 365, weekend_days: [4, 5], extra_bed_omr: 10, child_free_under: 8, rate_limit_per_min: 10 } },
  {
    key: "messaging",
    value: {
      email_enabled: true,
      whatsapp_enabled: true,
      pre_arrival_days_before: 3,
      pre_arrival_time: "10:00",
      post_stay_days_after: 1,
      post_stay_time: "11:00",
      test_phone: "",
      test_email: "",
      whatsapp_templates: { confirmation: "sama_booking_confirmation", pre_arrival: "sama_pre_arrival_guide", post_stay: "sama_post_stay_review" },
    },
  },
  { key: "promo", value: { codes: [{ code: "SAMA10", percent: 10, valid_until: "2027-09-30", enabled: true, note: "Returning-guest code sent in the post-stay message" }] } },
  { key: "cron", value: { secret: CRON_SECRET, dispatch_url: "http://127.0.0.1:3411/api/cron/dispatch" } },
];

const DIVIDER = "⸻⸻⸻";
const AUTOMATIONS: Row[] = [
  {
    id: fixedId("50000000", 1),
    name: "Booking confirmation | تأكيد الحجز",
    trigger_kind: "booking_created",
    offset_days: 0,
    channel: "whatsapp",
    msg_type: "utility",
    market: "All",
    template: [
      "عزيزي/عزيزتي {{name}}،",
      "تم تأكيد حجزكم في فندق سما ✅",
      "رقم الحجز: {{ref}}",
      "الوصول: {{check_in}} — المغادرة: {{check_out}}",
      "نوع الغرفة: {{room_type}}",
      "نتطلع لاستقبالكم!",
      DIVIDER,
      "Dear {{name}},",
      "Your booking at Sama Hotel is confirmed ✅",
      "Confirmation no: {{ref}}",
      "Check-in: {{check_in}} — Check-out: {{check_out}}",
      "Room type: {{room_type}}",
      "We look forward to welcoming you!",
    ].join("\n"),
    enabled: false,
  },
  {
    id: fixedId("50000000", 2),
    name: "Pre-arrival | قبل الوصول",
    trigger_kind: "pre_arrival",
    offset_days: 2,
    channel: "whatsapp",
    msg_type: "utility",
    market: "All",
    template: [
      "عزيزي/عزيزتي {{name}}،",
      "نذكّركم بموعد وصولكم إلى فندق سما بعد يومين ({{check_in}}) — حجز رقم {{ref}}.",
      "تسجيل الدخول من الساعة 2 ظهراً. لأي طلب خاص، راسلونا هنا.",
      DIVIDER,
      "Dear {{name}},",
      "A friendly reminder: your arrival at Sama Hotel is in 2 days ({{check_in}}) — booking {{ref}}.",
      "Check-in starts at 2 PM. For any special request, just reply here.",
    ].join("\n"),
    enabled: false,
  },
  {
    id: fixedId("50000000", 3),
    name: "Post-stay review | تقييم بعد الإقامة",
    trigger_kind: "post_stay",
    offset_days: 1,
    channel: "whatsapp",
    msg_type: "utility",
    market: "All",
    template: [
      "عزيزي/عزيزتي {{name}}،",
      "شكراً لاختياركم فندق سما! نأمل أن تكون إقامتكم ممتعة.",
      "يسعدنا سماع رأيكم — شاركونا تقييمكم برد على هذه الرسالة.",
      DIVIDER,
      "Dear {{name}},",
      "Thank you for staying at Sama Hotel! We hope you enjoyed your visit.",
      "We would love your feedback — simply reply to this message with your review.",
    ].join("\n"),
    enabled: false,
  },
  {
    id: fixedId("50000000", 4),
    name: "Birthday | تهنئة عيد الميلاد",
    trigger_kind: "birthday",
    offset_days: 0,
    channel: "whatsapp",
    msg_type: "marketing",
    market: "Oman+GCC",
    template: [
      "عزيزي/عزيزتي {{name}}،",
      "كل عام وأنتم بخير! 🎂 يسعدنا في فندق سما أن نهنئكم بعيد ميلادكم.",
      "استمتعوا بعرض خاص في إقامتكم القادمة. الشروط: {{terms_link}}",
      'للإلغاء أرسل "إلغاء"',
      DIVIDER,
      "Dear {{name}},",
      "Happy birthday from all of us at Sama Hotel! 🎂",
      "Enjoy a special offer on your next stay. Terms: {{terms_link}}",
      "Reply STOP to opt out",
    ].join("\n"),
    enabled: true,
  },
  {
    id: fixedId("50000000", 5),
    name: "Win-back | استعادة الضيوف",
    trigger_kind: "win_back",
    offset_days: 335,
    channel: "whatsapp",
    msg_type: "marketing",
    market: "Oman+GCC",
    template: [
      "عزيزي/عزيزتي {{name}}،",
      "اشتقنا لكم في فندق سما! لقد مضى قرابة عام على آخر زيارة لكم.",
      "عودوا إلينا واستمتعوا بعرض ترحيبي خاص. الشروط: {{terms_link}}",
      'للإلغاء أرسل "إلغاء"',
      DIVIDER,
      "Dear {{name}},",
      "We miss you at Sama Hotel! It has been almost a year since your last stay.",
      "Come back and enjoy a special welcome-back offer. Terms: {{terms_link}}",
      "Reply STOP to opt out",
    ].join("\n"),
    enabled: true,
  },
];

export function seed(db: Db): void {
  db.clear();
  db.insert("bk_room_types", ROOM_TYPES);
  db.insert("bk_rooms", rooms());
  const today = muscatToday();
  // current_date + interval '2 years'
  const twoYears = `${Number(today.slice(0, 4)) + 2}${today.slice(4)}`;
  db.insert("bk_rate_plans", [
    {
      id: WEEKEND_PLAN_ID,
      name: "Weekend (Thu & Fri nights) +20%",
      room_type_id: null,
      start_date: today,
      end_date: twoYears,
      rate_omr: null,
      adjust_pct: 20,
      min_stay: 1,
      days_of_week: [4, 5],
      priority: 10,
    },
  ]);
  db.insert("bk_settings", SETTINGS);
  db.insert("bk_addons", ADDONS);
  db.insert("automations", AUTOMATIONS);
  db.insert("profiles", [
    { id: USERS.admin.id, full_name: USERS.admin.full_name, role: USERS.admin.role },
    { id: USERS.desk.id, full_name: USERS.desk.full_name, role: USERS.desk.role },
  ]);
}
