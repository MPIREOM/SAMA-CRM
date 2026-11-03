// Internal "new booking" alert for the reservations desk. One English email
// per booking with everything staff need to act on it without opening the
// back-office: who, when, which room, what they asked for, what they will
// pay. Pure — no database, no providers — like the guest templates.
import { formatOmr } from "@/lib/booking-engine/pricing";
import type { TemplateContext } from "../types";
import { itemisedRows } from "./confirmation";
import { whatsappLink } from "./context";
import { renderEmail, type Block } from "./email-shell";
import { addonName, bedChoice, bookingAddons, friendlyTime, guestName, longDate, nightsOf, roomName } from "./shared";

export interface StaffEmail {
  subject: string;
  html: string;
  text: string;
}

const SOURCE_LABEL: Record<string, string> = {
  website: "the website",
  staff: "the back-office",
  phone: "the phone",
  walk_in: "a walk-in",
  ota: "an OTA",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const ADDON_STATUS_LABEL: Record<string, string> = {
  requested: "requested — confirm with the guest",
  confirmed: "confirmed",
  done: "done",
  cancelled: "cancelled",
};

/** Newer ICU spells en-GB September "Sept"; the hotel's documents say "Sep" (same rule as `longDate`). */
function enGb(value: string): string {
  return value.replace(/\bSept\b/g, "Sep");
}

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://sama-crm.vercel.app").replace(/\/$/, "");
}

/** Back-office page of a booking. */
export function backOfficeBookingUrl(bookingId: string, base: string = appOrigin()): string {
  return `${base.replace(/\/$/, "")}/reservations/${encodeURIComponent(bookingId)}`;
}

