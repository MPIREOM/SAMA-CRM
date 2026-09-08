import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, BedDouble, Eye, Ruler, Users } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getRoomTypeBySlug, getRoomTypes } from "@/lib/bk/catalogue";
import { muscatToday } from "@/lib/booking-engine/dates";
import { AvailabilityWidget } from "@/components/guest/availability-widget";
import { AmenityList } from "@/components/guest/amenity-list";
import { RoomCard } from "@/components/guest/room-card";
import { RoomGallery } from "@/components/guest/room-gallery";
import { StickyCta } from "@/components/guest/sticky-cta";
import { safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { formatRate, localizeRoom, n } from "@/components/guest/lib";

// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
// Rendered per request: room data lives in Supabase and must never make a build fail.
export const dynamic = "force-dynamic";

type Props = { params: { locale: string; slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  // notFound() here (before streaming starts) gives crawlers a real 404 status.
  const rt = await getRoomTypeBySlug(params.slug);
  if (!rt) notFound();
  const room = localizeRoom(rt, locale);
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({
    locale,
    path: `/rooms/${room.slug}`,
    title: room.name,
    description: t("roomDescription", { name: room.name, tagline: room.tagline, price: formatRate(room.baseRate) }),
    image: room.images[0],
  });
}

export default async function RoomPage({ params }: Props) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [rt, allTypes, settings, t, tc] = await Promise.all([
    getRoomTypeBySlug(params.slug),
    getRoomTypes(),
    safePublicSettings(),
    getTranslations("rooms"),
    getTranslations("common"),
  ]);
  if (!rt) notFound();
  const room = localizeRoom(rt, locale);
  const others = allTypes.filter((x) => x.slug !== room.slug).slice(0, 3).map((x) => localizeRoom(x, locale));

  const facts = [
    { Icon: Eye, label: t("view"), value: room.view },
    { Icon: BedDouble, label: t("bed"), value: room.bed },
    { Icon: Ruler, label: t("size"), value: room.sizeSqm ? t("sizeSqm", { n: n(room.sizeSqm) }) : "" },
    { Icon: Users, label: t("capacity"), value: t("sleepsShort", { a: n(room.maxAdults), c: n(room.maxChildren) }) },
  ].filter((f) => f.value);

  return (
    <>
      <section className="g-container pt-8 sm:pt-12">
        <Link href="/rooms" className="g-link inline-flex items-center gap-1.5 text-sm no-underline hover:underline">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {t("backToRooms")}
        </Link>
        <div className="mt-6 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
          <div>
            <RoomGallery images={room.images} name={room.name} />

            <div className="mt-8">
              <p className="g-eyebrow">{t("eyebrow")}</p>
              <h1 className="g-h1 mt-3 text-3xl sm:text-4xl lg:text-5xl">{room.name}</h1>
              {room.tagline && <p className="g-lead mt-3">{room.tagline}</p>}
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {facts.map(({ Icon, label, value }) => (
                <div key={label} className="rounded-2xl border border-stone-200 bg-white p-4">
                  <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">
                    <Icon className="h-4 w-4 text-gold-700" aria-hidden="true" />
                    {label}
                  </dt>
                  <dd className="mt-2 text-sm font-semibold text-maroon-900">{value}</dd>
                </div>
              ))}
            </dl>

            {room.description && <p className="g-prose mt-8 max-w-3xl text-base leading-relaxed text-maroon-800">{room.description}</p>}

            {room.amenities.length > 0 && (
              <section className="mt-10" aria-labelledby="room-amenities">
                <h2 id="room-amenities" className="g-h3">
                  {t("amenitiesTitle")}
                </h2>
                <div className="mt-5">
                  <AmenityList amenities={room.amenities} columns={3} />
                </div>
              </section>
            )}

            <p className="mt-8 text-sm text-maroon-600">
              {t("extraBedNote", { price: n(settings.booking.extra_bed_omr), age: n(settings.booking.child_free_under) })}
            </p>
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="g-card p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("from")}</p>
              <p dir="ltr" className="mt-1 text-4xl font-extrabold tabular-nums text-maroon-900">
                <span className="text-base font-bold text-gold-700">{tc("omr")}</span> {formatRate(room.baseRate)}
                <span className="ms-2 text-base font-semibold text-maroon-600">/ {t("perNight")}</span>
              </p>
              <p className="mt-2 text-xs text-maroon-600">{t("taxesNote")}</p>
            </div>
            <div className="mt-4">
              <AvailabilityWidget
                today={muscatToday()}
                maxNights={settings.booking.max_nights}
                maxAdvanceDays={settings.booking.max_advance_days}
                checkInTime={settings.times.check_in}
                checkOutTime={settings.times.check_out}
                roomSlug={room.slug}
                roomName={room.name}
                variant="panel"
              />
            </div>
          </aside>
        </div>
      </section>

      {others.length > 0 && (
        <section className="g-container mt-20" aria-labelledby="other-rooms">
          <h2 id="other-rooms" className="g-h2">
            {t("otherRooms")}
          </h2>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {others.map((r) => (
              <li key={r.id}>
                <RoomCard room={r} className="h-full" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="h-20 md:hidden" aria-hidden="true" />
      <StickyCta label={t("checkDates")} />
    </>
  );
}
