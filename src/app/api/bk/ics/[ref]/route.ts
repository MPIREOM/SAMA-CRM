import { NextResponse, type NextRequest } from "next/server";
import { verifyBookingToken, bookingUrl } from "@/lib/booking-engine/tokens";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { getBookingByRef } from "@/lib/bk/bookings";
import { getPublicSettings } from "@/lib/bk/settings";
import { isLocale, type Locale } from "@/i18n/routing";
import { logger } from "@/lib/logger";
import { buildIcs } from "../build-ics";

// GET /api/bk/ics/[ref]?token=…&locale=en|ar → text/calendar
// Token-gated like the confirmation page; never lists or guesses bookings.

export const dynamic = "force-dynamic";

const REF_RE = /^[A-Z0-9-]{6,24}$/i;

export async function GET(request: NextRequest, { params }: { params: { ref: string } }) {
  const ref = params.ref.trim().toUpperCase();
  const token = request.nextUrl.searchParams.get("token");
  const localeParam = request.nextUrl.searchParams.get("locale");
  const locale: Locale = isLocale(localeParam) ? localeParam : "en";

  if (!REF_RE.test(ref) || !verifyBookingToken(ref, token)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const [booking, settings] = await Promise.all([getBookingByRef(ref), getPublicSettings()]);
    if (!booking || booking.status === "cancelled") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const hotelName = locale === "ar" ? settings.hotel.name_ar : settings.hotel.name_en;
    const roomName = booking.room_type
      ? locale === "ar"
        ? booking.room_type.name_ar
        : booking.room_type.name_en
      : "";
    const address = locale === "ar" ? settings.contact.address_ar : settings.contact.address_en;
    const description = [
      `${locale === "ar" ? "رقم الحجز" : "Booking reference"}: ${booking.ref}`,
      roomName,
      `${formatLongDate(booking.check_in, locale)} → ${formatLongDate(booking.check_out, locale)}`,
      locale === "ar" ? "الدفع في الفندق." : "Pay at the hotel.",
      settings.contact.maps_link,
    ]
      .filter(Boolean)
      .join("\n");

    const ics = buildIcs({
      ref: booking.ref,
      summary: `${hotelName} — ${booking.ref}`,
      description,
      location: `${hotelName}, ${address}`,
      checkIn: booking.check_in,
      checkOut: booking.check_out,
      checkInTime: settings.times.check_in,
      checkOutTime: settings.times.check_out,
      url: bookingUrl(booking.ref, locale),
    });

    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="sama-${booking.ref}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    logger.error("api.bk.ics", "failed to build ics", { ref, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
