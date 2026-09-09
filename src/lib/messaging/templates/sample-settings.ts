// Settings used when no real settings are supplied (previews, unit tests).
// Mirrors SETTINGS_DEFAULTS in src/lib/bk/settings.ts — duplicated here so
// the template builders stay pure (settings.ts is server-only and reads the
// database). Callers with database access should pass `await getSettings()`.
import type { AllSettings } from "@/lib/bk/types";
import { DEFAULT_SCHEDULE } from "@/lib/booking-engine/dates";
import { DEFAULT_TAXES } from "@/lib/booking-engine/pricing";

export const SAMPLE_SETTINGS: AllSettings = {
  taxes: DEFAULT_TAXES,
  times: { check_in: "14:00", check_out: "12:00" },
  cancellation: {
    hours_before: 48,
    policy_en:
      "Free cancellation up to 48 hours before check-in (2:00 PM hotel time). Cancellations after that, and no-shows, are charged the first night.",
    policy_ar:
      "إلغاء مجاني حتى 48 ساعة قبل موعد تسجيل الوصول (الساعة 2:00 ظهراً بتوقيت الفندق). يتم احتساب قيمة الليلة الأولى في حال الإلغاء بعد ذلك أو عدم الحضور.",
  },
  contact: {
    phone: "+96822507681",
    whatsapp: "+96899475688",
    email: "reservations@samahotel.net",
    maps_link: "https://maps.app.goo.gl/YC7RXydtYz61cFZj9",
    address_en: "Sayq, Jabal Al Akhdar, Ad Dakhiliyah, Sultanate of Oman",
    address_ar: "سيق، الجبل الأخضر، محافظة الداخلية، سلطنة عُمان",
    instagram: "",
    website: "https://samahotel.net",
  },
  hotel: {
    name_en: "Sama Hotel",
    name_ar: "فندق سما",
    altitude_m: 2000,
    drive_from_muscat_h: 2,
    units: 60,
    legal_name: "Riyadha Al Jabal Al Akhdar Trading Co. L.L.C (Sama Hotels)",
    star_rating: 3,
  },
  reviews: { google: "", tripadvisor: "" },
  booking: {
    max_nights: 30,
    max_advance_days: 365,
    weekend_days: [4, 5],
    extra_bed_omr: 10,
    child_free_under: 8,
    rate_limit_per_min: 10,
  },
  messaging: {
    ...DEFAULT_SCHEDULE,
    email_enabled: true,
    whatsapp_enabled: true,
    test_phone: "",
    test_email: "",
    whatsapp_templates: {
      confirmation: "sama_booking_confirmation",
      pre_arrival: "sama_pre_arrival_guide",
      post_stay: "sama_post_stay_review",
    },
    whatsapp_business_account_id: "",
    whatsapp_app_id: "",
  },
  promo: { codes: [] },
  cron: { secret: "", dispatch_url: "" },
};
