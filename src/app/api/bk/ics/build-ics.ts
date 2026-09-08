import { muscatDateTime } from "@/lib/booking-engine/dates";

// Pure .ics builder for the "Add to calendar" button. Times are converted from
// hotel time (Asia/Muscat) to UTC so every calendar app agrees on the instant.

export interface IcsInput {
  ref: string;
  summary: string;
  description: string;
  location: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  checkInTime?: string; // HH:MM Muscat, default 14:00
  checkOutTime?: string; // HH:MM Muscat, default 12:00
  url?: string;
  now?: Date;
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/** Escape text per RFC 5545 §3.3.11. */
export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Fold lines longer than 75 octets (RFC 5545 §3.1). */
export function icsFold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, "utf8");
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (chunkBytes + b > limit) {
      out.push(chunk);
      chunk = ch;
      chunkBytes = b;
    } else {
      chunk += ch;
      chunkBytes += b;
    }
  }
  if (chunk) out.push(chunk);
  return out.map((l, i) => (i === 0 ? l : ` ${l}`)).join("\r\n");
}

export function buildIcs(input: IcsInput): string {
  const start = muscatDateTime(input.checkIn, input.checkInTime ?? "14:00");
  const end = muscatDateTime(input.checkOut, input.checkOutTime ?? "12:00");
  const now = input.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Sama Hotel//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsEscape(input.ref)}@samahotel.net`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART:${utcStamp(start)}`,
    `DTEND:${utcStamp(end)}`,
    `SUMMARY:${icsEscape(input.summary)}`,
    `DESCRIPTION:${icsEscape(input.description)}`,
    `LOCATION:${icsEscape(input.location)}`,
    ...(input.url ? [`URL:${icsEscape(input.url)}`] : []),
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsEscape(input.summary)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}
