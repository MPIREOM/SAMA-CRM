import { describe, expect, it } from "vitest";
import {
  DEFAULT_TAXES,
  addDays,
  dayOfWeek,
  effectiveRate,
  formatOmr,
  minStay,
  nightlyRates,
  nightsBetween,
  overlaps,
  quote,
  quoteFromNightly,
  roundOmr,
  type RatePlanLike,
} from "../pricing";

const CHALET = "11111111-1111-1111-1111-111111111111";
const DELUXE = "22222222-2222-2222-2222-222222222222";

const weekend: RatePlanLike = {
  room_type_id: null,
  start_date: "2026-01-01",
  end_date: "2027-12-31",
  rate_omr: null,
  adjust_pct: 20,
  min_stay: 1,
  days_of_week: [4, 5], // Thu, Fri
  priority: 10,
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

describe("rounding (OMR, 3 dp, half away from zero like Postgres)", () => {
  it("rounds to baisa", () => {
    expect(roundOmr(7.8624)).toBe(7.862);
    expect(roundOmr(7.8625)).toBe(7.863);
    expect(roundOmr(1.0005)).toBe(1.001);
    expect(formatOmr(165.11)).toBe("165.110");
  });
});

describe("dates", () => {
  it("counts nights and weekdays", () => {
    expect(nightsBetween("2026-09-17", "2026-09-20")).toBe(3);
    expect(nightsBetween("2026-09-20", "2026-09-17")).toBe(0);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(dayOfWeek("2026-09-17")).toBe(4); // Thursday
    expect(dayOfWeek("2026-09-19")).toBe(6); // Saturday
  });

  it("overlap rule is half-open (same-day turnover allowed)", () => {
    expect(overlaps("2026-09-10", "2026-09-12", "2026-09-12", "2026-09-14")).toBe(false);
    expect(overlaps("2026-09-10", "2026-09-13", "2026-09-12", "2026-09-14")).toBe(true);
    expect(overlaps("2026-09-12", "2026-09-14", "2026-09-10", "2026-09-13")).toBe(true);
    expect(overlaps("2026-09-01", "2026-09-30", "2026-09-10", "2026-09-11")).toBe(true);
  });
});

describe("rate plans", () => {
  it("applies the weekend +20% on Thu/Fri only", () => {
    const rates = nightlyRates(65, [weekend], CHALET, "2026-09-17", "2026-09-20");
    expect(rates).toEqual([
      { date: "2026-09-17", rate: 78 },
      { date: "2026-09-18", rate: 78 },
      { date: "2026-09-19", rate: 65 },
    ]);
  });

  it("highest priority wins, then room-type-specific over global, then newest", () => {
    const seasonal: RatePlanLike = {
      ...weekend,
      room_type_id: CHALET,
      days_of_week: null,
      rate_omr: 100,
      adjust_pct: null,
      priority: 10,
      created_at: "2026-02-01T00:00:00Z",
    };
    // Same priority as weekend plan; the chalet-specific one must win on Thursday.
    expect(effectiveRate(65, [weekend, seasonal], CHALET, "2026-09-17")).toBe(100);
    // Deluxe is not covered by the seasonal plan → weekend uplift applies.
    expect(effectiveRate(55, [weekend, seasonal], DELUXE, "2026-09-17")).toBe(66);
    // Higher priority beats specificity.
    const promo: RatePlanLike = { ...weekend, days_of_week: null, rate_omr: 40, adjust_pct: null, priority: 99 };
    expect(effectiveRate(65, [weekend, seasonal, promo], CHALET, "2026-09-17")).toBe(40);
  });

  it("inactive and out-of-range plans are ignored", () => {
    const off: RatePlanLike = { ...weekend, is_active: false };
    expect(effectiveRate(65, [off], CHALET, "2026-09-17")).toBe(65);
    const past: RatePlanLike = { ...weekend, start_date: "2020-01-01", end_date: "2020-12-31" };
    expect(effectiveRate(65, [past], CHALET, "2026-09-17")).toBe(65);
  });

  it("min stay comes from the winning plan for the check-in date", () => {
    const eid: RatePlanLike = {
      ...weekend,
      days_of_week: null,
      rate_omr: 120,
      adjust_pct: null,
      min_stay: 2,
      priority: 50,
      start_date: "2026-09-18",
      end_date: "2026-09-20",
    };
    expect(minStay([weekend, eid], CHALET, "2026-09-18")).toBe(2);
    expect(minStay([weekend, eid], CHALET, "2026-09-17")).toBe(1);
  });
});

describe("quote", () => {
  it("matches the database for the reference booking (2 chalet nights Thu+Fri, SAMA10)", () => {
    // Verified against bk_create_booking on 2026-09-07: subtotal 156, discount 15.6,
    // service 11.232, tourism 5.616, VAT 7.862, total 165.110.
    const q = quote(65, [weekend], CHALET, "2026-09-17", "2026-09-19", DEFAULT_TAXES, 10);
    expect(q.nights).toBe(2);
    expect(q.room_subtotal).toBe(156);
    expect(q.discount).toBe(15.6);
    expect(q.service_charge).toBe(11.232);
    expect(q.tourism_fee).toBe(5.616);
    expect(q.vat).toBe(7.862);
    expect(q.total).toBe(165.11);
  });

  it("taxes can be toggled individually and VAT can exclude fees", () => {
    const nightly = [{ date: "2026-09-19", rate: 100 }];
    const noVatOnFees = quoteFromNightly(nightly, { ...DEFAULT_TAXES, vat_on_fees: false });
    expect(noVatOnFees.vat).toBe(5);
    expect(noVatOnFees.total).toBe(117);
    const all = quoteFromNightly(nightly, DEFAULT_TAXES);
    expect(all.vat).toBe(5.6);
    expect(all.total).toBe(117.6);
    const none = quoteFromNightly(nightly, {
      ...DEFAULT_TAXES,
      service_charge_enabled: false,
      tourism_fee_enabled: false,
      vat_enabled: false,
    });
    expect(none.total).toBe(100);
  });

  it("rounds each line to baisa and sums the rounded lines", () => {
    const q = quoteFromNightly([{ date: "2026-09-19", rate: 33.333 }], DEFAULT_TAXES);
    expect(q.service_charge).toBe(2.667);
    expect(q.tourism_fee).toBe(1.333);
    expect(q.vat).toBe(1.867); // (33.333+2.667+1.333)=37.333 × 5% = 1.86665 → 1.867
    expect(q.total).toBe(39.2);
  });

  it("empty stay quotes zero", () => {
    const q = quote(65, [weekend], CHALET, "2026-09-19", "2026-09-19");
    expect(q.nights).toBe(0);
    expect(q.total).toBe(0);
  });
});

describe("add-ons (APEX Zipline, 4WD transfers)", () => {
  // Verified against bk_quote on the live DB on 2026-09-08: Fri 18 + Sat 19 Sep chalet
  // (78 + 65 = 143), zipline ×2 (5 each), transfer up + down (15 each):
  // service 11.440, tourism 5.720, VAT 8.008, add-ons 40, total 208.168.
  const nightly = [
    { date: "2026-09-18", rate: 78 },
    { date: "2026-09-19", rate: 65 },
  ];
  it("untaxed add-ons are added after the room taxes", () => {
    const q = quoteFromNightly(nightly, DEFAULT_TAXES, 0, [
      { quantity: 2, unit_price: 5, unit: "per_person", taxable: false },
      { quantity: 1, unit_price: 15, unit: "per_car", taxable: false },
      { quantity: 1, unit_price: 15, unit: "per_car", taxable: false },
    ]);
    expect(q.room_subtotal).toBe(143);
    expect(q.addons_total).toBe(40);
    expect(q.service_charge).toBe(11.44);
    expect(q.tourism_fee).toBe(5.72);
    expect(q.vat).toBe(8.008);
    expect(q.total).toBe(208.168);
    expect(q.addons.map((a) => a.total)).toEqual([10, 15, 15]);
  });

  it("taxable add-ons join the taxable base; per_night multiplies by nights; zero quantities drop out", () => {
    const q = quoteFromNightly(nightly, DEFAULT_TAXES, 0, [
      { quantity: 1, unit_price: 10, unit: "per_night", taxable: true },
      { quantity: 0, unit_price: 5, unit: "per_person", taxable: false },
    ]);
    expect(q.addons).toHaveLength(1);
    expect(q.addons[0].total).toBe(20);
    expect(q.addons_total).toBe(20);
    // taxable base 163 → 13.04 + 6.52 + VAT on 182.56 = 9.128
    expect(q.service_charge).toBe(13.04);
    expect(q.tourism_fee).toBe(6.52);
    expect(q.vat).toBe(9.128);
    expect(q.total).toBe(191.688);
  });

  it("a stay without add-ons is unchanged", () => {
    const q = quoteFromNightly(nightly, DEFAULT_TAXES);
    expect(q.addons).toEqual([]);
    expect(q.addons_total).toBe(0);
    expect(q.total).toBe(168.168);
  });
});
