import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumberFromString } from "libphonenumber-js";
import { addDays, nightsBetween } from "@/lib/booking-engine/pricing";
import { muscatToday } from "@/lib/booking-engine/dates";

// Zod schemas shared by the guest site (client validation + server actions).
// Nothing here is server-only so the booking form can reuse the same rules.

export const MAX_ADULTS = 4;
export const MAX_CHILDREN = 3;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isoDate = z
  .string()
  .regex(ISO_DATE)
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, {
    message: "invalid_date",
  });

export const searchQuerySchema = z
  .object({
    checkin: isoDate,
    checkout: isoDate,
    adults: z.coerce.number().int().min(1).max(MAX_ADULTS),
    children: z.coerce.number().int().min(0).max(MAX_CHILDREN),
  })
  .refine((v) => v.checkout > v.checkin, { message: "invalid_dates", path: ["checkout"] });

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchLimits {
  maxNights: number;
  maxAdvanceDays: number;
}

/**
 * Parse the /book query. Returns sensible defaults (tonight, 2 adults) and a
 * flag telling the page to show a friendly "we could not read your dates" note.
 * Values that are individually usable are kept; only broken ones are replaced.
 */
export function parseSearchQuery(
  raw: Record<string, string | string[] | undefined>,
  limits: SearchLimits,
  today: string = muscatToday()
): { query: SearchQuery; fallback: boolean } {
  const pick = (k: string) => (Array.isArray(raw[k]) ? raw[k]?.[0] : raw[k]);
  let fallback = false;

  const ci = isoDate.safeParse(pick("checkin"));
  const co = isoDate.safeParse(pick("checkout"));
  if (!ci.success || !co.success) fallback = true;

  const adultsRaw = clampInt(pick("adults"), 1, MAX_ADULTS);
  const childrenRaw = clampInt(pick("children"), 0, MAX_CHILDREN);
  if (adultsRaw.changed || childrenRaw.changed) fallback = true;
  const adults = adultsRaw.value ?? 2;
  const children = childrenRaw.value ?? 0;

  let checkin = ci.success ? ci.data : today;
  if (checkin < today) {
    checkin = today;
    fallback = true;
  }
  const maxIn = addDays(today, limits.maxAdvanceDays);
  if (checkin > maxIn) {
    checkin = maxIn;
    fallback = true;
  }
  let checkout = co.success ? co.data : addDays(checkin, 1);
  if (checkout <= checkin) {
    checkout = addDays(checkin, 1);
    fallback = true;
  }
  if (nightsBetween(checkin, checkout) > limits.maxNights) {
    checkout = addDays(checkin, limits.maxNights);
    fallback = true;
  }
  return { query: { checkin, checkout, adults, children }, fallback };
}

/** Integer in [min, max]; `changed` when the raw value was present but unusable or out of range. */
function clampInt(value: string | undefined, min: number, max: number): { value: number | null; changed: boolean } {
  if (value === undefined || value === "") return { value: null, changed: false };
  const n = /^-?\d+$/.test(value.trim()) ? parseInt(value, 10) : NaN;
  if (Number.isNaN(n)) return { value: null, changed: true };
  const clamped = Math.min(max, Math.max(min, n));
  return { value: clamped, changed: clamped !== n };
}

/** Query string for /book and /book/[slug] links. */
export function searchParamsFor(q: SearchQuery): Record<string, string> {
  return {
    checkin: q.checkin,
    checkout: q.checkout,
    adults: String(q.adults),
    children: String(q.children),
  };
}

// ---------------------------------------------------------------------------
// Guest details (step 1 of the booking flow)
// ---------------------------------------------------------------------------

export const NATIONALITY_CODES = [
  "OM",
  "SA",
  "AE",
  "KW",
  "QA",
  "BH",
  "EG",
  "IN",
  "PK",
  "GB",
  "DE",
  "FR",
  "US",
  "OTHER",
] as const;
export type NationalityCode = (typeof NATIONALITY_CODES)[number];

/** English demonyms stored in bk_bookings.nationality (the CRM is English-keyed). */
export const NATIONALITY_STORED: Record<Exclude<NationalityCode, "OTHER">, string> = {
  OM: "Omani",
  SA: "Saudi",
  AE: "Emirati",
  KW: "Kuwaiti",
  QA: "Qatari",
  BH: "Bahraini",
  EG: "Egyptian",
  IN: "Indian",
  PK: "Pakistani",
  GB: "British",
  DE: "German",
  FR: "French",
  US: "American",
};

/** Combine a dialling code and a national number into E.164, or null. */
export function toE164(countryCode: string, national: string): string | null {
  const digits = national
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .replace(/^0+/, "");
  if (!digits) return null;
  const candidate = `${countryCode}${digits}`;
  if (!isValidPhoneNumber(candidate)) return null;
  const parsed = parsePhoneNumberFromString(candidate);
  return parsed?.format("E.164") ?? null;
}

export const guestDetailsSchema = z
  .object({
    fullName: z.string().trim().min(2, "name").max(120, "name"),
    email: z
      .string()
      .trim()
      .max(160, "email")
      .transform((v) => v.toLowerCase())
      .refine((v) => v === "" || z.string().email().safeParse(v).success, { message: "email" }),
    countryCode: z.string().regex(/^\+\d{1,4}$/, "phone"),
    phone: z.string().trim().min(4, "phone").max(20, "phone"),
    nationality: z.enum(NATIONALITY_CODES, { errorMap: () => ({ message: "nationality" }) }),
    otherNationality: z.string().trim().max(60, "otherNationality").default(""),
    preferredLang: z.enum(["en", "ar"]),
    specialRequests: z.string().trim().max(500, "requests").default(""),
    promoCode: z
      .string()
      .trim()
      .max(30)
      .transform((v) => v.toUpperCase())
      .default(""),
  })
  .superRefine((v, ctx) => {
    if (!toE164(v.countryCode, v.phone)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "phone", path: ["phone"] });
    }
    if (v.nationality === "OTHER" && v.otherNationality.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "otherNationality", path: ["otherNationality"] });
    }
  });

export type GuestDetails = z.infer<typeof guestDetailsSchema>;
export type GuestDetailsInput = z.input<typeof guestDetailsSchema>;

export function storedNationality(d: Pick<GuestDetails, "nationality" | "otherNationality">): string {
  return d.nationality === "OTHER" ? d.otherNationality : NATIONALITY_STORED[d.nationality];
}

/** Everything the confirm action needs: guest details + stay + consent. */
export const createBookingSchema = guestDetailsSchema.and(
  z.object({
    slug: z.string().regex(/^[a-z0-9-]{1,60}$/),
    checkin: isoDate,
    checkout: isoDate,
    adults: z.coerce.number().int().min(1).max(MAX_ADULTS),
    children: z.coerce.number().int().min(0).max(MAX_CHILDREN),
    consent: z.literal("on", { errorMap: () => ({ message: "consent" }) }),
    locale: z.enum(["en", "ar"]),
  })
);

/** Field-level error map: field → validation message key. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
