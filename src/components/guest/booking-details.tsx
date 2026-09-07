import Image from "next/image";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import type { BookingWithRelations } from "@/lib/bk/bookings";
import type { PublicSettings } from "@/lib/bk/types";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { PriceSummary } from "./price-summary";
import { localizeRoom, n } from "./lib";

// Booking summary card shared by the confirmation and manage pages.

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

  return (
    <div className="g-card overflow-hidden">
      {room && (
        <div className="relative aspect-[16/7] bg-stone-100">
          <Image src={room.images[0]} alt={room.name} fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" />
        </div>
      )}
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("room")}</dt>
            <dd className="mt-1 text-base font-bold text-maroon-900">{room?.name ?? booking.room_type_id}</dd>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("checkIn")}</dt>
              <dd className="mt-1 font-bold text-maroon-900">{formatLongDate(booking.check_in, locale)}</dd>
              <dd className="text-xs text-maroon-600">{t("fromTime", { time: settings.times.check_in })}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("checkOut")}</dt>
              <dd className="mt-1 font-bold text-maroon-900">{formatLongDate(booking.check_out, locale)}</dd>
              <dd className="text-xs text-maroon-600">{t("byTime", { time: settings.times.check_out })}</dd>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("nights")}</dt>
              <dd className="mt-1 font-bold text-maroon-900">{tc("nights", { count: nights, n: n(nights) })}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("guests")}</dt>
              <dd className="mt-1 font-bold text-maroon-900">
                {tc("adults", { count: booking.adults, n: n(booking.adults) })}
                {booking.children > 0 && <span className="block">{tc("children", { count: booking.children, n: n(booking.children) })}</span>}
              </dd>
            </div>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("guest")}</dt>
            <dd className="mt-1 font-bold text-maroon-900">{booking.guest_name}</dd>
          </div>
          {booking.special_requests && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("specialRequests")}</dt>
              <dd className="mt-1 whitespace-pre-line text-maroon-800">{booking.special_requests}</dd>
            </div>
          )}
        </dl>
        <div className="rounded-2xl bg-stone-50 p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("priceDetails")}</h2>
          <div className="mt-3">
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
