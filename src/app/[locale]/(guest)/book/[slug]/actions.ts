"use server";

import { cleanBedOptions, type BedType } from "@/lib/booking-engine/beds";
import { headers } from "next/headers";
import { z } from "zod";
import { redirect } from "@/i18n/routing";
import { getAddons, getQuote, getRoomTypeBySlug } from "@/lib/bk/catalogue";
import { createBooking, type CreateBookingError } from "@/lib/bk/bookings";
import { getPublicSettings } from "@/lib/bk/settings";
import { checkRateLimit, clientIp } from "@/lib/bk/rate-limit";
import type { AddonSelection, QuoteResult } from "@/lib/bk/types";
import { bookingToken } from "@/lib/booking-engine/tokens";
import { muscatToday } from "@/lib/booking-engine/dates";
import { addDays, nightsBetween } from "@/lib/booking-engine/pricing";
import { dispatchForBooking } from "@/lib/messaging/dispatch";
import { logger } from "@/lib/logger";
import {
  MAX_ADULTS,
  MAX_CHILDREN,
  addonSelectionSchema,
  addonSelectionsSchema,
  addonsFromFormData,
  createBookingSchema,
  fieldErrors,
  isoDate,
  storedNationality,
  toE164,
  type AddonSelectionValue,
} from "@/components/guest/schemas";

// Server actions for the 3-step booking flow. Every input is re-validated
// here; the database RPC is the final authority on availability and price.

const quoteInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
  checkin: isoDate,
  checkout: isoDate,
  adults: z.number().int().min(1).max(MAX_ADULTS),
  children: z.number().int().min(0).max(MAX_CHILDREN),
  promoCode: z.string().trim().max(30).optional(),
  addons: z.array(addonSelectionSchema).max(20).optional(),
});

/** What bk_quote / bk_create_booking receive: slug + quantity, note only when given. */
function toAddonSelections(list: AddonSelectionValue[]): AddonSelection[] {
  return list.filter((a) => a.quantity > 0).map((a) => ({ slug: a.slug, quantity: a.quantity, note: a.note || null }));
}

export type QuoteState = { quote: QuoteResult; error: null } | { quote: null; error: "quote_failed" | "unknown" };

export async function getQuoteAction(input: unknown): Promise<QuoteState> {
  const parsed = quoteInputSchema.safeParse(input);
  if (!parsed.success) return { quote: null, error: "quote_failed" };
  try {
    const rt = await getRoomTypeBySlug(parsed.data.slug);
    if (!rt) return { quote: null, error: "quote_failed" };
    const res = await getQuote({
      roomTypeId: rt.id,
      checkIn: parsed.data.checkin,
      checkOut: parsed.data.checkout,
      adults: parsed.data.adults,
      children: parsed.data.children,
      promoCode: parsed.data.promoCode?.trim() ? parsed.data.promoCode.trim().toUpperCase() : null,
      addons: toAddonSelections(parsed.data.addons ?? []),
    });
    if (res.error !== null) {
      logger.warn("guest.quote", "bk_quote failed", { error: res.error });
      return { quote: null, error: "quote_failed" };
    }
    return { quote: res.quote, error: null };
  } catch (err) {
    logger.error("guest.quote", "quote action crashed", { error: err instanceof Error ? err.message : String(err) });
    return { quote: null, error: "unknown" };
  }
}

export type BookingErrorKey =
  | CreateBookingError
  | "rate_limited"
  | "validation";

export interface CreateBookingState {
  error: BookingErrorKey | null;
  fields?: Record<string, string>;
}

