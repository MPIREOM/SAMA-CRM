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
  { value: "Chalet", en: "Chalet", ar: "شاليه" },
  {
    value: "Deluxe Room Mountain View",
    en: "Deluxe Room Mountain View",
    ar: "غرفة ديلوكس بإطلالة على الجبل",
  },
  {
    value: "Deluxe Room City View",
    en: "Deluxe Room City View",
    ar: "غرفة ديلوكس بإطلالة على المدينة",
  },
  {
    value: "Family Deluxe",
    en: "Family Deluxe",
    ar: "غرفة عائلية ديلوكس",
  },
  {
    value: "Sama Suite City View",
    en: "Sama Suite City View",
    ar: "جناح سما بإطلالة على المدينة",
  },
  {
    value: "Sama Suite Mountain View",
    en: "Sama Suite Mountain View",
    ar: "جناح سما بإطلالة على الجبل",
  },
];

export function roomTypeLabel(value: string | null, lang: Lang): string {
  if (!value) return "—";
  const known = ROOM_TYPES.find((r) => r.value === value);
  return known ? known[lang] : value;
}
