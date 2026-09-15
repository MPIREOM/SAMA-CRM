import { asBedType, bedLabel } from "@/lib/booking-engine/beds";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { BookingWithRelations } from "@/lib/bk/bookings";
import type { PublicSettings } from "@/lib/bk/types";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { PriceSummary } from "./price-summary";
import { bookingAddonLines, localizeRoom, n } from "./lib";

// Booking summary card shared by the confirmation and manage pages: a wide
// photo band, then the stay as a hairline list beside the price details.

export async function BookingDetails({ booking, settings, locale }: { booking: BookingWithRelations; settings: PublicSettings; locale: Locale }) {
  const [t, tc] = await Promise.all([getTranslations("confirmation"), getTranslations("common")]);
  const room = booking.room_type ? localizeRoom(booking.room_type, locale) : null;
  const nightly = Array.isArray(booking.nightly_rates)
    ? (booking.nightly_rates as unknown[]).flatMap((x) => {
        if (x && typeof x === "object" && "date" in x && "rate" in x) {
          const o = x as { date: unknown; rate: unknown };
          return typeof o.date === "string" ? [{ date: o.date, rate: Number(o.rate) }] : [];
        }
        return [];
      })
    : [];
  const nights = booking.nights ?? nightly.length;
  const bed = asBedType(booking.bed_preference);

  return (
    <div className="g-card overflow-hidden">
      {room && (
        <div className="g-frame aspect-[16/9] rounded-none sm:aspect-[21/9]">
          <Image src={room.images[0]} alt={room.name} fill sizes="(min-width: 1024px) 896px, 100vw" className="object-cover" />
        </div>
      )}
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <dl className="p-6 sm:p-8">
          <Row label={t("room")} first>
            <span className="g-h4">{room?.name ?? booking.room_type_id}</span>
          </Row>
          {bed && <Row label={t("beds")}>{bedLabel(bed, locale)}</Row>}
          <Row label={t("checkIn")}>
            {formatLongDate(booking.check_in, locale)}
            <span className="g-small block text-xs">{t("fromTime", { time: settings.times.check_in })}</span>
          </Row>
          <Row label={t("checkOut")}>
            {formatLongDate(booking.check_out, locale)}
            <span className="g-small block text-xs">{t("byTime", { time: settings.times.check_out })}</span>
          </Row>
          <Row label={t("nights")}>{tc("nights", { count: nights, n: n(nights) })}</Row>
          <Row label={t("guests")}>
            {tc("adults", { count: booking.adults, n: n(booking.adults) })}
            {booking.children > 0 && <span className="block">{tc("children", { count: booking.children, n: n(booking.children) })}</span>}
          </Row>
          <Row label={t("guest")}>{booking.guest_name}</Row>
          {booking.special_requests && (
            <Row label={t("specialRequests")}>
              <span className="whitespace-pre-line text-ink-soft">{booking.special_requests}</span>
            </Row>
          )}
        </dl>
        <div className="border-t border-ink-line bg-paper-100 p-6 md:border-s md:border-t-0 sm:p-8 md:p-6">
          <h2 className="g-eyebrow">{t("priceDetails")}</h2>
          <div className="mt-5">
            <PriceSummary
              quote={{
                nightly,
                room_subtotal: Number(booking.room_subtotal_omr),
                discount: Number(booking.discount_omr),
                discount_pct: Number(booking.room_subtotal_omr) > 0 ? Math.round((Number(booking.discount_omr) / Number(booking.room_subtotal_omr)) * 100) : 0,
                service_charge: Number(booking.service_charge_omr),
                tourism_fee: Number(booking.tourism_fee_omr),
                vat: Number(booking.vat_omr),
                total: Number(booking.total_omr),
                addons: bookingAddonLines(booking.addons, locale),
                addons_total: Number(booking.addons_omr ?? 0),
              }}
              taxes={settings.taxes}
              locale={locale}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, first, children }: { label: string; first?: boolean; children: React.ReactNode }) {
  return (
    <div className={first ? "grid gap-1.5 pb-4 sm:grid-cols-[8.5rem_1fr] sm:gap-6" : "grid gap-1.5 border-t border-ink-line py-4 sm:grid-cols-[8.5rem_1fr] sm:gap-6"}>
      <dt className="g-eyebrow pt-0.5">{label}</dt>
      <dd className="text-[15px] leading-relaxed text-ink">{children}</dd>
    </div>
  );
}
