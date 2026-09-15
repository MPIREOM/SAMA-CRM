import type { Metadata } from "next";
import Image from "next/image";
import { Fragment } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getRoomTypes } from "@/lib/bk/catalogue";
import { muscatToday } from "@/lib/booking-engine/dates";
import { siteImage } from "@/lib/bk/site-content";
import { cn } from "@/lib/utils";
import { AvailabilityWidget } from "@/components/guest/availability-widget";
import { Reveal } from "@/components/guest/reveal";
import { getSiteContent, safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { formatRate, localizeRoom, n } from "@/components/guest/lib";

// Rendered per request: room data lives in Supabase and must never make a build fail.
export const dynamic = "force-dynamic";

/** Keep an em dash on the line of the word before it ("Sama Suite —" / "City View"). */
const bindDash = (s: string) => s.replace(/ — /g, "\u00A0— ");

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const [t, site] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSiteContent()]);
  return pageMetadata({ locale, path: "/rooms", title: t("roomsTitle"), description: t("roomsDescription"), image: siteImage(site, "rooms_hero") });
}

export default async function RoomsPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, tc, settings, site, roomTypes] = await Promise.all([
    getTranslations("rooms"),
    getTranslations("common"),
    safePublicSettings(),
    getSiteContent(),
    getRoomTypes(),
  ]);
  const rooms = roomTypes.map((rt) => localizeRoom(rt, locale));

  return (
    <div className="g-page">
      {/* Intro ------------------------------------------------------------- */}
      <section className="g-container" aria-labelledby="rooms-title">
        <Reveal className="max-w-2xl">
          <p className="g-eyebrow-gold">{t("eyebrow")}</p>
          <h1 id="rooms-title" className="g-h1 mt-5 [text-wrap:balance]">
            {t("title")}
          </h1>
          <p className="g-lead mt-6">{t("intro")}</p>
        </Reveal>
      </section>

      {/* Photo band with the booking bar resting on its foot ---------------- */}
      <div className="g-container mt-12 sm:mt-16">
        <Reveal className="g-frame aspect-[4/3] sm:aspect-[21/9]">
          <Image src={siteImage(site, "rooms_hero")} alt="" fill priority sizes="(min-width: 84rem) 1248px, 100vw" className="object-cover" />
        </Reveal>
        <Reveal delay={150} className="relative z-10 mx-auto -mt-10 w-[calc(100%-2rem)] rounded-[4px] shadow-float sm:-mt-14 sm:w-[calc(100%-4rem)] lg:-mt-16 lg:w-[calc(100%-6rem)]">
          <AvailabilityWidget
            today={muscatToday()}
            maxNights={settings.booking.max_nights}
            maxAdvanceDays={settings.booking.max_advance_days}
            checkInTime={settings.times.check_in}
            checkOutTime={settings.times.check_out}
            variant="panel"
          />
        </Reveal>
      </div>

      {/* The rooms, one per row ------------------------------------------- */}
      <section className="g-container pb-20 pt-10 sm:pb-28 sm:pt-14" aria-label={t("title")}>
        <ul className="border-b border-ink-line">
          {rooms.map((room, i) => {
            const flip = i % 2 === 1;
            const meta = [
              t("sleepsShort", { a: n(room.maxAdults), c: n(room.maxChildren), adults: room.maxAdults, children: room.maxChildren }),
              room.sizeSqm ? t("sizeSqm", { n: n(room.sizeSqm) }) : null,
              room.view || null,
              room.bed || null,
            ].filter((x): x is string => Boolean(x));
            return (
              <Reveal as="li" key={room.id} className="grid items-center gap-8 border-t border-ink-line py-10 sm:py-14 lg:grid-cols-12 lg:gap-x-14 lg:py-16 xl:gap-x-20">
                <Link
                  href={`/rooms/${room.slug}`}
                  tabIndex={-1}
                  aria-hidden="true"
                  className={cn("g-frame g-zoom block aspect-[3/2] lg:col-span-7", flip && "lg:order-2")}
                >
                  <Image src={room.images[0]} alt="" fill priority={i === 0} sizes="(min-width: 1024px) 58vw, 100vw" className="object-cover" />
                </Link>

                <div className={cn("lg:col-span-5", flip && "lg:order-1")}>
                  <h2 className="g-h2 [text-wrap:balance]">
                    <Link href={`/rooms/${room.slug}`} className="rounded-sm transition-colors duration-300 hover:text-maroon-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
                      {bindDash(room.name)}
                    </Link>
                  </h2>
                  <p className="g-eyebrow mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-ink-line pt-4">
                    {meta.map((m, j) => (
                      <Fragment key={m}>
                        {j > 0 && (
                          <span className="text-gold-500" aria-hidden="true">
                            ·
                          </span>
                        )}
                        <span>{m}</span>
                      </Fragment>
                    ))}
                  </p>
                  {room.tagline && <p className="g-lead mt-5">{room.tagline}</p>}
                  {room.description && <p className="g-body mt-4 line-clamp-3">{room.description}</p>}
                  <p className="mt-7 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className="g-eyebrow">{t("from")}</span>
                    <span className="g-price text-[2rem] leading-none" dir="ltr">
                      {tc("omr")} {formatRate(room.baseRate)}
                    </span>
                    <span className="g-small">/ {t("perNight")}</span>
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-4">
                    <Link href={`/rooms/${room.slug}`} className="g-btn-outline g-btn-sm">
                      {t("viewRoom")}
                      <ArrowRight className="g-btn-arrow" aria-hidden="true" />
                    </Link>
                    <Link href={{ pathname: `/rooms/${room.slug}`, hash: "availability" }} className="g-link">
                      {t("checkDatesShort")}
                    </Link>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </ul>
        <div className="mt-10 max-w-2xl space-y-2 sm:mt-12">
          <p className="g-small">{t("taxesNote")}</p>
          <p className="g-small">{t("extraBedNote", { price: n(settings.booking.extra_bed_omr), age: n(settings.booking.child_free_under) })}</p>
        </div>
      </section>
    </div>
  );
}
