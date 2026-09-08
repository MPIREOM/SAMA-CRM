import { describe, expect, it } from "vitest";
import {
  createBookingSchema,
  fieldErrors,
  guestDetailsSchema,
  parseSearchQuery,
  storedNationality,
  toE164,
} from "../schemas";

const LIMITS = { maxNights: 30, maxAdvanceDays: 365 };
const TODAY = "2026-09-07";

describe("parseSearchQuery", () => {
  it("keeps a valid query untouched", () => {
    const { query, fallback } = parseSearchQuery(
      { checkin: "2026-10-01", checkout: "2026-10-03", adults: "2", children: "1" },
      LIMITS,
      TODAY
    );
    expect(fallback).toBe(false);
    expect(query).toEqual({ checkin: "2026-10-01", checkout: "2026-10-03", adults: 2, children: 1 });
  });

  it("falls back to tonight for missing or garbage dates and flags it", () => {
    const { query, fallback } = parseSearchQuery({ checkin: "not-a-date", adults: "3" }, LIMITS, TODAY);
    expect(fallback).toBe(true);
    expect(query.checkin).toBe(TODAY);
    expect(query.checkout).toBe("2026-09-08");
    expect(query.adults).toBe(3); // usable values survive
    expect(query.children).toBe(0);
  });

  it("moves past check-ins to today, clamps guests and caps the stay length", () => {
    const { query, fallback } = parseSearchQuery(
      { checkin: "2026-09-01", checkout: "2026-12-01", adults: "9", children: "-2" },
      LIMITS,
      TODAY
    );
    expect(fallback).toBe(true);
    expect(query.checkin).toBe(TODAY);
    expect(query.checkout).toBe("2026-10-07"); // today + maxNights
    expect(query.adults).toBe(4);
    expect(query.children).toBe(0);
  });

  it("rejects an invalid calendar date such as 31 February", () => {
    const { query, fallback } = parseSearchQuery({ checkin: "2026-02-31", checkout: "2026-03-02" }, LIMITS, TODAY);
    expect(fallback).toBe(true);
    expect(query.checkin).toBe(TODAY);
  });
});

describe("toE164", () => {
  it("normalises Omani numbers with spaces, trunk zeros and Arabic-Indic digits", () => {
    expect(toE164("+968", "99 475 688")).toBe("+96899475688");
    expect(toE164("+968", "099475688")).toBe("+96899475688");
    expect(toE164("+968", "٩٩٤٧٥٦٨٨")).toBe("+96899475688");
  });

  it("returns null for numbers that are not valid for the country", () => {
    expect(toE164("+968", "123")).toBeNull();
    expect(toE164("+44", "99475688")).toBeNull();
  });
});

describe("guestDetailsSchema", () => {
  const valid = {
    fullName: "Ahmed Al Nabhani",
    email: "Ahmed@Example.com",
    countryCode: "+968",
    phone: "99475688",
    nationality: "OM",
    otherNationality: "",
    preferredLang: "ar",
    specialRequests: "Late arrival",
    promoCode: "sama10",
  };

  it("accepts a valid guest and normalises email + promo code", () => {
    const parsed = guestDetailsSchema.parse(valid);
    expect(parsed.email).toBe("ahmed@example.com");
    expect(parsed.promoCode).toBe("SAMA10");
    expect(storedNationality(parsed)).toBe("Omani");
  });

  it("allows an empty email but rejects a malformed one", () => {
    expect(guestDetailsSchema.safeParse({ ...valid, email: "" }).success).toBe(true);
    const bad = guestDetailsSchema.safeParse({ ...valid, email: "nope" });
    expect(bad.success).toBe(false);
    if (!bad.success) expect(fieldErrors(bad.error)).toEqual({ email: "email" });
  });

  it("requires a free-text nationality when Other is chosen and a valid phone", () => {
    const res = guestDetailsSchema.safeParse({ ...valid, nationality: "OTHER", otherNationality: "", phone: "12" });
    expect(res.success).toBe(false);
    if (!res.success) {
      const errors = fieldErrors(res.error);
      expect(errors.phone).toBe("phone");
      expect(errors.otherNationality).toBe("otherNationality");
    }
    const ok = guestDetailsSchema.safeParse({ ...valid, nationality: "OTHER", otherNationality: "Jordanian" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(storedNationality(ok.data)).toBe("Jordanian");
  });

  it("createBookingSchema insists on consent and a locale", () => {
    const base = { ...valid, slug: "chalet", checkin: "2026-10-01", checkout: "2026-10-03", adults: "2", children: "0", locale: "en" };
    const noConsent = createBookingSchema.safeParse({ ...base, consent: "" });
    expect(noConsent.success).toBe(false);
    if (!noConsent.success) expect(fieldErrors(noConsent.error).consent).toBe("consent");
    const ok = createBookingSchema.safeParse({ ...base, consent: "on" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.adults).toBe(2);
  });
});
