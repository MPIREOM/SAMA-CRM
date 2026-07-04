import { clsx, type ClassValue } from "clsx";
import { differenceInCalendarDays, format, parseISO } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** SAMA-YY-XXXX confirmation number (e.g. SAMA-26-4831). Editable for OTA refs. */
export function generateBookingRef(date = new Date()): string {
  const yy = format(date, "yy");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SAMA-${yy}-${rand}`;
}

export function nightsBetween(
  checkIn: string | null,
  checkOut: string | null
): number {
  if (!checkIn || !checkOut) return 0;
  try {
    return Math.max(0, differenceInCalendarDays(parseISO(checkOut), parseISO(checkIn)));
  } catch {
    return 0;
  }
}

export function formatDate(value: string | null | undefined, lang: "en" | "ar" = "en"): string {
  if (!value) return "—";
  try {
    const d = value.length === 10 ? parseISO(value) : new Date(value);
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  } catch {
    return value;
  }
}

export function formatDateTime(value: string | null | undefined, lang: "en" | "ar" = "en"): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat(lang === "ar" ? "ar-OM" : "en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

/** True while the contact's 24-hour WhatsApp customer-service window is open. */
export function isWithin24h(lastInboundAt: string | null | undefined): boolean {
  if (!lastInboundAt) return false;
  return Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000;
}
