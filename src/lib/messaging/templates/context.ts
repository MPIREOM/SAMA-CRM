// Builds the TemplateContext (booking + settings + links) the template
// builders consume, plus realistic sample data for the admin preview screen.
import type { BookingWithRelations } from "@/lib/bk/bookings";
import type { AllSettings } from "@/lib/bk/types";
import type { BkAddon } from "@/lib/database.types";
import { bookingUrl } from "@/lib/booking-engine/tokens";
import type { Locale, TemplateContext, TemplateLinks } from "../types";
import { SAMPLE_SETTINGS } from "./sample-settings";

function nonEmpty(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return v.length > 0 ? v : null;
}

const HOTEL_WEBSITE = "https://samahotel.net";

/** Manage page = booking page + "/manage" before the query string. */
export function manageUrl(bookingPageUrl: string): string {
  const q = bookingPageUrl.indexOf("?");
  return q === -1 ? `${bookingPageUrl}/manage` : `${bookingPageUrl.slice(0, q)}/manage${bookingPageUrl.slice(q)}`;
}

export function whatsappLink(e164: string): string {
  return `https://wa.me/${e164.replace(/\D/g, "")}`;
}

export function buildLinks(ref: string, settings: AllSettings, locale: Locale): TemplateLinks {
  const booking = bookingUrl(ref, locale);
  const website = nonEmpty(settings.contact.website) ?? HOTEL_WEBSITE;
  const google = nonEmpty(settings.reviews.google);
  const tripadvisor = nonEmpty(settings.reviews.tripadvisor);
  return {
    booking,
    manage: manageUrl(booking),
    maps: nonEmpty(settings.contact.maps_link) ?? SAMPLE_SETTINGS.contact.maps_link,
    review: google ?? tripadvisor ?? website,
    google,
    tripadvisor,
    website,
    whatsapp: whatsappLink(nonEmpty(settings.contact.whatsapp) ?? SAMPLE_SETTINGS.contact.whatsapp),
  };
}

export function buildContext(
  booking: BookingWithRelations,
  settings: AllSettings,
  locale: Locale
): TemplateContext {
  return { booking, settings, links: buildLinks(booking.ref, settings, locale) };
}

// ---------------------------------------------------------------------------
// Sample data (admin preview + test sends). Realistic, never persisted.
// ---------------------------------------------------------------------------

export const SAMPLE_BOOKING_ID = "00000000-0000-4000-8000-00000000b00c";

const SAMPLE_APEX_ID = "00000000-0000-4000-8000-0000000000d1";
const SAMPLE_TRANSFER_UP_ID = "00000000-0000-4000-8000-0000000000d2";

/** The seeded bk_addons rows (migration 0010) as the previews need them. */
function sampleAddonCatalogue(now: string): Record<"apex" | "transferUp", BkAddon> {
  return {
    apex: {
      id: SAMPLE_APEX_ID,
      slug: "apex-zipline",
      kind: "activity",
      name_en: "APEX Zipline",
      name_ar: "أبكس زيبلاين",
      tagline_en: "310 m over the canyon at up to 60 km/h — it starts right next to the hotel.",
      tagline_ar: "310 متراً فوق الوادي بسرعة تصل إلى 60 كم/س — ينطلق من جوار الفندق مباشرة.",
      description_en: null,
      description_ar: null,
      price_omr: 5,
      unit: "per_person",
      max_quantity: 10,
      taxable: false,
      requires_note: true,
      note_hint_en: "Preferred day (arrival day, any day of your stay) and any riders under 16",
      note_hint_ar: "اليوم المفضل (يوم الوصول أو أي يوم خلال الإقامة) وعدد الراكبين تحت 16 عاماً",
      image: "/images/addons/apex-zipline.jpg",
      details: { length_m: 310, height_m: 20, speed_kmh: 60, max_weight_kg: 120, website: "https://www.apexzipline.com" },
      is_active: true,
      sort_order: 10,
      created_at: now,
      updated_at: now,
    },
    transferUp: {
      id: SAMPLE_TRANSFER_UP_ID,
      slug: "transfer-up",
      kind: "transfer",
      name_en: "4WD transfer up — Birkat Al Mouz to the hotel",
      name_ar: "نقل بسيارة دفع رباعي صعوداً — من بركة الموز إلى الفندق",
      tagline_en: "Leave your car at the checkpoint car park; we bring you up the mountain.",
      tagline_ar: "اتركوا سيارتكم في موقف نقطة التفتيش ونحن نصعد بكم إلى الجبل.",
      description_en: null,
      description_ar: null,
      price_omr: 15,
      unit: "per_car",
      max_quantity: 3,
      taxable: false,
      requires_note: true,
      note_hint_en: "Expected arrival time at the checkpoint and number of guests",
      note_hint_ar: "وقت الوصول المتوقع إلى نقطة التفتيش وعدد النزلاء",
      image: "/images/addons/transfer.jpg",
      details: { max_guests_per_car: 4, pickup: "Birkat Al Mouz checkpoint car park", duration_min: 45 },
      is_active: true,
      sort_order: 20,
      created_at: now,
      updated_at: now,
    },
  };
}

