// Client-safe helpers shared by the back-office (property) screens.
// No server imports here — this file is used by both server and client code.

import type { Lang, Localized } from "@/lib/i18n";
import type {
  BkBookingSource,
  BkBookingStatus,
  BkMessageKind,
  BkScheduledStatus,
} from "@/lib/database.types";
import { formatOmr } from "@/lib/booking-engine/pricing";

/** Result contract for every back-office server action. Never throws to the client. */
export type ActionResult<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export const HOTEL_TZ = "Asia/Muscat";

// ---------------------------------------------------------------------------
// Dates & money (always Muscat time)
// ---------------------------------------------------------------------------

function localeFor(lang: Lang): string {
  return lang === "ar" ? "ar-OM" : "en-GB";
}

/** YYYY-MM-DD → "12 Sep 2026" (a hotel date has no timezone; rendered as-is). */
export function fmtDate(value: string | null | undefined, lang: Lang = "en"): string {
  if (!value) return "—";
  const d = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(d);
}

/** YYYY-MM-DD → "Thu 12 Sep". */
export function fmtDateShort(value: string | null | undefined, lang: Lang = "en"): string {
  if (!value) return "—";
  const d = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(lang), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    numberingSystem: "latn",
  }).format(d);
}

/** ISO instant → "12 Sep 2026, 14:05" in Muscat time. */
export function fmtDateTime(value: string | null | undefined, lang: Lang = "en"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: HOTEL_TZ,
    numberingSystem: "latn",
  }).format(d);
}

