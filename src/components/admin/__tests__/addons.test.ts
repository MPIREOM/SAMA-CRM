import { describe, expect, it } from "vitest";
import { DEFAULT_TAXES, quoteFromNightly } from "@/lib/booking-engine/pricing";
import { ADDON_TRANSITIONS, addonLineOmr, addonsSummary, bookingMoneyWithAddons } from "../shared";

// Chalet, Fri 18 + Sat 19 Sep 2026: 78 (weekend +20 %) + 65 = 143.
const NIGHTLY = [
  { date: "2026-09-18", rate: 78 },
  { date: "2026-09-19", rate: 65 },
];

describe("bookingMoneyWithAddons", () => {
  it("matches bk_quote for untaxed add-ons: zipline ×2 + both transfers → 208.168", () => {
    const money = bookingMoneyWithAddons(
      NIGHTLY,
      0,
      [
        { total_omr: 10, taxable: false, status: "requested" },
        { total_omr: 15, taxable: false, status: "requested" },
        { total_omr: 15, taxable: false, status: "confirmed" },
      ],
      DEFAULT_TAXES
    );
    expect(money).toEqual({
      room_subtotal_omr: 143,
      discount_omr: 0,
      addons_omr: 40,
      service_charge_omr: 11.44,
      tourism_fee_omr: 5.72,
      vat_omr: 8.008,
      total_omr: 208.168,
    });
  });

  it("ignores cancelled lines and puts taxable lines into the taxable base", () => {
    const money = bookingMoneyWithAddons(
      NIGHTLY,
      0,
      [
        { total_omr: 8, taxable: true, status: "requested" },
        { total_omr: 99, taxable: false, status: "cancelled" },
      ],
      DEFAULT_TAXES
    );
    // Same as the SQL: taxable = 143 + 8 = 151.
    expect(money.addons_omr).toBe(8);
    expect(money.service_charge_omr).toBe(12.08);
    expect(money.tourism_fee_omr).toBe(6.04);
    expect(money.vat_omr).toBe(8.456);
    expect(money.total_omr).toBe(177.576);
  });

  it("agrees with quoteFromNightly when the discount is the stored absolute amount", () => {
    const q = quoteFromNightly(NIGHTLY, DEFAULT_TAXES, 10, [{ quantity: 2, unit_price: 5, taxable: false }]);
    const money = bookingMoneyWithAddons(NIGHTLY, q.discount, [{ total_omr: 10, taxable: false, status: "requested" }], DEFAULT_TAXES);
    expect(money.discount_omr).toBe(q.discount);
    expect(money.service_charge_omr).toBe(q.service_charge);
    expect(money.tourism_fee_omr).toBe(q.tourism_fee);
    expect(money.vat_omr).toBe(q.vat);
    expect(money.total_omr).toBe(q.total);
  });

  it("with no add-ons the total is the plain room quote", () => {
    const q = quoteFromNightly(NIGHTLY, DEFAULT_TAXES, 0);
    expect(bookingMoneyWithAddons(NIGHTLY, 0, [], DEFAULT_TAXES).total_omr).toBe(q.total);
  });
});

describe("addonLineOmr", () => {
  it("multiplies per_night lines by the nights, others by the quantity only", () => {
    expect(addonLineOmr(5, 2, "per_person", 3)).toBe(10);
    expect(addonLineOmr(15, 1, "per_car", 3)).toBe(15);
    expect(addonLineOmr(2, 2, "per_night", 3)).toBe(12);
    expect(addonLineOmr(1.2345, 1, "per_booking", 1)).toBe(1.235);
  });
});

describe("addonsSummary", () => {
  it("lists live lines as 'name ×qty' separated by semicolons", () => {
    expect(
      addonsSummary([
        { quantity: 2, status: "requested", addon: { name_en: "APEX Zipline" } },
        { quantity: 1, status: "confirmed", addon: { name_en: "4WD transfer up" } },
        { quantity: 1, status: "cancelled", addon: { name_en: "4WD transfer down" } },
      ])
    ).toBe("APEX Zipline ×2; 4WD transfer up ×1");
    expect(addonsSummary([])).toBe("");
  });
});

describe("ADDON_TRANSITIONS", () => {
  it("only moves forward: requested → confirmed/cancelled, confirmed → done/cancelled", () => {
    expect(ADDON_TRANSITIONS.requested).toEqual(["confirmed", "cancelled"]);
    expect(ADDON_TRANSITIONS.confirmed).toEqual(["done", "cancelled"]);
    expect(ADDON_TRANSITIONS.done).toEqual([]);
    expect(ADDON_TRANSITIONS.cancelled).toEqual([]);
  });
});
