import { createHmac, timingSafeEqual } from "node:crypto";

// Booking-page access tokens: HMAC-SHA256(ref) so /booking/[ref]?token=…
// cannot be guessed. Keyed by BOOKING_TOKEN_SECRET when set, otherwise
// derived from the service-role key (already secret, already on Vercel).

function secret(): string {
  const explicit = process.env.BOOKING_TOKEN_SECRET;
  if (explicit && !explicit.includes("YOUR_")) return explicit;
  const derived = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (derived && !derived.includes("YOUR_")) return `bk-token:${derived}`;
  // Local dev without secrets: deterministic but obviously not for production.
  return "bk-token:dev-only-secret";
}

export function bookingToken(ref: string): string {
  return createHmac("sha256", secret()).update(ref.trim().toUpperCase()).digest("hex").slice(0, 32);
}

export function verifyBookingToken(ref: string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = Buffer.from(bookingToken(ref));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function bookingUrl(ref: string, locale: "en" | "ar", base?: string): string {
  const origin = (base ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://sama-crm.vercel.app").replace(/\/$/, "");
  return `${origin}/${locale}/booking/${encodeURIComponent(ref)}?token=${bookingToken(ref)}`;
}
