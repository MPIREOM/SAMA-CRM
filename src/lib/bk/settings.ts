import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { DEFAULT_TAXES } from "@/lib/booking-engine/pricing";
import { DEFAULT_SCHEDULE } from "@/lib/booking-engine/dates";
import type { Json } from "@/lib/database.types";
import type { AllSettings, PublicSettings, SettingsKey } from "./types";

// Defaults mirror migration 0006 so the app renders sensibly even if a key is
// missing. Values from the database always win.
export const SETTINGS_DEFAULTS: AllSettings = {
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
  },
  promo: { codes: [] },
  cron: { secret: "", dispatch_url: "" },
};

function merge<K extends SettingsKey>(key: K, value: Json | undefined): AllSettings[K] {
  const base = SETTINGS_DEFAULTS[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...base, ...(value as object) } as AllSettings[K];
  }
  return base;
}

/** All settings (service role). Cached per request. */
export const getSettings = cache(async (): Promise<AllSettings> => {
  const admin = createAdminClient();
  const { data, error } = await admin.from("bk_settings").select("key, value");
  if (error) throw new Error(`bk_settings read failed: ${error.message}`);
  const map = new Map<string, Json>((data ?? []).map((r) => [r.key, r.value]));
  return {
    taxes: merge("taxes", map.get("taxes")),
    times: merge("times", map.get("times")),
    cancellation: merge("cancellation", map.get("cancellation")),
    contact: merge("contact", map.get("contact")),
    hotel: merge("hotel", map.get("hotel")),
    reviews: merge("reviews", map.get("reviews")),
    booking: merge("booking", map.get("booking")),
    messaging: merge("messaging", map.get("messaging")),
    promo: merge("promo", map.get("promo")),
    cron: merge("cron", map.get("cron")),
  };
});

/** Whitelisted settings for the public site (anon RPC). Cached per request. */
export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc("bk_public_settings");
  if (error) throw new Error(`bk_public_settings failed: ${error.message}`);
  const obj = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, Json | undefined>;
  return {
    times: merge("times", obj.times),
    cancellation: merge("cancellation", obj.cancellation),
    contact: merge("contact", obj.contact),
    booking: merge("booking", obj.booking),
    taxes: merge("taxes", obj.taxes),
    reviews: merge("reviews", obj.reviews),
    hotel: merge("hotel", obj.hotel),
  };
});

/** Update one settings key (merge semantics) — back-office only. */
export async function updateSetting<K extends SettingsKey>(
  key: K,
  patch: Partial<AllSettings[K]>,
  actorUserId: string | null
): Promise<AllSettings[K]> {
  const admin = createAdminClient();
  const { data: current } = await admin.from("bk_settings").select("value").eq("key", key).maybeSingle();
  const next = { ...SETTINGS_DEFAULTS[key], ...((current?.value as object) ?? {}), ...patch } as AllSettings[K];
  const { error } = await admin
    .from("bk_settings")
    .upsert({ key, value: next as unknown as Json, updated_at: new Date().toISOString(), updated_by: actorUserId });
  if (error) throw new Error(`bk_settings update failed: ${error.message}`);
  return next;
}
