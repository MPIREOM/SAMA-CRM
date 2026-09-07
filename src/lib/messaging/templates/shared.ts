// Helpers shared by the three template builders.
import { formatLongDate } from "@/lib/booking-engine/dates";
import { nightsBetween } from "@/lib/booking-engine/pricing";
import type { Locale, TemplateContext } from "../types";
import type { Block } from "./email-shell";
import { cleanParam } from "./whatsapp-bodies";

export type Bilingual = { en: string; ar: string };

export function pick(locale: Locale, s: Bilingual): string {
  return s[locale];
}

export function guestName(ctx: TemplateContext): string {
  return cleanParam(ctx.booking.guest_name) || pick(ctxLocale(ctx), { en: "Guest", ar: "ضيفنا الكريم" });
}

/** The booking's own language (used only as a fallback for defaults). */
function ctxLocale(ctx: TemplateContext): Locale {
  return ctx.booking.preferred_lang === "ar" ? "ar" : "en";
}

export function roomName(ctx: TemplateContext, locale: Locale): string {
  const rt = ctx.booking.room_type;
  if (!rt) return pick(locale, { en: "Room", ar: "غرفة" });
  return cleanParam(locale === "ar" ? rt.name_ar || rt.name_en : rt.name_en || rt.name_ar);
}

export function nightsOf(ctx: TemplateContext): number {
  const n = ctx.booking.nights;
  if (typeof n === "number" && n > 0) return n;
  return nightsBetween(ctx.booking.check_in, ctx.booking.check_out);
}

/** "Thu, 17 Sep 2026" / Arabic long date (Latin digits). Newer ICU spells en-GB September "Sept" — normalised to the documented "Sep". */
export function longDate(dateStr: string, locale: Locale): string {
  const s = cleanParam(formatLongDate(dateStr, locale));
  return locale === "en" ? s.replace(/\bSept\b/, "Sep") : s;
}

/** "14:00" → "2:00 PM" / "2:00 ظهراً" — 24h settings value to guest-friendly text. */
export function friendlyTime(hhmm: string, locale: Locale): string {
  const [hStr, mStr = "00"] = hhmm.split(":");
  const h = Number.parseInt(hStr, 10);
  if (!Number.isFinite(h)) return hhmm;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = mStr.padStart(2, "0");
  if (locale === "ar") {
    const suffix = h < 12 ? "صباحاً" : h < 16 ? "ظهراً" : "مساءً";
    return `${h12}:${mm} ${suffix}`;
  }
  return `${h12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}

export function hotelName(ctx: TemplateContext, locale: Locale): string {
  const h = ctx.settings.hotel;
  return locale === "ar" ? h.name_ar || "فندق سما" : h.name_en || "Sama Hotel";
}

export function contactsBlock(ctx: TemplateContext, locale: Locale): Block {
  const c = ctx.settings.contact;
  return {
    type: "contacts",
    title: pick(locale, { en: "We're here to help", ar: "نحن في خدمتكم" }),
    phone: c.phone,
    whatsapp: c.whatsapp,
    whatsappUrl: ctx.links.whatsapp,
    email: c.email,
    address: locale === "ar" ? c.address_ar : c.address_en,
    mapsLabel: pick(locale, { en: "Open in Google Maps", ar: "افتح في خرائط جوجل" }),
    mapsUrl: ctx.links.maps,
  };
}

export function emailFooter(ctx: TemplateContext, locale: Locale): string[] {
  const h = ctx.settings.hotel;
  const c = ctx.settings.contact;
  return [
    `${h.name_en} · ${h.name_ar}`,
    locale === "ar" ? c.address_ar : c.address_en,
    h.legal_name,
    pick(locale, {
      en: "You are receiving this email because you booked a stay with us.",
      ar: "وصلتكم هذه الرسالة لأنكم قمتم بحجز إقامة لدينا.",
    }),
  ];
}

/** Booking summary rows used by more than one email. */
export function bookingSummaryRows(
  ctx: TemplateContext,
  locale: Locale
): { label: string; value: string; ltr?: boolean }[] {
  const b = ctx.booking;
  const times = ctx.settings.times;
  const checkIn = `${longDate(b.check_in, locale)} · ${pick(locale, {
    en: `from ${friendlyTime(times.check_in, locale)}`,
    ar: `من الساعة ${friendlyTime(times.check_in, locale)}`,
  })}`;
  const checkOut = `${longDate(b.check_out, locale)} · ${pick(locale, {
    en: `by ${friendlyTime(times.check_out, locale)}`,
    ar: `حتى الساعة ${friendlyTime(times.check_out, locale)}`,
  })}`;
  return [
    { label: pick(locale, { en: "Booking ref", ar: "رقم الحجز" }), value: b.ref, ltr: true },
    { label: pick(locale, { en: "Guest", ar: "الضيف" }), value: guestName(ctx) },
    { label: pick(locale, { en: "Room", ar: "الغرفة" }), value: roomName(ctx, locale) },
    { label: pick(locale, { en: "Check-in", ar: "تسجيل الوصول" }), value: checkIn },
    { label: pick(locale, { en: "Check-out", ar: "تسجيل المغادرة" }), value: checkOut },
    { label: pick(locale, { en: "Nights", ar: "عدد الليالي" }), value: String(nightsOf(ctx)) },
  ];
}
