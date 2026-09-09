// Typed views of the jsonb rows in bk_settings (seeded in migration 0006).
import type { TaxSettings } from "@/lib/booking-engine/pricing";
import type { MessagingSchedule } from "@/lib/booking-engine/dates";
import type { Json } from "@/lib/database.types";

export interface TimesSettings {
  check_in: string; // "14:00"
  check_out: string; // "12:00"
}

export interface CancellationSettings {
  hours_before: number;
  policy_en: string;
  policy_ar: string;
}

export interface ContactSettings {
  phone: string; // E.164
  whatsapp: string; // E.164
  email: string;
  maps_link: string;
  address_en: string;
  address_ar: string;
  instagram: string;
  website: string;
}

export interface HotelSettings {
  name_en: string;
  name_ar: string;
  altitude_m: number;
  drive_from_muscat_h: number;
  units: number;
  legal_name: string;
  star_rating: number;
}

export interface ReviewSettings {
  google: string;
  tripadvisor: string;
}

export interface BookingSettings {
  max_nights: number;
  max_advance_days: number;
  weekend_days: number[];
  extra_bed_omr: number;
  child_free_under: number;
  rate_limit_per_min: number;
}

export interface MessagingSettings extends MessagingSchedule {
  email_enabled: boolean;
  whatsapp_enabled: boolean;
  test_phone: string;
  test_email: string;
  whatsapp_templates: {
    confirmation: string;
    pre_arrival: string;
    post_stay: string;
  };
  /** Meta WhatsApp Business Account id — fallback when WHATSAPP_BUSINESS_ACCOUNT_ID is unset and discovery fails. */
  whatsapp_business_account_id: string;
  /** Meta app id — needed for media uploads (template headers); fallback when WHATSAPP_APP_ID is unset. */
  whatsapp_app_id: string;
}

export interface PromoCode {
  code: string;
  percent: number;
  valid_until: string | null;
  enabled: boolean;
  note?: string;
}

export interface PromoSettings {
  codes: PromoCode[];
}

export interface CronSettings {
  secret: string;
  dispatch_url: string;
}

export interface AllSettings {
  taxes: TaxSettings;
  times: TimesSettings;
  cancellation: CancellationSettings;
  contact: ContactSettings;
  hotel: HotelSettings;
  reviews: ReviewSettings;
  booking: BookingSettings;
  messaging: MessagingSettings;
  promo: PromoSettings;
  cron: CronSettings;
}

export type SettingsKey = keyof AllSettings;

/** Keys exposed to the public site via bk_public_settings(). */
export type PublicSettings = Pick<
  AllSettings,
  "times" | "cancellation" | "contact" | "booking" | "taxes" | "reviews" | "hotel"
>;

/** One priced add-on line inside a quote (from bk_quote). */
export interface QuoteAddonLine {
  addon_id: string;
  slug: string;
  kind: "activity" | "transfer" | "other";
  name_en: string;
  name_ar: string;
  unit: "per_person" | "per_car" | "per_booking" | "per_night";
  quantity: number;
  unit_price: number;
  total: number;
  taxable: boolean;
  note: string | null;
}

/** What the caller sends to bk_quote / bk_create_booking for add-ons. */
export interface AddonSelection {
  addon_id?: string;
  slug?: string;
  quantity: number;
  note?: string | null;
}

/** Shape returned by the bk_quote() RPC. */
export interface QuoteResult {
  room_type_id: string;
  slug: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  nightly: { date: string; rate: number }[];
  room_subtotal: number;
  promo_code: string | null;
  promo_valid: boolean;
  discount_pct: number;
  discount: number;
  addons: QuoteAddonLine[];
  addons_total: number;
  service_charge: number;
  tourism_fee: number;
  vat: number;
  total: number;
  taxes: TaxSettings;
  available_count: number;
  min_stay: number;
  fits_capacity: boolean;
}

/** One row of bk_availability(). */
export interface AvailabilityRow {
  room_type_id: string;
  slug: string;
  available_count: number;
  nightly: { date: string; rate: number }[];
  room_subtotal: number;
  min_stay: number;
  min_stay_ok: boolean;
  fits_capacity: boolean;
}

export type JsonObject = { [key: string]: Json | undefined };