/** "17–19 Sep 2026" · "28 Sep – 2 Oct 2026" · "30 Dec 2026 – 2 Jan 2027". */
export function compactRange(checkIn: string, checkOut: string): string {
  const fmt = (d: string, opts: Intl.DateTimeFormatOptions) =>
    enGb(new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC", numberingSystem: "latn" }).format(new Date(`${d}T12:00:00Z`)));
  const [y1, m1] = checkIn.split("-");
  const [y2, m2] = checkOut.split("-");
  if (y1 === y2 && m1 === m2) return `${fmt(checkIn, { day: "numeric" })}–${fmt(checkOut, { day: "numeric", month: "short", year: "numeric" })}`;
  if (y1 === y2) return `${fmt(checkIn, { day: "numeric", month: "short" })} – ${fmt(checkOut, { day: "numeric", month: "short", year: "numeric" })}`;
  return `${fmt(checkIn, { day: "numeric", month: "short", year: "numeric" })} – ${fmt(checkOut, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** ISO instant → "16 Sep 2026, 10:42" in hotel time. */
function muscatStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return enGb(
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Asia/Muscat",
      numberingSystem: "latn",
    }).format(d)
  );
}

function nightlyRatesLine(ctx: TemplateContext): string | null {
  const raw = ctx.booking.nightly_rates;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parts: string[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { date, rate } = entry as { date?: unknown; rate?: unknown };
    const n = Number(rate);
    if (typeof date !== "string" || !Number.isFinite(n)) continue;
    const day = enGb(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC", numberingSystem: "latn" }).format(new Date(`${date}T12:00:00Z`)));
    parts.push(`${day} ${formatOmr(n)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function guestsLine(adults: number, children: number): string {
  const a = `${adults} ${adults === 1 ? "adult" : "adults"}`;
  return children > 0 ? `${a}, ${children} ${children === 1 ? "child" : "children"}` : a;
}

export function staffNewBookingSubject(ctx: TemplateContext): string {
  const b = ctx.booking;
  return `New booking ${b.ref} · ${roomName(ctx, "en")} · ${compactRange(b.check_in, b.check_out)} · OMR ${formatOmr(b.total_omr)}`;
}

export interface StaffEmailOptions {
  /** Admin "send test": sample data, marked as such in the subject and the body. */
  test?: boolean;
}

export function buildStaffNewBooking(
  ctx: TemplateContext,
  backOfficeUrl: string = backOfficeBookingUrl(ctx.booking.id),
  options: StaffEmailOptions = {}
): StaffEmail {
  const b = ctx.booking;
  const times = ctx.settings.times;
  const name = guestName(ctx);
  const nights = nightsOf(ctx);
  const source = SOURCE_LABEL[b.source] ?? b.source;
  const status = STATUS_LABEL[b.status] ?? b.status;
  const made = muscatStamp(b.created_at);
  const bed = bedChoice(ctx, "en");
  const addons = bookingAddons(ctx);
  const email = (b.guest_email ?? "").trim();
  const nationality = (b.nationality ?? "").trim();
  const requests = (b.special_requests ?? "").trim();
  const notes = (b.internal_notes ?? "").trim();
  const promo = (b.promo_code ?? "").trim();
  const nightly = nightlyRatesLine(ctx);

  const stayRows: { label: string; value: string; ltr?: boolean }[] = [
    { label: "Booking ref", value: b.ref, ltr: true },
    { label: "Status", value: status },
    { label: "Room type", value: roomName(ctx, "en") },
    ...(bed ? [{ label: "Beds", value: bed }] : []),
    { label: "Room", value: b.room?.room_number ? `Room ${b.room.room_number}` : "Not assigned yet" },
    { label: "Check-in", value: `${longDate(b.check_in, "en")} · from ${friendlyTime(times.check_in, "en")}` },
    { label: "Check-out", value: `${longDate(b.check_out, "en")} · by ${friendlyTime(times.check_out, "en")}` },
    { label: "Nights", value: String(nights) },
    { label: "Guests", value: guestsLine(b.adults, b.children) },
    ...(promo ? [{ label: "Promo code", value: promo, ltr: true }] : []),
  ];

  const guestRows: { label: string; value: string; ltr?: boolean }[] = [
    { label: "Name", value: name },
    { label: "Mobile", value: b.guest_phone, ltr: true },
    { label: "Email", value: email || "—", ltr: true },
    { label: "Nationality", value: nationality || "—" },
    { label: "Messages in", value: b.preferred_lang === "ar" ? "Arabic" : "English" },
  ];

  const blocks: Block[] = [
    ...(options.test
      ? [{ type: "callout", title: "Test message — not a real booking", text: "Sent from Messaging → New-booking alert → Send test with sample data. Nothing needs to be done." } satisfies Block]
      : []),
    { type: "heading", text: `New booking ${b.ref}` },
    {
      type: "paragraph",
      text: `Made from ${source}${made ? ` on ${made} (Muscat time)` : ""}. Status: ${status}. Pay at the hotel — nothing has been charged. The guest's confirmation goes out separately — the send log shows whether it was delivered.`,
    },
    {
      type: "callout",
      title: `${name} · ${nights} ${nights === 1 ? "night" : "nights"} · OMR ${formatOmr(b.total_omr)}`,
      text: `${roomName(ctx, "en")}${bed ? ` (${bed})` : ""} · ${compactRange(b.check_in, b.check_out)} · ${guestsLine(b.adults, b.children)}`,
    },
    { type: "paragraph", text: "**Guest**" },
    { type: "details", rows: guestRows },
    { type: "paragraph", text: "**Stay**" },
    { type: "details", rows: stayRows },
  ];

  if (addons.length > 0) {
    blocks.push({ type: "paragraph", text: "**Add-ons to arrange**" });
    blocks.push({
      type: "details",
      rows: addons.map((a) => ({
        label: `${addonName(a, "en")} × ${Number(a.quantity)}`,
        value: `${a.note?.trim() ? `${a.note.trim()} · ` : ""}${ADDON_STATUS_LABEL[a.status] ?? a.status} · OMR ${formatOmr(Number(a.total_omr))}`,
      })),
    });
  }

  blocks.push({ type: "paragraph", text: requests ? `**Special requests:** ${requests}` : "**Special requests:** none." });
  if (notes) blocks.push({ type: "paragraph", text: `**Internal notes (staff):** ${notes}` });

  blocks.push({ type: "paragraph", text: "**Price**" });
  blocks.push(itemisedRows(ctx, "en"));
  if (nightly) blocks.push({ type: "small", text: `Nightly rates: ${nightly}` });

  blocks.push({
    type: "buttons",
    buttons: [
      { label: "Open in the back-office", url: backOfficeUrl },
      { label: "WhatsApp the guest", url: whatsappLink(b.guest_phone), secondary: true },
    ],
  });
  blocks.push({ type: "divider" });
  blocks.push({
    type: "small",
    text: "Sent automatically the moment a booking is made. Change the address or switch it off under Messaging → New-booking alert.",
  });

  const subject = options.test ? `TEST · ${staffNewBookingSubject(ctx)}` : staffNewBookingSubject(ctx);
  const rendered = renderEmail({
    locale: "en",
    title: subject,
    preheader: `${name} · ${b.guest_phone} · ${roomName(ctx, "en")} · ${compactRange(b.check_in, b.check_out)} · ${guestsLine(b.adults, b.children)}`,
    blocks,
    footer: [`${ctx.settings.hotel.name_en} · ${ctx.settings.hotel.name_ar}`, "Internal notification — not sent to the guest."],
  });
  return { subject, html: rendered.html, text: rendered.text };
}
