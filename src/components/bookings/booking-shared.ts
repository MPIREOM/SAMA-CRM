// Shared lookups for the Bookings module (table + new-booking form).
// Canonical values are stored in English in the DB; labels localize at render.

import type { Lang, Localized } from "@/lib/i18n";
import type { BookingSource } from "@/lib/database.types";

export const SOURCES: BookingSource[] = ["Website", "OTA", "Offline"];

const SOURCE_LABELS: Record<BookingSource, Localized> = {
  Website: { en: "Website", ar: "الموقع الإلكتروني" },
  OTA: { en: "OTA", ar: "منصات الحجز (OTA)" },
  Offline: { en: "Offline", ar: "مباشر" },
};

export function sourceLabel(source: string | null, lang: Lang): string {
  if (source && source in SOURCE_LABELS) {
    return SOURCE_LABELS[source as BookingSource][lang];
  }
  return source ?? "—";
}

/** Website = green, OTA = gold, Offline = maroon (brand convention). */
export function sourceBadgeVariant(
  source: string | null
): "green" | "gold" | "maroon" | "gray" {
  switch (source) {
    case "Website":
      return "green";
    case "OTA":
      return "gold";
    case "Offline":
      return "maroon";
    default:
      return "gray";
  }
}

export type BookingStatus = "Confirmed" | "Cancelled" | "Completed";

export const STATUSES: BookingStatus[] = ["Confirmed", "Cancelled", "Completed"];

const STATUS_LABELS: Record<BookingStatus, Localized> = {
  Confirmed: { en: "Confirmed", ar: "مؤكد" },
  Cancelled: { en: "Cancelled", ar: "ملغي" },
  Completed: { en: "Completed", ar: "مكتمل" },
};

export function statusLabel(status: string | null, lang: Lang): string {
  if (status && status in STATUS_LABELS) {
    return STATUS_LABELS[status as BookingStatus][lang];
  }
  return status ?? "—";
}

export interface RoomType {
  value: string;
  en: string;
  ar: string;
}

export const ROOM_TYPES: RoomType[] = [
  { value: "Standard Room", en: "Standard Room", ar: "غرفة قياسية" },
  { value: "Deluxe Room", en: "Deluxe Room", ar: "غرفة ديلوكس" },
  { value: "Junior Suite", en: "Junior Suite", ar: "جناح جونيور" },
  { value: "Executive Suite", en: "Executive Suite", ar: "جناح تنفيذي" },
  { value: "Family Room", en: "Family Room", ar: "غرفة عائلية" },
];

export function roomTypeLabel(value: string | null, lang: Lang): string {
  if (!value) return "—";
  const known = ROOM_TYPES.find((r) => r.value === value);
  return known ? known[lang] : value;
}
