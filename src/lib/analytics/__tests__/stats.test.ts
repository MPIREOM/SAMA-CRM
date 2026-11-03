import { describe, expect, it } from "vitest";
import { bookingFunnel, patternStats, revenueStats, trafficStats, type BookingRow, type WebEvent } from "../stats";

function ev(p: Partial<WebEvent>): WebEvent {
  return {
    created_at: "2026-11-01T08:00:00Z",
    kind: "pageview",
    visitor_id: "v1",
    session_id: "s1",
    path: "/en",
    page_type: "home",
    locale: "en",
    source: "direct",
    country: "OM",
    device: "mobile",
    browser: "Safari",
    room_slug: null,
    ...p,
  };
}

function bk(p: Partial<BookingRow>): BookingRow {
  return {
    id: "b1",
    ref: "SAMA-26-AAAAAA",
    status: "confirmed",
    source: "website",
    room_type_id: "t1",
    check_in: "2026-11-01",
    check_out: "2026-11-03",
    nights: 2,
    adults: 2,
    children: 0,
    nightly_rates: [
      { date: "2026-11-01", rate: 50 },
      { date: "2026-11-02", rate: 60 },
    ],
    room_subtotal_omr: 110,
    discount_omr: 10,
    addons_omr: 5,
    service_charge_omr: 8,
    tourism_fee_omr: 4,
    vat_omr: 6,
    total_omr: 123,
    promo_code: null,
    nationality: "om",
    created_at: "2026-10-25T10:00:00Z",
    ...p,
  };
}

describe("trafficStats", () => {
  it("counts visitors, sessions, bounces and credits the session's first source", () => {
    const events = [
      ev({ session_id: "s1", source: "google", path: "/en" }),
      ev({ session_id: "s1", source: "google", path: "/en/book", page_type: "results" }),
      ev({ session_id: "s2", visitor_id: "v2", source: "instagram", device: "desktop", created_at: "2026-11-02T08:00:00Z" }),
    ];
    const t = trafficStats(events, "2026-11-01", "2026-11-02");
    expect(t).toMatchObject({ visitors: 2, sessions: 2, pageviews: 3, bounceRate: 0.5 });
    expect(t.sources).toEqual([
      { key: "google", value: 1 },
      { key: "instagram", value: 1 },
    ]);
    expect(t.daily).toEqual([
      { date: "2026-11-01", visitors: 1, pageviews: 2 },
      { date: "2026-11-02", visitors: 1, pageviews: 1 },
    ]);
  });

  it("buckets days in Muscat time", () => {
    // 21:00 UTC on 1 Nov is 01:00 on 2 Nov in Muscat.
    const t = trafficStats([ev({ created_at: "2026-11-01T21:00:00Z" })], "2026-11-01", "2026-11-02");
    expect(t.daily.map((d) => d.pageviews)).toEqual([0, 1]);
  });
});

describe("bookingFunnel", () => {
  it("counts sessions per step and room interest", () => {
    const f = bookingFunnel([
      ev({ session_id: "a" }),
      ev({ session_id: "a", page_type: "results" }),
      ev({ session_id: "a", page_type: "booking", room_slug: "chalet" }),
      ev({ session_id: "a", kind: "booking_review", page_type: "booking", room_slug: "chalet" }),
      ev({ session_id: "a", page_type: "confirmation" }),
      ev({ session_id: "b", page_type: "results" }),
      ev({ session_id: "c" }),
    ]);
    expect(f.steps.map((s) => s.sessions)).toEqual([3, 2, 1, 1, 1]);
    expect(f.roomInterest).toEqual([{ key: "chalet", value: 1 }]);
    // A confirmation without the earlier steps still counts through the funnel.
    expect(bookingFunnel([ev({ session_id: "z", page_type: "confirmation" })]).steps.map((s) => s.sessions)).toEqual([1, 1, 1, 1, 1]);
  });
});

describe("revenueStats", () => {
  it("allocates nights, discount and taxes to the range", () => {
    const rooms = new Map([
      ["t1", 2],
      ["t2", 3],
    ]);
    // Only the night of 2 Nov is in range: rate 60 − half the 10 discount = 55.
    const r = revenueStats([bk({}), bk({ id: "x", status: "cancelled" })], rooms, "2026-11-02", "2026-11-02");
    expect(r.roomNightsAvailable).toBe(5);
    expect(r.roomNightsSold).toBe(1);
    expect(r.occupancy).toBeCloseTo(0.2);
    expect(r.roomRevenue).toBe(55);
    expect(r.adr).toBe(55);
    expect(r.revpar).toBe(11);
    expect(r.serviceCharge).toBe(4);
    expect(r.vat).toBe(3);
    expect(r.byCategory.find((c) => c.room_type_id === "t1")).toMatchObject({ sold: 1, available: 2, occupancy: 0.5 });
  });
});

describe("patternStats", () => {
  it("summarises sources, lead time, stay length, cancellations, add-ons and promos", () => {
    const p = patternStats(
      [bk({}), bk({ id: "b2", source: "walk_in", promo_code: "SAMA10", discount_omr: 5, created_at: "2026-11-01T05:00:00Z" }), bk({ id: "b3", status: "cancelled" })],
      [
        { booking_id: "b1", addon_id: "zip", quantity: 2, total_omr: 10, status: "requested" },
        { booking_id: "b3", addon_id: "zip", quantity: 1, total_omr: 5, status: "cancelled" },
      ],
    );
    expect(p).toMatchObject({ bookings: 3, live: 2, cancelled: 1, avgLengthOfStay: 2, avgPartySize: 2 });
    expect(p.cancellationRate).toBeCloseTo(1 / 3);
    expect(p.avgLeadTime).toBe(3.5); // 7 days and same day
    expect(p.leadTime.find((b) => b.key === "Same day")?.value).toBe(1);
    expect(p.bySource[0]).toEqual({ key: "website", bookings: 2, value: 123 });
    expect(p.addons).toEqual([{ addon_id: "zip", quantity: 2, revenue: 10, bookings: 1 }]);
    expect(p.promos).toEqual([{ code: "SAMA10", bookings: 1, discount: 5 }]);
    expect(p.nationalities).toEqual([{ key: "OM", value: 2 }]);
  });
});