export function sampleBooking(locale: Locale): BookingWithRelations {
  const now = new Date().toISOString();
  const roomTypeId = "00000000-0000-4000-8000-0000000000a1";
  const catalogue = sampleAddonCatalogue(now);
  return {
    id: SAMPLE_BOOKING_ID,
    ref: "SAMA-26-K7P3QX",
    contact_id: null,
    room_type_id: roomTypeId,
    room_id: null,
    check_in: "2026-09-17",
    check_out: "2026-09-19",
    nights: 2,
    adults: 2,
    children: 1,
    guest_name: locale === "ar" ? "أحمد النبهاني" : "Ahmed Al Nabhani",
    guest_phone: "+96899123456",
    guest_email: "guest@example.com",
    nationality: "OM",
    preferred_lang: locale,
    special_requests: locale === "ar" ? "غرفة في طابق مرتفع إن أمكن" : "High floor if possible",
    internal_notes: null,
    promo_code: null,
    // Thu 17 + Fri 18 Sep = two weekend nights at 55 × 1.2 = 66.000 each.
    nightly_rates: [
      { date: "2026-09-17", rate: 66 },
      { date: "2026-09-18", rate: 66 },
    ],
    room_subtotal_omr: 132,
    discount_omr: 0,
    addons_omr: 25,
    service_charge_omr: 10.56,
    tourism_fee_omr: 5.28,
    vat_omr: 7.392,
    total_omr: 180.232,
    status: "confirmed",
    source: "website",
    bed_preference: "twin",
    cancel_reason: null,
    cancelled_at: null,
    checked_in_at: null,
    checked_out_at: null,
    created_by: null,
    created_at: now,
    updated_at: now,
    room_type: {
      id: roomTypeId,
      slug: "deluxe-mountain-view",
      crm_value: "Deluxe Room Mountain View",
      name_en: "Deluxe Room — Mountain & Sunset View",
      name_ar: "غرفة ديلوكس بإطلالة على الجبل",
      tagline_en: null,
      tagline_ar: null,
      description_en: null,
      description_ar: null,
      view_en: "Mountain & sunset",
      view_ar: "الجبل وغروب الشمس",
      bed_config_en: "Twin",
      bed_config_ar: "سريران",
      bed_options: ["twin", "king"],
      size_sqm: 27,
      max_adults: 2,
      max_children: 1,
      base_rate_omr: 55,
      amenities: [],
      images: [],
      is_active: true,
      sort_order: 2,
      created_at: now,
      updated_at: now,
    },
    room: null,
    // addons_omr 25 = zipline 2 × 5 + transfer up 1 × 15 (both untaxed).
    addons: [
      {
        id: "00000000-0000-4000-8000-0000000000e1",
        booking_id: SAMPLE_BOOKING_ID,
        addon_id: SAMPLE_APEX_ID,
        quantity: 2,
        unit_price_omr: 5,
        total_omr: 10,
        taxable: false,
        note: locale === "ar" ? "يوم الوصول، بعد الظهر" : "Arrival day, afternoon",
        status: "requested",
        created_at: now,
        updated_at: now,
        addon: catalogue.apex,
      },
      {
        id: "00000000-0000-4000-8000-0000000000e2",
        booking_id: SAMPLE_BOOKING_ID,
        addon_id: SAMPLE_TRANSFER_UP_ID,
        quantity: 1,
        unit_price_omr: 15,
        total_omr: 15,
        taxable: false,
        note: locale === "ar" ? "الوصول نحو الساعة 1 ظهراً، 3 نزلاء" : "Arriving around 1 PM, 3 guests",
        status: "requested",
        created_at: now,
        updated_at: now,
        addon: catalogue.transferUp,
      },
    ],
  };
}

/** Sample context for previews. Pass real settings so contacts / links / template names match production. */
export function sampleContext(locale: Locale, settings: AllSettings = SAMPLE_SETTINGS): TemplateContext {
  return buildContext(sampleBooking(locale), settings, locale);
}