/** Weekday letter/short name for a YYYY-MM-DD date. */
export function fmtWeekday(value: string, lang: Lang = "en"): string {
  const d = new Date(`${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(localeFor(lang), {
    weekday: "short",
    timeZone: "UTC",
  }).format(d);
}

/** Money: "165.110 OMR" (3 dp). */
export function fmtMoney(value: number | string | null | undefined, lang: Lang = "en"): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  const amount = formatOmr(Number.isFinite(n) ? n : 0);
  return lang === "ar" ? `${amount} ر.ع` : `OMR ${amount}`;
}

/** Local name of a bilingual row (name_en / name_ar). */
export function localName<T extends { name_en: string; name_ar: string }>(row: T | null | undefined, lang: Lang): string {
  if (!row) return "—";
  return lang === "ar" ? row.name_ar || row.name_en : row.name_en;
}

// ---------------------------------------------------------------------------
// Booking statuses & sources
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES: BkBookingStatus[] = [
  "pending",
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
];

export const STATUS_LABELS: Record<BkBookingStatus, Localized> = {
  pending: { en: "Pending", ar: "قيد الانتظار" },
  confirmed: { en: "Confirmed", ar: "مؤكد" },
  checked_in: { en: "Checked in", ar: "مقيم" },
  checked_out: { en: "Checked out", ar: "غادر" },
  cancelled: { en: "Cancelled", ar: "ملغي" },
  no_show: { en: "No-show", ar: "لم يحضر" },
};

export function statusLabel(status: string | null | undefined, lang: Lang): string {
  if (status && status in STATUS_LABELS) return STATUS_LABELS[status as BkBookingStatus][lang];
  return status ?? "—";
}

export type BadgeVariant = "gold" | "green" | "maroon" | "gray" | "red" | "outline";

export function statusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "confirmed":
      return "maroon";
    case "checked_in":
      return "green";
    case "pending":
      return "gold";
    case "checked_out":
      return "gray";
    case "cancelled":
    case "no_show":
      return "red";
    default:
      return "outline";
  }
}

/** Tape-chart bar colours by status (cancelled / no_show are never drawn). */
export const STATUS_BAR_CLASS: Record<BkBookingStatus, string> = {
  confirmed: "bg-maroon-800 text-gold-100 border-maroon-900",
  checked_in: "bg-jabal-600 text-white border-jabal-700",
  pending: "bg-gold-500 text-maroon-900 border-gold-600",
  checked_out: "bg-stone-300 text-stone-900 border-stone-400",
  cancelled: "hidden",
  no_show: "hidden",
};

export const BOOKING_SOURCES: BkBookingSource[] = ["website", "staff", "phone", "walk_in", "ota"];

export const SOURCE_LABELS: Record<BkBookingSource, Localized> = {
  website: { en: "Website", ar: "الموقع" },
  staff: { en: "Staff", ar: "الموظفون" },
  phone: { en: "Phone", ar: "هاتف" },
  walk_in: { en: "Walk-in", ar: "حضور مباشر" },
  ota: { en: "OTA", ar: "منصة حجز" },
};

export function sourceLabel(source: string | null | undefined, lang: Lang): string {
  if (source && source in SOURCE_LABELS) return SOURCE_LABELS[source as BkBookingSource][lang];
  return source ?? "—";
}

/** Staff-creatable sources (website bookings come from the guest site only). */
export const STAFF_SOURCES: BkBookingSource[] = ["staff", "phone", "walk_in", "ota"];

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export const MESSAGE_KINDS: BkMessageKind[] = ["confirmation", "pre_arrival", "post_stay"];

export const KIND_LABELS: Record<BkMessageKind, Localized> = {
  confirmation: { en: "Confirmation", ar: "تأكيد الحجز" },
  pre_arrival: { en: "Pre-arrival", ar: "قبل الوصول" },
  post_stay: { en: "Post-stay", ar: "بعد الإقامة" },
};

export function kindLabel(kind: string | null | undefined, lang: Lang): string {
  if (kind && kind in KIND_LABELS) return KIND_LABELS[kind as BkMessageKind][lang];
  return kind ?? "—";
}

export const CHANNELS = ["email", "whatsapp"] as const;
export type MessageChannel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<MessageChannel, Localized> = {
  email: { en: "Email", ar: "بريد إلكتروني" },
  whatsapp: { en: "WhatsApp", ar: "واتساب" },
};

export function channelLabel(channel: string | null | undefined, lang: Lang): string {
  if (channel === "email" || channel === "whatsapp") return CHANNEL_LABELS[channel][lang];
  return channel ?? "—";
}

export const SCHEDULED_STATUSES: BkScheduledStatus[] = [
  "pending",
  "sending",
  "sent",
  "failed",
  "stubbed",
  "cancelled",
  "skipped",
];

export const SCHEDULED_STATUS_LABELS: Record<BkScheduledStatus, Localized> = {
  pending: { en: "Pending", ar: "قيد الانتظار" },
  sending: { en: "Sending", ar: "جارٍ الإرسال" },
  sent: { en: "Sent", ar: "أُرسلت" },
  failed: { en: "Failed", ar: "فشلت" },
  stubbed: { en: "Stubbed", ar: "محاكاة" },
  cancelled: { en: "Cancelled", ar: "ملغاة" },
  skipped: { en: "Skipped", ar: "تم تخطيها" },
};

export function scheduledStatusLabel(status: string | null | undefined, lang: Lang): string {
  if (status && status in SCHEDULED_STATUS_LABELS) {
    return SCHEDULED_STATUS_LABELS[status as BkScheduledStatus][lang];
  }
  return status ?? "—";
}

export function scheduledStatusVariant(status: string | null | undefined): BadgeVariant {
  switch (status) {
    case "sent":
      return "green";
    case "pending":
    case "sending":
      return "gold";
    case "failed":
      return "red";
    case "stubbed":
      return "maroon";
    default:
      return "gray";
  }
}

// ---------------------------------------------------------------------------
// Rooms / blocks
// ---------------------------------------------------------------------------

export const BLOCK_KINDS = ["block", "maintenance", "stop_sell"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

export const BLOCK_KIND_LABELS: Record<BlockKind, Localized> = {
  block: { en: "Block", ar: "إغلاق" },
  maintenance: { en: "Maintenance", ar: "صيانة" },
  stop_sell: { en: "Stop sell", ar: "إيقاف البيع" },
};

export function blockKindLabel(kind: string | null | undefined, lang: Lang): string {
  if (kind && kind in BLOCK_KIND_LABELS) return BLOCK_KIND_LABELS[kind as BlockKind][lang];
  return kind ?? "—";
}

/** Known amenity keys (seeded in migration 0006) with labels. */
export const AMENITIES: { key: string; en: string; ar: string }[] = [
  { key: "wifi", en: "Free Wi-Fi", ar: "واي فاي مجاني" },
  { key: "ac", en: "Air conditioning", ar: "تكييف" },
  { key: "heating", en: "Heating", ar: "تدفئة" },
  { key: "balcony", en: "Balcony", ar: "شرفة" },
  { key: "private_garden", en: "Private garden", ar: "حديقة خاصة" },
  { key: "sitting_area", en: "Sitting area", ar: "ركن جلوس" },
  { key: "two_bathrooms", en: "Two bathrooms", ar: "حمّامان" },
  { key: "jacuzzi", en: "Jacuzzi", ar: "جاكوزي" },
  { key: "tv", en: "TV", ar: "تلفاز" },
  { key: "tea_coffee", en: "Tea & coffee", ar: "شاي وقهوة" },
  { key: "minibar", en: "Minibar", ar: "ميني بار" },
  { key: "safe", en: "Safe", ar: "خزنة" },
  { key: "hairdryer", en: "Hairdryer", ar: "مجفف شعر" },
  { key: "bathrobe", en: "Bathrobe", ar: "روب حمام" },
  { key: "toiletries", en: "Toiletries", ar: "مستلزمات العناية" },
  { key: "room_service", en: "Room service", ar: "خدمة الغرف" },
  { key: "mountain_view", en: "Mountain view", ar: "إطلالة جبلية" },
  { key: "pool_view", en: "Pool view", ar: "إطلالة على المسبح" },
  { key: "city_view", en: "City view", ar: "إطلالة على المدينة" },
  { key: "family", en: "Family friendly", ar: "مناسب للعائلات" },
];

export const WEEKDAYS: { value: number; en: string; ar: string }[] = [
  { value: 0, en: "Sun", ar: "أحد" },
  { value: 1, en: "Mon", ar: "اثنين" },
  { value: 2, en: "Tue", ar: "ثلاثاء" },
  { value: 3, en: "Wed", ar: "أربعاء" },
  { value: 4, en: "Thu", ar: "خميس" },
  { value: 5, en: "Fri", ar: "جمعة" },
  { value: 6, en: "Sat", ar: "سبت" },
];

/** Thursday + Friday nights are the hotel weekend. */
export const WEEKEND_DAYS = [4, 5];

/** Human-readable message for the errors thrown by requireStaff / RPCs. */
export const ERROR_MESSAGES: Record<string, Localized> = {
  unauthorized: { en: "Please sign in again.", ar: "يرجى تسجيل الدخول مرة أخرى." },
  forbidden: { en: "You don't have permission to do that.", ar: "ليس لديك صلاحية لهذا الإجراء." },
  sold_out: { en: "No rooms of this type are available for those dates.", ar: "لا توجد غرف متاحة من هذا النوع لهذه التواريخ." },
  min_stay: { en: "The stay is shorter than the minimum.", ar: "مدة الإقامة أقل من الحد الأدنى." },
  capacity_exceeded: { en: "Too many guests for this room type.", ar: "عدد النزلاء يتجاوز سعة الغرفة." },
  invalid_dates: { en: "Check-out must be after check-in.", ar: "يجب أن يكون تاريخ المغادرة بعد تاريخ الوصول." },
  past_date: { en: "Check-in is in the past.", ar: "تاريخ الوصول في الماضي." },
  too_far_ahead: { en: "Check-in is too far ahead.", ar: "تاريخ الوصول بعيد جداً." },
  invalid_phone: { en: "Please enter a valid phone number.", ar: "يرجى إدخال رقم هاتف صحيح." },
  guest_name_required: { en: "Guest name is required.", ar: "اسم النزيل مطلوب." },
  room_type_not_found: { en: "Room type not found.", ar: "نوع الغرفة غير موجود." },
  room_unavailable: { en: "That room is already taken for those dates.", ar: "هذه الغرفة محجوزة في هذه التواريخ." },
  room_invalid: { en: "That room can't be used for this booking.", ar: "لا يمكن استخدام هذه الغرفة لهذا الحجز." },
  not_cancellable: { en: "This booking can't be cancelled.", ar: "لا يمكن إلغاء هذا الحجز." },
  booking_not_found: { en: "Booking not found.", ar: "الحجز غير موجود." },
  overlap: { en: "That room is already booked or blocked for those dates.", ar: "هذه الغرفة محجوزة أو مغلقة في هذه التواريخ." },
  validation: { en: "Please check the highlighted fields.", ar: "يرجى مراجعة الحقول." },
  not_configured: { en: "Server is missing SUPABASE_SERVICE_ROLE_KEY.", ar: "مفتاح الخدمة غير مضبوط على الخادم." },
};

/** Map an action error code / message to a readable bilingual string. */
export function errorText(error: string | null | undefined, lang: Lang): string {
  if (!error) return lang === "ar" ? "حدث خطأ ما" : "Something went wrong";
  const key = Object.keys(ERROR_MESSAGES).find((k) => error === k || error.includes(k));
  return key ? ERROR_MESSAGES[key][lang] : error;
}
