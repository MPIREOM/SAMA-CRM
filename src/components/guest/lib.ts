import type { BkAddon, BkBookingAddon, BkRoomType } from "@/lib/database.types";
import type { Locale } from "@/i18n/routing";
import type { TaxSettings } from "@/lib/booking-engine/pricing";
import type { QuoteAddonLine } from "@/lib/bk/types";
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
    images: Array.isArray(rt.images) && rt.images.length > 0 ? rt.images : ["/images/hotel/hotel-pool.jpg"],
    amenities: roomAmenities(rt),
  };
}

// ---------------------------------------------------------------------------
// Add-ons (APEX Zipline, 4WD transfers)
// ---------------------------------------------------------------------------

export type AddonKind = "activity" | "transfer" | "other";
export type AddonUnit = "per_person" | "per_car" | "per_booking" | "per_night";
export type AddonStatus = "requested" | "confirmed" | "done" | "cancelled";

export const TRANSFER_UP_SLUG = "transfer-up";
export const TRANSFER_DOWN_SLUG = "transfer-down";
export const APEX_SLUG = "apex-zipline";

export function asAddonKind(value: string): AddonKind {
  return value === "activity" || value === "transfer" ? value : "other";
}

export function asAddonUnit(value: string): AddonUnit {
  return value === "per_car" || value === "per_booking" || value === "per_night" ? value : "per_person";
}

export function asAddonStatus(value: string): AddonStatus {
  return value === "confirmed" || value === "done" || value === "cancelled" ? value : "requested";
}

/** Message key under `addons.unit` for the price suffix ("per rider", "per car" …). */
export function addonUnitKey(unit: AddonUnit, kind: AddonKind): "per_rider" | "per_person" | "per_car" | "per_booking" | "per_night" {
  if (unit === "per_person") return kind === "activity" ? "per_rider" : "per_person";
  return unit;
}

export type LocalizedAddon = {
  id: string;
  slug: string;
  kind: AddonKind;
  name: string;
  tagline: string;
  description: string;
  price: number;
  unit: AddonUnit;
  maxQuantity: number;
  requiresNote: boolean;
  noteHint: string;
  image: string;
  details: Record<string, string | number>;
};

/** Pick the locale's copy from a bk_addons row (falls back to English). */
export function localizeAddon(a: BkAddon, locale: Locale): LocalizedAddon {
  const ar = locale === "ar";
  const details: Record<string, string | number> = {};
  if (a.details && typeof a.details === "object" && !Array.isArray(a.details)) {
    for (const [k, v] of Object.entries(a.details)) {
      if (typeof v === "string" || typeof v === "number") details[k] = v;
    }
  }
  return {
    id: a.id,
    slug: a.slug,
    kind: asAddonKind(a.kind),
    name: (ar ? a.name_ar : a.name_en) || a.name_en,
    tagline: (ar ? a.tagline_ar : a.tagline_en) ?? a.tagline_en ?? "",
    description: (ar ? a.description_ar : a.description_en) ?? a.description_en ?? "",
    price: Number(a.price_omr),
    unit: asAddonUnit(a.unit),
    maxQuantity: Math.max(1, Number(a.max_quantity) || 1),
    requiresNote: Boolean(a.requires_note),
    noteHint: (ar ? a.note_hint_ar : a.note_hint_en) ?? a.note_hint_en ?? "",
    image: a.image || (a.kind === "transfer" ? "/images/addons/transfer.jpg" : "/images/addons/apex-zipline.jpg"),
    details,
  };
}

/** One add-on line as the price summary renders it. */
export interface AddonPriceLine {
  key: string;
  name: string;
  quantity: number;
  total: number;
}

/** Add-on lines of a live quote (bk_quote → `addons`). */
export function quoteAddonLines(addons: QuoteAddonLine[], locale: Locale): AddonPriceLine[] {
  return addons
    .filter((a) => a.quantity > 0)
    .map((a) => ({
      key: a.slug,
      name: (locale === "ar" ? a.name_ar : a.name_en) || a.name_en,
      quantity: a.quantity,
      total: a.total,
    }));
}

export type BookingAddonRow = BkBookingAddon & { addon: BkAddon | null };

/** Add-on rows of a stored booking that still count towards the bill. */
export function liveBookingAddons<T extends { status: string }>(addons: T[] | undefined | null): T[] {
  return (addons ?? []).filter((a) => a.status !== "cancelled");
}

/** Add-on lines of a stored booking (bk_booking_addons with the catalogue row). */
export function bookingAddonLines(addons: BookingAddonRow[] | undefined | null, locale: Locale): AddonPriceLine[] {
  return liveBookingAddons(addons).map((a) => ({
    key: a.id,
    name: a.addon ? localizeAddon(a.addon, locale).name : a.addon_id,
    quantity: Number(a.quantity),
    total: Number(a.total_omr),
  }));
}

export function hasAddon(addons: BookingAddonRow[] | undefined | null, slug: string): boolean {
  return liveBookingAddons(addons).some((a) => a.addon?.slug === slug);
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
