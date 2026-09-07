// Builds the TemplateContext (booking + settings + links) the template
// builders consume, plus realistic sample data for the admin preview screen.
import type { BookingWithRelations } from "@/lib/bk/bookings";
import type { AllSettings } from "@/lib/bk/types";
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

export function sampleBooking(locale: Locale): BookingWithRelations {
  const now = new Date().toISOString();
  const roomTypeId = "00000000-0000-4000-8000-0000000000a1";
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
    service_charge_omr: 10.56,
    tourism_fee_omr: 5.28,
    vat_omr: 7.392,
    total_omr: 155.232,
    status: "confirmed",
    source: "website",
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
  };
}

/** Sample context for previews. Pass real settings so contacts / links / template names match production. */
export function sampleContext(locale: Locale, settings: AllSettings = SAMPLE_SETTINGS): TemplateContext {
  return buildContext(sampleBooking(locale), settings, locale);
}
