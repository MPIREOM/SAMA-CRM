import { describe, expect, it } from "vitest";
import {
  ADDON_NOTE_MAX,
  addonFieldName,
  addonSelectionSchema,
  addonSelectionsSchema,
  addonsFromFormData,
  fieldErrors,
} from "../schemas";
import {
  addonUnitKey,
  bookingAddonLines,
  hasAddon,
  localizeAddon,
  quoteAddonLines,
  type BookingAddonRow,
} from "../lib";
import type { BkAddon } from "@/lib/database.types";

const LIMITS = [
  { slug: "apex-zipline", max_quantity: 10 },
  { slug: "transfer-up", max_quantity: 3 },
  { slug: "transfer-down", max_quantity: 3 },
];

describe("addonSelectionSchema", () => {
  it("coerces the quantity, trims and collapses the note", () => {
    const r = addonSelectionSchema.parse({ slug: "apex-zipline", quantity: "2", note: "  Arrival   day\n afternoon " });
    expect(r).toEqual({ slug: "apex-zipline", quantity: 2, note: "Arrival day afternoon" });
  });

  it("defaults the note to an empty string", () => {
    expect(addonSelectionSchema.parse({ slug: "transfer-up", quantity: 1 }).note).toBe("");
  });

  it("rejects fractional, negative and oversized quantities", () => {
    for (const quantity of ["1.5", "-1", "51", "abc"]) {
      const r = addonSelectionSchema.safeParse({ slug: "apex-zipline", quantity });
      expect(r.success, quantity).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe("addon_quantity");
    }
  });

  it("rejects malformed slugs", () => {
    const r = addonSelectionSchema.safeParse({ slug: "APEX Zipline!", quantity: 1 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("addon_not_found");
  });

  it(`caps the note at ${ADDON_NOTE_MAX} characters`, () => {
    const ok = addonSelectionSchema.safeParse({ slug: "apex-zipline", quantity: 1, note: "x".repeat(ADDON_NOTE_MAX) });
    expect(ok.success).toBe(true);
    const long = addonSelectionSchema.safeParse({ slug: "apex-zipline", quantity: 1, note: "x".repeat(ADDON_NOTE_MAX + 1) });
    expect(long.success).toBe(false);
    if (!long.success) expect(fieldErrors(long.error)).toEqual({ note: "addonNote" });
  });
});

describe("addonSelectionsSchema", () => {
  const schema = addonSelectionsSchema(LIMITS);

  it("keeps known add-ons within their limit and drops zero quantities", () => {
    const r = schema.parse([
      { slug: "apex-zipline", quantity: "2", note: "Arrival day" },
      { slug: "transfer-up", quantity: "1" },
      { slug: "transfer-down", quantity: "0" },
    ]);
    expect(r).toEqual([
      { slug: "apex-zipline", quantity: 2, note: "Arrival day" },
      { slug: "transfer-up", quantity: 1, note: "" },
    ]);
  });

  it("accepts an empty list", () => {
    expect(schema.parse([])).toEqual([]);
  });

  it("rejects an unknown slug", () => {
    const r = schema.safeParse([{ slug: "helicopter", quantity: 1 }]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("addon_not_found");
  });

  it("rejects a quantity above the catalogue limit", () => {
    const r = schema.safeParse([{ slug: "transfer-up", quantity: 4 }]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("addon_quantity");
    expect(schema.safeParse([{ slug: "transfer-up", quantity: 3 }]).success).toBe(true);
  });

  it("rejects the same add-on listed twice", () => {
    const r = schema.safeParse([
      { slug: "apex-zipline", quantity: 1 },
      { slug: "apex-zipline", quantity: 1 },
    ]);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("addon_not_found");
  });

  it("ignores a zero-quantity entry for an unknown slug (nothing was actually chosen)", () => {
    expect(schema.parse([{ slug: "helicopter", quantity: 0 }])).toEqual([]);
  });
});

describe("addonsFromFormData", () => {
  it("reads the hidden fields the review form writes, ignoring unrelated keys", () => {
    const fd = new FormData();
    fd.set("fullName", "Ahmed");
    fd.set(addonFieldName("apex-zipline", "quantity"), "2");
    fd.set(addonFieldName("apex-zipline", "note"), "Arrival day");
    fd.set(addonFieldName("transfer-up", "quantity"), "1");
    fd.set("addon.bad slug.quantity", "9");
    const raw = addonsFromFormData(fd);
    expect(raw).toEqual([
      { slug: "apex-zipline", quantity: "2", note: "Arrival day" },
      { slug: "transfer-up", quantity: "1", note: "" },
    ]);
    expect(addonSelectionsSchema(LIMITS).parse(raw)).toHaveLength(2);
  });
});

const now = "2026-09-08T00:00:00.000Z";
const APEX: BkAddon = {
  id: "a1",
  slug: "apex-zipline",
  kind: "activity",
  name_en: "APEX Zipline",
  name_ar: "أبكس زيبلاين",
  tagline_en: "310 m over the canyon",
  tagline_ar: null,
  description_en: "Fly.",
  description_ar: null,
  price_omr: 5,
  unit: "per_person",
  max_quantity: 10,
  taxable: false,
  requires_note: true,
  note_hint_en: "Preferred day",
  note_hint_ar: null,
  image: null,
  details: { length_m: 310, website: "https://www.apexzipline.com", nested: { x: 1 } },
  is_active: true,
  sort_order: 10,
  created_at: now,
  updated_at: now,
};
const TRANSFER: BkAddon = { ...APEX, id: "a2", slug: "transfer-up", kind: "transfer", name_en: "4WD transfer up", name_ar: "نقل صعوداً", unit: "per_car", max_quantity: 3, price_omr: 15, image: "/images/addons/transfer.jpg" };

describe("localizeAddon", () => {
  it("picks the locale copy, falls back to English and keeps scalar details only", () => {
    const en = localizeAddon(APEX, "en");
    const ar = localizeAddon(APEX, "ar");
    expect(en.name).toBe("APEX Zipline");
    expect(ar.name).toBe("أبكس زيبلاين");
    expect(ar.tagline).toBe("310 m over the canyon");
    expect(ar.noteHint).toBe("Preferred day");
    expect(en.details).toEqual({ length_m: 310, website: "https://www.apexzipline.com" });
    expect(en.image).toBe("/images/addons/apex-zipline.jpg");
    expect(en.unit).toBe("per_person");
    expect(en.kind).toBe("activity");
  });

  it("labels per_person activities as per rider, everything else by unit", () => {
    expect(addonUnitKey("per_person", "activity")).toBe("per_rider");
    expect(addonUnitKey("per_person", "other")).toBe("per_person");
    expect(addonUnitKey("per_car", "transfer")).toBe("per_car");
  });
});

describe("price lines", () => {
  it("maps quote add-ons to localized lines, dropping zero quantities", () => {
    const lines = quoteAddonLines(
      [
        { addon_id: "a1", slug: "apex-zipline", kind: "activity", name_en: "APEX Zipline", name_ar: "أبكس زيبلاين", unit: "per_person", quantity: 2, unit_price: 5, total: 10, taxable: false, note: null },
        { addon_id: "a2", slug: "transfer-up", kind: "transfer", name_en: "4WD transfer up", name_ar: "نقل", unit: "per_car", quantity: 0, unit_price: 15, total: 0, taxable: false, note: null },
      ],
      "ar"
    );
    expect(lines).toEqual([{ key: "apex-zipline", name: "أبكس زيبلاين", quantity: 2, total: 10 }]);
  });

  it("maps stored booking add-ons and skips cancelled rows", () => {
    const rows: BookingAddonRow[] = [
      { id: "r1", booking_id: "b", addon_id: "a1", quantity: 2, unit_price_omr: 5, total_omr: 10, taxable: false, note: null, status: "requested", created_at: now, updated_at: now, addon: APEX },
      { id: "r2", booking_id: "b", addon_id: "a2", quantity: 1, unit_price_omr: 15, total_omr: 15, taxable: false, note: "1 PM", status: "cancelled", created_at: now, updated_at: now, addon: TRANSFER },
    ];
    expect(bookingAddonLines(rows, "en")).toEqual([{ key: "r1", name: "APEX Zipline", quantity: 2, total: 10 }]);
    expect(hasAddon(rows, "apex-zipline")).toBe(true);
    expect(hasAddon(rows, "transfer-up")).toBe(false);
    expect(bookingAddonLines(undefined, "en")).toEqual([]);
  });
});
