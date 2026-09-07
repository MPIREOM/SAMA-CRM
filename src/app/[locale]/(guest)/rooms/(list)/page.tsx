import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale, type Locale } from "@/i18n/routing";
import { getRoomTypes } from "@/lib/bk/catalogue";
import { muscatToday } from "@/lib/booking-engine/dates";
import { AvailabilityWidget } from "@/components/guest/availability-widget";
import { RoomCard } from "@/components/guest/room-card";
import { safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { localizeRoom, n } from "@/components/guest/lib";

// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
export const revalidate = 600;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ locale, path: "/rooms", title: t("roomsTitle"), description: t("roomsDescription"), image: "/images/rooms/chalet/2.jpg" });
}

export default async function RoomsPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, settings, roomTypes] = await Promise.all([getTranslations("rooms"), safePublicSettings(), getRoomTypes()]);
  const rooms = roomTypes.map((rt) => localizeRoom(rt, locale));

  return (
    <>
      <section className="g-container pt-12 sm:pt-16">
        <p className="g-eyebrow">{t("eyebrow")}</p>
        <h1 className="g-h1 mt-3">{t("title")}</h1>
        <p className="g-lead mt-4 max-w-2xl">{t("intro")}</p>
      </section>

      <section className="g-container mt-10">
        <AvailabilityWidget
          today={muscatToday()}
          maxNights={settings.booking.max_nights}
          maxAdvanceDays={settings.booking.max_advance_days}
          checkInTime={settings.times.check_in}
          checkOutTime={settings.times.check_out}
          variant="panel"
        />
      </section>

      <section className="g-container mt-12">
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room, i) => (
            <li key={room.id}>
              <RoomCard room={room} priority={i < 3} className="h-full" />
            </li>
          ))}
        </ul>
        <div className="mt-8 space-y-1 text-sm text-maroon-600">
          <p>{t("taxesNote")}</p>
          <p>{t("extraBedNote", { price: n(settings.booking.extra_bed_omr), age: n(settings.booking.child_free_under) })}</p>
        </div>
      </section>
    </>
  );
}
