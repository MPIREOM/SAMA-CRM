import { describe, expect, it } from "vitest";
import { buildIcs, icsEscape, icsFold } from "../ics/build-ics";

describe("buildIcs", () => {
  const ics = buildIcs({
    ref: "SAMA-26-AB12CD",
    summary: "Sama Hotel — SAMA-26-AB12CD",
    description: "Booking reference: SAMA-26-AB12CD\nPay at the hotel; nothing charged online.",
    location: "Sama Hotel, Sayq, Jabal Al Akhdar, Oman",
    checkIn: "2026-10-01",
    checkOut: "2026-10-03",
    checkInTime: "14:00",
    checkOutTime: "12:00",
    url: "https://example.com/en/booking/SAMA-26-AB12CD?token=abc",
    now: new Date("2026-09-07T10:00:00Z"),
  });

  it("converts hotel time (Asia/Muscat, UTC+4) to UTC instants", () => {
    expect(ics).toContain("DTSTART:20261001T100000Z"); // 14:00 Muscat
    expect(ics).toContain("DTEND:20261003T080000Z"); // 12:00 Muscat
    expect(ics).toContain("DTSTAMP:20260907T100000Z");
  });

  it("is a well-formed VCALENDAR with CRLF line endings and escaped text", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("UID:SAMA-26-AB12CD@samahotel.net");
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("LOCATION:Sama Hotel\\, Sayq\\, Jabal Al Akhdar\\, Oman");
    expect(unfolded).toContain("\\nPay at the hotel\\; nothing charged online.");
    expect(ics.split("\r\n").some((line) => line.length > 75 && !line.startsWith(" "))).toBe(false);
  });

  it("escapes and folds per RFC 5545", () => {
    expect(icsEscape("a;b,c\\d\nfoo")).toBe("a\\;b\\,c\\\\d\\nfoo");
    const folded = icsFold(`DESCRIPTION:${"x".repeat(200)}`);
    const lines = folded.split("\r\n");
    expect(lines.length).toBe(3);
    expect(lines[1].startsWith(" ")).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`DESCRIPTION:${"x".repeat(200)}`);
  });
});
