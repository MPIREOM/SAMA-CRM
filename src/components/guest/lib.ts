import type { BkRoomType } from "@/lib/database.types";
import type { Locale } from "@/i18n/routing";
import type { TaxSettings } from "@/lib/booking-engine/pricing";
import { hoursUntilCheckIn, muscatDateTime } from "@/lib/booking-engine/dates";

// Client-safe helpers for the guest site (no server-only imports).

export const AMENITY_KEYS = [
  "wifi",
  "ac",
  "heating",
  "balcony",
  "tv",
  "tea_coffee",
  "minibar",
  "safe",
  "hairdryer",
  "toiletries",
  "room_service",
  "mountain_view",
  "pool_view",
  "city_view",
  "family",
  "jacuzzi",
  "sitting_area",
  "two_bathrooms",
  "private_garden",
  "bathrobe",
] as const;
export type AmenityKey = (typeof AMENITY_KEYS)[number];

export function isAmenityKey(value: unknown): value is AmenityKey {
  return typeof value === "string" && (AMENITY_KEYS as readonly string[]).includes(value);
}

/** Amenity keys from the jsonb column, unknown values dropped. */
export function roomAmenities(rt: Pick<BkRoomType, "amenities">): AmenityKey[] {
  if (!Array.isArray(rt.amenities)) return [];
  return rt.amenities.filter(isAmenityKey);
}

export type LocalizedRoom = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  view: string;
  bed: string;
  sizeSqm: number | null;
  maxAdults: number;
  maxChildren: number;
  baseRate: number;
  images: string[];
  amenities: AmenityKey[];
};

/** Pick the locale's copy from a bk_room_types row (falls back to English). */
export function localizeRoom(rt: BkRoomType, locale: Locale): LocalizedRoom {
  const ar = locale === "ar";
  return {
    id: rt.id,
    slug: rt.slug,
    name: (ar ? rt.name_ar : rt.name_en) || rt.name_en,
    tagline: (ar ? rt.tagline_ar : rt.tagline_en) ?? rt.tagline_en ?? "",
    description: (ar ? rt.description_ar : rt.description_en) ?? rt.description_en ?? "",
    view: (ar ? rt.view_ar : rt.view_en) ?? rt.view_en ?? "",
    bed: (ar ? rt.bed_config_ar : rt.bed_config_en) ?? rt.bed_config_en ?? "",
    sizeSqm: rt.size_sqm,
    maxAdults: rt.max_adults,
    maxChildren: rt.max_children,
    baseRate: Number(rt.base_rate_omr),
    images: Array.isArray(rt.images) && rt.images.length > 0 ? rt.images : ["/images/hotel/hotel-building.jpg"],
    amenities: roomAmenities(rt),
  };
}

/** Whole OMR when the rate is round, otherwise 3 dp — for "from OMR 50/night". */
export function formatRate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

/** Percent label without trailing zeros ("8", "4.5"). */
export function pct(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function waLink(phoneE164: string, text?: string): string {
  const digits = phoneE164.replace(/\D/g, "");
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`;
}

export function telLink(phoneE164: string): string {
  return `tel:${phoneE164.replace(/[^\d+]/g, "")}`;
}

/** "+968 2250 7681" — readable grouping for display, Latin digits. */
export function prettyPhone(phoneE164: string): string {
  const m = phoneE164.match(/^(\+\d{1,3})(\d+)$/);
  if (!m) return phoneE164;
  const rest = m[2].replace(/(\d{4})(?=\d)/g, "$1 ");
  return `${m[1]} ${rest}`;
}

/** Tax lines that are enabled, in display order. */
export function enabledTaxLines(taxes: TaxSettings): Array<"service" | "tourism" | "vat"> {
  const out: Array<"service" | "tourism" | "vat"> = [];
  if (taxes.service_charge_enabled) out.push("service");
  if (taxes.tourism_fee_enabled) out.push("tourism");
  if (taxes.vat_enabled) out.push("vat");
  return out;
}

/** Number → string with Latin digits (ICU {n} would use Arabic-Indic digits in ar). */
export function n(value: number): string {
  return String(value);
}

/** Guests may cancel online while the booking is live and the free window is open. */
export function canCancelOnline(
  booking: { status: string; check_in: string },
  settings: { times: { check_in: string }; cancellation: { hours_before: number } },
  now: Date = new Date()
): boolean {
  if (booking.status !== "confirmed" && booking.status !== "pending") return false;
  return hoursUntilCheckIn(booking.check_in, settings.times.check_in, now) >= settings.cancellation.hours_before;
}

/** The instant (UTC) the free-cancellation window closes. */
export function cancellationDeadline(checkIn: string, checkInTime: string, hoursBefore: number): Date {
  return new Date(muscatDateTime(checkIn, checkInTime).getTime() - hoursBefore * 3_600_000);
}

/** "Fri, 12 Sep 2026, 14:00" in hotel time, Latin digits. */
export function formatMuscatDateTime(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-OM" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Muscat",
    numberingSystem: "latn",
  }).format(d);
}