function formValue(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

export async function createBookingAction(prev: CreateBookingState | FormData, maybeFormData?: FormData): Promise<CreateBookingState> {
  // With JS: (prevState, formData). Progressive enhancement (no JS): (formData).
  const formData = maybeFormData ?? (prev instanceof FormData ? prev : new FormData());
  const raw = {
    fullName: formValue(formData, "fullName"),
    email: formValue(formData, "email"),
    countryCode: formValue(formData, "countryCode"),
    phone: formValue(formData, "phone"),
    nationality: formValue(formData, "nationality"),
    otherNationality: formValue(formData, "otherNationality"),
    preferredLang: formValue(formData, "preferredLang"),
    bedPreference: formValue(formData, "bedPreference"),
    specialRequests: formValue(formData, "specialRequests"),
    promoCode: formValue(formData, "promoCode"),
    slug: formValue(formData, "slug"),
    checkin: formValue(formData, "checkin"),
    checkout: formValue(formData, "checkout"),
    adults: formValue(formData, "adults"),
    children: formValue(formData, "children"),
    consent: formValue(formData, "consent"),
    locale: formValue(formData, "locale"),
  };
  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: "validation", fields: fieldErrors(parsed.error) };
  }
  const data = parsed.data;

  let settings;
  try {
    settings = await getPublicSettings();
  } catch (err) {
    logger.error("guest.book", "settings unavailable", { error: err instanceof Error ? err.message : String(err) });
    return { error: "unknown" };
  }

  // Add-ons: known slugs, within max_quantity, note ≤ 200 chars. The RPC
  // re-checks all of this; validating here gives the guest a precise message.
  // The catalogue is only read when something was actually selected, so a
  // room-only booking never depends on it.
  const rawAddons = addonsFromFormData(formData);
  let addons: AddonSelection[] = [];
  if (rawAddons.some((a) => Number(a.quantity) > 0)) {
    let addonLimits: { slug: string; max_quantity: number }[];
    try {
      addonLimits = (await getAddons()).map((a) => ({ slug: a.slug, max_quantity: a.max_quantity }));
    } catch (err) {
      logger.error("guest.book", "add-on catalogue unavailable", { error: err instanceof Error ? err.message : String(err) });
      return { error: "unknown" };
    }
    const addonsParsed = addonSelectionsSchema(addonLimits).safeParse(rawAddons);
    if (!addonsParsed.success) {
      const issue = addonsParsed.error.issues[0];
      if (issue?.message === "addon_not_found" || issue?.message === "addon_quantity") return { error: issue.message };
      // A note problem maps back onto that add-on's field ("addon.<slug>").
      const fields: Record<string, string> = {};
      for (const i of addonsParsed.error.issues) {
        const idx = typeof i.path[0] === "number" ? i.path[0] : -1;
        const slug = rawAddons[idx]?.slug;
        if (slug && !fields[`addon.${slug}`]) fields[`addon.${slug}`] = i.message;
      }
      return Object.keys(fields).length > 0 ? { error: "validation", fields } : { error: "addon_not_found" };
    }
    addons = toAddonSelections(addonsParsed.data);
  }

  if (!checkRateLimit(clientIp(headers()), settings.booking.rate_limit_per_min)) {
    return { error: "rate_limited" };
  }

  // Cheap pre-checks so guests get a precise message before we hit the RPC.
  const today = muscatToday();
  if (data.checkin < today) return { error: "past_date" };
  if (data.checkin > addDays(today, settings.booking.max_advance_days)) return { error: "too_far_ahead" };
  if (nightsBetween(data.checkin, data.checkout) < 1 || nightsBetween(data.checkin, data.checkout) > settings.booking.max_nights) {
    return { error: "invalid_dates" };
  }

  const phone = toE164(data.countryCode, data.phone);
  if (!phone) return { error: "invalid_phone" };

  let ref: string;
  let bookingId: string;
  try {
    const rt = await getRoomTypeBySlug(data.slug);
    if (!rt) return { error: "room_type_not_found" };
    if (data.adults > rt.max_adults || data.children > rt.max_children) return { error: "capacity_exceeded" };
    // Types that offer a bed layout need an explicit choice (the RPC would
    // silently take the first option, which is fine for staff, not here).
    const bedOptions = cleanBedOptions(rt.bed_options);
    if (bedOptions.length > 1 && !bedOptions.includes(data.bedPreference as BedType)) {
      return { error: "validation", fields: { bedPreference: "bed" } };
    }

    const res = await createBooking({
      room_type_id: rt.id,
      check_in: data.checkin,
      check_out: data.checkout,
      adults: data.adults,
      children: data.children,
      guest_name: data.fullName,
      guest_phone: phone,
      guest_email: data.email || null,
      nationality: storedNationality(data) || null,
      preferred_lang: data.preferredLang,
      special_requests: data.specialRequests || null,
      bed_preference: bedOptions.length > 0 ? data.bedPreference || null : null,
      promo_code: data.promoCode || null,
      source: "website",
      addons: addons.length > 0 ? addons : null,
    });
    if (res.error) {
      logger.warn("guest.book", "bk_create_booking rejected", { error: res.error, detail: res.detail });
      return { error: res.error };
    }
    ref = res.booking.ref;
    bookingId = res.booking.id;
  } catch (err) {
    logger.error("guest.book", "booking creation crashed", { error: err instanceof Error ? err.message : String(err) });
    return { error: "unknown" };
  }

  try {
    await dispatchForBooking(bookingId, ["confirmation"]);
  } catch (err) {
    logger.error("guest.book", "confirmation dispatch failed (booking kept)", {
      ref,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  redirect({ href: { pathname: `/booking/${ref}`, query: { token: bookingToken(ref) } }, locale: data.locale });
  // redirect() throws; this satisfies the return type only.
  return { error: null };
}
