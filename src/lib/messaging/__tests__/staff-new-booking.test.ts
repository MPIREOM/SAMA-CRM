import { describe, expect, it } from "vitest";
import type { BkRoom } from "@/lib/database.types";
import { invalidRecipients, MAX_STAFF_RECIPIENTS, parseRecipients } from "../recipients";
import { buildContext, sampleBooking, SAMPLE_SETTINGS } from "../templates";
import { backOfficeBookingUrl, buildStaffNewBooking, compactRange, staffNewBookingSubject } from "../templates/staff-new-booking";

const BASE = "https://book.example.test";

function ctxWith(overrides: Partial<ReturnType<typeof sampleBooking>> = {}) {
  const booking = { ...sampleBooking("en"), created_at: "2026-09-16T06:42:00Z", ...overrides };
  return buildContext(booking, SAMPLE_SETTINGS, "en");
}

describe("parseRecipients", () => {
  it("splits on commas, semicolons and whitespace, drops junk and duplicates", () => {
    expect(parseRecipients(" reservations@samahotel.net, Manager@samahotel.net ;reservations@SAMAHOTEL.net\nfront-desk@samahotel.net not-an-email")).toEqual([
      "reservations@samahotel.net",
      "Manager@samahotel.net",
      "front-desk@samahotel.net",
    ]);
    expect(parseRecipients("")).toEqual([]);
    expect(parseRecipients(null)).toEqual([]);
  });

  it("caps the list", () => {
    const many = Array.from({ length: 9 }, (_, i) => `a${i}@x.com`).join(",");
    expect(parseRecipients(many)).toHaveLength(MAX_STAFF_RECIPIENTS);
  });

  it("names the entries that are not addresses", () => {
    expect(invalidRecipients("a@x.com, nope, b@y")).toEqual(["nope", "b@y"]);
    expect(invalidRecipients("a@x.com")).toEqual([]);
  });
});

describe("compactRange", () => {
  it("collapses same-month, same-year and cross-year stays", () => {
    expect(compactRange("2026-09-17", "2026-09-19")).toBe("17–19 Sep 2026");
    expect(compactRange("2026-09-28", "2026-10-02")).toBe("28 Sep – 2 Oct 2026");
    expect(compactRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027");
  });
});

describe("staff new-booking email", () => {
  it("subject carries ref, room, dates and total", () => {
    expect(staffNewBookingSubject(ctxWith())).toBe("New booking SAMA-26-K7P3QX · Deluxe Room — Mountain & Sunset View · 17–19 Sep 2026 · OMR 180.232");
  });

  it("has every detail the desk needs, in HTML and in plain text", () => {
    const ctx = ctxWith();
    const email = buildStaffNewBooking(ctx, backOfficeBookingUrl(ctx.booking.id, BASE));
    for (const raw of [email.html, email.text]) {
      const body = raw.replace(/&amp;/g, "&");
      // who
      expect(body).toContain("Ahmed Al Nabhani");
      expect(body).toContain("+96899123456");
      expect(body).toContain("guest@example.com");
      expect(body).toContain("Nationality");
      expect(body).toContain("OM");
      expect(body).toContain("English");
      // where it came from, when, status
      expect(body).toContain("Made from the website on 16 Sep 2026, 10:42 (Muscat time)");
      expect(body).toContain("Confirmed");
      // stay
      expect(body).toContain("Deluxe Room — Mountain & Sunset View");
      expect(body).toContain("Twin beds");
      expect(body).toContain("Not assigned yet");
      expect(body).toContain("Thu, 17 Sep 2026 · from 2:00 PM");
      expect(body).toContain("Sat, 19 Sep 2026 · by 12:00 PM");
      expect(body).toContain("2 adults, 1 child");
      // add-ons with notes and status
      expect(body).toContain("APEX Zipline × 2");
      expect(body).toContain("Arrival day, afternoon · requested — confirm with the guest · OMR 10.000");
      expect(body).toContain("4WD transfer up — Birkat Al Mouz to the hotel × 1");
      // requests
      expect(body).toContain("High floor if possible");
      // money — same rows as the guest's confirmation
      expect(body).toContain("Room subtotal (2 nights)");
      expect(body).toContain("OMR 132.000");
      expect(body).toContain("Service charge 8 %");
      expect(body).toContain("VAT 5 %");
      expect(body).toContain("Add-ons (paid at the hotel)");
      expect(body).toContain("OMR 180.232");
      expect(body).toContain("Nightly rates: 17 Sep 66.000 · 18 Sep 66.000");
      expect(body).toContain("Pay at the hotel — nothing has been charged");
      // links
      expect(body).toContain(`${BASE}/reservations/${ctx.booking.id}`);
      expect(body).toContain("https://wa.me/96899123456");
      expect(body).toContain("Internal notification — not sent to the guest.");
    }
    expect(email.html).toContain('lang="en" dir="ltr"');
    expect(email.html).not.toContain("Internal notes");
    expect(email.html).not.toContain("Promo code");
  });

  it("shows the assigned room, promo code, internal notes and a pending status when present", () => {
    const room = { id: "r1", room_number: "204", floor: "2", bed_type: "king", notes: null, room_type_id: "x", sort_order: 1, status: "active", created_at: "", updated_at: "" } as BkRoom;
    const email = buildStaffNewBooking(
      ctxWith({ room, promo_code: "SAMA10", discount_omr: 13.2, internal_notes: "VIP — owner's friend", status: "pending", source: "phone", special_requests: null, addons: [] }),
      "https://x.test/reservations/1"
    );
    expect(email.html).toContain("Room 204");
    expect(email.html).toContain("SAMA10");
    expect(email.html).toContain("Discount (SAMA10)");
    expect(email.html).toContain("Internal notes (staff):</strong> VIP — owner&#39;s friend".replace("&#39;", "'"));
    expect(email.html).toContain("Made from the phone");
    expect(email.html).toContain("Status: Pending.");
    expect(email.html).toContain("Special requests:</strong> none.");
    expect(email.html).not.toContain("Add-ons to arrange");
  });

  it("escapes guest-supplied text", () => {
    const email = buildStaffNewBooking(ctxWith({ guest_name: "<b>Mallory</b>", special_requests: "<script>alert(1)</script>" }), "https://x.test/reservations/1");
    expect(email.html).not.toContain("<b>Mallory</b>");
    expect(email.html).toContain("&lt;b&gt;Mallory&lt;/b&gt;");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
  });

  it("falls back to the configured app URL for the back-office link", () => {
    expect(backOfficeBookingUrl("abc", "https://sama-crm.vercel.app/")).toBe("https://sama-crm.vercel.app/reservations/abc");
  });
});
