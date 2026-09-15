import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getAddons, getRoomTypes } from "@/lib/bk/catalogue";
import { muscatToday } from "@/lib/booking-engine/dates";
import { logger } from "@/lib/logger";
import { siteCopy, siteImage, siteSectionShown } from "@/lib/bk/site-content";
import { AvailabilityWidget } from "@/components/guest/availability-widget";
import { Reveal } from "@/components/guest/reveal";
import { RoomCard } from "@/components/guest/room-card";
import { StickyCta } from "@/components/guest/sticky-cta";
import { JsonLd } from "@/components/guest/json-ld";
import { getSiteContent, safePublicSettings, siteUrl } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { APEX_SLUG, TRANSFER_UP_SLUG, addonUnitKey, formatRate, localizeAddon, localizeRoom, prettyPhone, telLink, waLink, type LocalizedAddon } from "@/components/guest/lib";
import type { BkRoomType } from "@/lib/database.types";

// Rendered per request: room data lives in Supabase and must never make a build fail.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const [t, site] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSiteContent()]);
  return pageMetadata({ locale, path: "/", title: t("homeTitle"), description: t("siteDescription"), image: siteImage(site, "og_image") });
}

const FACILITIES = [
  { key: "pool", slot: "home_facility_pool" },
  { key: "restaurant", slot: "home_facility_restaurant" },
  { key: "kids", slot: "home_facility_kids" },
  { key: "gym", slot: "home_facility_gym" },
  { key: "peak", slot: "home_facility_peak" },
  { key: "majlis", slot: "home_facility_majlis" },
] as const;

export default async function HomePage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, tRooms, tMeta, tc, ta, settings, site] = await Promise.all([
    getTranslations("home"),
    getTranslations("rooms"),
    getTranslations("meta"),
    getTranslations("common"),
    getTranslations("addons"),
    safePublicSettings(),
    getSiteContent(),
  ]);

  // Room teasers degrade gracefully: the phone number is on the page anyway.
  let roomTypes: BkRoomType[] | null = null;
  try {
    roomTypes = await getRoomTypes();
  } catch (err) {
    logger.warn("guest.home", "room types unavailable", { error: err instanceof Error ? err.message : String(err) });
  }
  const rooms = roomTypes?.map((rt) => localizeRoom(rt, locale)) ?? null;

  // Add-on teasers (APEX Zipline, 4WD transfer) — prices from the catalogue, never hard-coded.
  let apex: LocalizedAddon | null = null;
  let transfer: LocalizedAddon | null = null;
  try {
    const addons = (await getAddons()).map((a) => localizeAddon(a, locale));
    apex = addons.find((a) => a.slug === APEX_SLUG) ?? null;
    transfer = addons.find((a) => a.slug === TRANSFER_UP_SLUG) ?? null;
  } catch (err) {
    logger.warn("guest.home", "add-ons unavailable", { error: err instanceof Error ? err.message : String(err) });
  }
  const priceTag = (a: LocalizedAddon | null) =>
    a ? `${tc("omrAmount", { amount: formatRate(a.price) })} ${ta(`unit.${addonUnitKey(a.unit, a.kind)}`)}` : null;
  const addonCards = [
    {
      key: "apex",
      href: { pathname: "/apex-zipline" } as const,
      src: apex?.image ?? "/images/addons/apex-zipline.jpg",
      title: apex?.name ?? ta("apexCardTitle"),
      body: apex?.tagline || ta("apexCardBody"),
      price: priceTag(apex),
      cta: ta("apexCardCta"),
    },
    {
      key: "transfer",
      href: { pathname: "/policies", hash: "transfers" } as const,
      src: transfer?.image ?? "/images/addons/transfer.jpg",
      title: ta("transferCardTitle"),
      body: transfer?.tagline || ta("transferCardBody"),
      price: priceTag(transfer),
      cta: ta("transferCardCta"),
    },
  ];

  const today = muscatToday();
  const { contact, hotel, times } = settings;
  const rates = rooms?.map((r) => r.baseRate) ?? [];
  const priceRange = rates.length ? `OMR ${Math.min(...rates)}–${Math.max(...rates)}` : "OMR 50–115";

  // Owner overrides from /website, else the built-in translation.
  const copy = (key: Parameters<typeof siteCopy>[1], fallback: string) => siteCopy(site, key, locale) ?? fallback;
  const show = (key: Parameters<typeof siteSectionShown>[1]) => siteSectionShown(site, key);

  const experiences = [
    { key: "peak", slot: "home_experience_peak", href: { pathname: "/the-peak" } as const, tall: false },
    { key: "pool", slot: "home_experience_pool", href: { pathname: "/rooms" } as const, tall: true },
    { key: "terraces", slot: "home_experience_terraces", href: { pathname: "/contact" } as const, tall: false },
  ] as const;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["Hotel", "LodgingBusiness"],
    name: locale === "ar" ? hotel.name_ar : hotel.name_en,
    description: tMeta("siteDescription"),
    url: `${siteUrl()}/${locale}`,
    image: `${siteUrl()}${siteImage(site, "og_image")}`,
    telephone: contact.phone,
    email: contact.email,
    priceRange,
    currenciesAccepted: "OMR",
    paymentAccepted: "Cash, Credit Card",
    checkinTime: times.check_in,
    checkoutTime: times.check_out,
    starRating: { "@type": "Rating", ratingValue: String(hotel.star_rating) },
    numberOfRooms: hotel.units,
    address: {
      "@type": "PostalAddress",
      streetAddress: "Sayq",
      addressLocality: "Jabal Al Akhdar",
      addressRegion: "Ad Dakhiliyah",
      addressCountry: "OM",
    },
    geo: { "@type": "GeoCoordinates", latitude: 23.0722, longitude: 57.6665 },
    hasMap: contact.maps_link,
    amenityFeature: [
      "Outdoor swimming pool",
      "Jacuzzi",
      "Restaurant",
      "Coffee shop",
      "Free Wi-Fi",
      "Fitness centre",
      "Children's playground",
      "Free parking",
    ].map((name) => ({ "@type": "LocationFeatureSpecification", name, value: true })),
    availableLanguage: ["en", "ar"],
  };

  return (
    <>
      <JsonLd data={jsonLd} />

      {/* Hero ------------------------------------------------------------- */}
      <section className="relative isolate" data-hero>
        <div className="relative h-[100svh] min-h-[600px] w-full overflow-hidden lg:max-h-[960px]">
          <Image
            src={siteImage(site, "home_hero")}
            alt={t("heroImageAlt")}
            fill
            priority
            sizes="100vw"
            className="g-kenburns object-cover object-[center_65%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-ink/25" aria-hidden="true" />
          <div className="g-container relative flex h-full flex-col justify-end pb-44 sm:pb-40 lg:pb-36">
            <p className="g-eyebrow g-fade-up text-gold-300" style={{ "--g-delay": "200ms" } as React.CSSProperties}>
              {copy("hero_eyebrow", t("heroEyebrow"))}
            </p>
            <h1
              className="g-h1 g-fade-up mt-5 max-w-4xl text-paper [text-wrap:balance]"
              style={{ "--g-delay": "350ms" } as React.CSSProperties}
            >
              {copy("hero_title", t("heroTitle"))}
            </h1>
            <p className="g-fade-up mt-6 max-w-xl text-base leading-relaxed text-paper/80 sm:text-lg" style={{ "--g-delay": "550ms" } as React.CSSProperties}>
              {copy("hero_subtitle", t("heroSubtitle"))}
            </p>
          </div>
        </div>
        <div className="g-container relative z-10 -mt-[7.5rem] sm:-mt-28 lg:-mt-24">
          <Reveal delay={600}>
            <AvailabilityWidget
              today={today}
              maxNights={settings.booking.max_nights}
              maxAdvanceDays={settings.booking.max_advance_days}
              checkInTime={times.check_in}
              checkOutTime={times.check_out}
            />
          </Reveal>
        </div>
      </section>

      {/* Welcome ----------------------------------------------------------- */}
      {show("welcome") && (
        <section className="g-container g-section grid items-center gap-12 lg:grid-cols-[1fr_1.05fr] lg:gap-20" aria-labelledby="home-welcome">
          <Reveal>
            <p className="g-eyebrow-gold">{copy("welcome_eyebrow", t("welcomeEyebrow"))}</p>
            <h2 id="home-welcome" className="g-h2 mt-5 max-w-xl [text-wrap:balance]">
              {copy("welcome_title", t("welcomeTitle"))}
            </h2>
            <p className="g-body mt-7 max-w-lg">{copy("welcome_body", t("welcomeBody"))}</p>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-ink-line pt-6">
              {[
                { value: `${hotel.altitude_m.toLocaleString("en-GB")} m`, label: t("welcomeFacts.altitude") },
                { value: `${hotel.drive_from_muscat_h} h`, label: t("welcomeFacts.drive") },
                { value: "10–15 °C", label: t("welcomeFacts.cooler") },
              ].map((f) => (
                <div key={f.label}>
                  <dt className="g-price text-2xl sm:text-3xl" dir="ltr">
                    {f.value}
                  </dt>
                  <dd className="g-small mt-1">{f.label}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
          <div className="relative">
            <Reveal className="g-frame g-zoom aspect-[3/4] w-[82%] ms-auto">
              <Image src={siteImage(site, "home_welcome_1")} alt="" fill sizes="(min-width: 1024px) 520px, 82vw" className="object-cover" />
            </Reveal>
            <Reveal delay={200} className="g-frame g-zoom absolute -bottom-8 start-0 aspect-square w-[44%] shadow-float sm:-bottom-12">
              <Image src={siteImage(site, "home_welcome_2")} alt="" fill sizes="(min-width: 1024px) 280px, 44vw" className="object-cover" />
            </Reveal>
          </div>
        </section>
      )}

      {/* Rooms ------------------------------------------------------------- */}
      <section className={show("welcome") ? "g-container pb-24 pt-8 sm:pb-32 sm:pt-12" : "g-container g-section"} aria-labelledby="home-rooms">
        <Reveal className="flex flex-wrap items-end justify-between gap-6 border-t border-ink-line pt-10">
          <div className="max-w-2xl">
            <p className="g-eyebrow-gold">{t("roomsEyebrow")}</p>
            <h2 id="home-rooms" className="g-h2 mt-4">
              {t("roomsTitle")}
            </h2>
            <p className="g-body mt-5">{t("roomsIntro")}</p>
          </div>
          <Link href="/rooms" className="g-link">
            {t("viewAllRooms")}
            <ArrowRight className="g-arrow h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Reveal>
        {rooms ? (
          <ul className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room, i) => (
              <Reveal as="li" key={room.id} delay={(i % 3) * 120}>
                <RoomCard room={room} priority={i < 3} className="h-full" />
              </Reveal>
            ))}
          </ul>
        ) : (
          <div className="g-note mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p>{t("roomsUnavailable")}</p>
            <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="g-btn-primary g-btn-sm">
              {tc("whatsapp")}
            </a>
          </div>
        )}
        <p className="g-small mt-10">{tRooms("taxesNote")}</p>
      </section>

      {/* Experiences ------------------------------------------------------- */}
      {show("experiences") && (
        <section className="bg-paper-200" aria-labelledby="home-experiences">
          <div className="g-container g-section">
            <Reveal className="max-w-2xl">
              <p className="g-eyebrow-gold">{t("experiencesEyebrow")}</p>
              <h2 id="home-experiences" className="g-h2 mt-4">
                {t("experiencesTitle")}
              </h2>
            </Reveal>
            <ul className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8 lg:gap-12">
              {experiences.map((x, i) => (
                <Reveal as="li" key={x.key} delay={i * 140} className={x.tall ? "md:pt-16" : undefined}>
                  <Link href={x.href} className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2 rounded-[4px]">
                    <div className={`g-frame g-zoom ${x.tall ? "aspect-[3/4]" : "aspect-[4/3]"}`}>
                      <Image src={siteImage(site, x.slot)} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover" />
                    </div>
                    <h3 className="g-h3 mt-6">{t(`experiences.${x.key}.title`)}</h3>
                    <p className="g-body mt-3">{t(`experiences.${x.key}.body`)}</p>
                    <span className="g-link mt-5">
                      {t(`experiences.${x.key}.cta`)}
                      <ArrowRight className="g-arrow h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Facilities -------------------------------------------------------- */}
      {show("facilities") && (
        <section className="g-section" aria-labelledby="home-facilities">
          <Reveal className="g-container flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="g-eyebrow-gold">{t("facilitiesEyebrow")}</p>
              <h2 id="home-facilities" className="g-h2 mt-4">
                {t("facilitiesTitle")}
              </h2>
            </div>
          </Reveal>
          {/* Scrolls sideways below lg, so the list itself takes focus (arrow keys scroll it) and is named by the heading. */}
          <ul
            tabIndex={0}
            aria-labelledby="home-facilities"
            className="g-focus g-container mt-12 flex snap-x snap-mandatory gap-5 overflow-x-auto pb-4 scrollbar-none lg:grid lg:grid-cols-6 lg:overflow-visible"
          >
            {FACILITIES.map(({ key, slot }, i) => (
              <Reveal as="li" key={key} delay={i * 80} className="w-[68vw] shrink-0 snap-start sm:w-[40vw] lg:w-auto" style={{ "--g-rise": "12px" } as React.CSSProperties}>
                <figure>
                  <div className="g-frame g-zoom aspect-[4/3]">
                    {/* The figcaption carries the name — an identical alt would be read twice. */}
                    <Image src={siteImage(site, slot)} alt="" fill sizes="(min-width: 1024px) 200px, 68vw" className="object-cover" />
                  </div>
                  <figcaption className="g-eyebrow mt-4 text-ink">{t(`facilities.${key}`)}</figcaption>
                </figure>
              </Reveal>
            ))}
          </ul>
        </section>
      )}

      {/* Add to your stay -------------------------------------------------- */}
      {show("addons") && (
        <section className="g-container border-t border-ink-line g-section" aria-labelledby="home-addons">
          <Reveal className="max-w-2xl">
            <p className="g-eyebrow-gold">{ta("homeEyebrow")}</p>
            <h2 id="home-addons" className="g-h2 mt-4">
              {ta("homeTitle")}
            </h2>
            <p className="g-body mt-5">{ta("homeIntro")}</p>
          </Reveal>
          <ul className="mt-12 grid gap-10 md:grid-cols-2 md:gap-8">
            {addonCards.map((card, i) => (
              <Reveal as="li" key={card.key} delay={i * 140} className="group flex flex-col">
                <Link href={card.href} className="g-frame g-zoom block aspect-[16/10] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2" tabIndex={-1} aria-hidden="true">
                  <Image src={card.src} alt="" fill sizes="(min-width: 768px) 50vw, 100vw" className="object-cover" />
                </Link>
                <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pt-6">
                  <h3 className="g-h3">{card.title}</h3>
                  {card.price && (
                    <p className="g-price text-lg" dir="ltr">
                      {card.price}
                    </p>
                  )}
                </div>
                <p className="g-body mt-3">{card.body}</p>
                <Link href={card.href} className="g-link mt-5">
                  {card.cta}
                  <ArrowRight className="g-arrow h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </Reveal>
            ))}
          </ul>
          <p className="g-small mt-10">{ta("homeFootnote")}</p>
        </section>
      )}

      {/* Location ---------------------------------------------------------- */}
      {show("location") && (
        <section className="bg-paper-200" aria-labelledby="home-location">
          <div className="g-container g-section grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <Reveal className="g-frame g-zoom aspect-[4/3] lg:order-2">
              <Image src={siteImage(site, "home_location")} alt="" fill sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />
            </Reveal>
            <Reveal className="lg:order-1">
              <p className="g-eyebrow-gold">{t("locationEyebrow")}</p>
              <h2 id="home-location" className="g-h2 mt-4">
                {t("locationTitle")}
              </h2>
              <p className="g-body mt-6 max-w-lg">{t("locationBody")}</p>
              <div className="mt-8 max-w-lg border-s-2 border-gold-500 ps-5">
                <h3 className="font-semibold text-ink">{t("fourWdTitle")}</h3>
                <p className="g-body mt-2">{t("fourWdBody")}</p>
                {/* The priced transfer line only when the add-on cards above are hidden — otherwise it would be said twice on one page. */}
                {!show("addons") && (
                  <p className="g-body mt-2">
                    {transfer ? ta("transferTeaserPriced", { price: tc("omrAmount", { amount: formatRate(transfer.price) }) }) : ta("transferTeaser")}{" "}
                    <Link href={{ pathname: "/policies", hash: "transfers" }} className="g-inline">
                      {ta("transferTeaserLink")}
                    </Link>
                  </p>
                )}
                <p className="g-small mt-2">{t("fuelTip")}</p>
              </div>
              <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
                <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="g-btn-outline g-btn-sm">
                  {t("openMaps")}
                  <ArrowUpRight className="g-arrow-ext h-3.5 w-3.5" aria-hidden="true" />
                </a>
                <a href={telLink(contact.phone)} className="g-link" dir="ltr">
                  {prettyPhone(contact.phone)}
                </a>
              </div>
            </Reveal>
          </div>
        </section>
      )}

      {/* Pay at hotel ------------------------------------------------------ */}
      <section className="g-container g-section">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="g-rule mx-auto" aria-hidden="true" />
          <h2 className="g-h3 mt-6">{t("payAtHotelTitle")}</h2>
          <p className="g-body mt-4">{t("payAtHotelBody")}</p>
        </Reveal>
      </section>

      {/* Closing photo band ------------------------------------------------ */}
      {show("closing") && (
        <section className="relative isolate" aria-labelledby="home-closing">
          <div className="relative h-[70svh] min-h-[440px] w-full overflow-hidden">
            <Image src={siteImage(site, "home_closing")} alt="" fill sizes="100vw" className="object-cover" />
            <div className="absolute inset-0 bg-ink/45" aria-hidden="true" />
            <Reveal className="g-container relative flex h-full flex-col items-center justify-center text-center">
              <h2 id="home-closing" className="g-h2 text-paper">
                {copy("closing_title", t("closingTitle"))}
              </h2>
              <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-light mt-8">
                {t("closingCta")}
              </Link>
            </Reveal>
          </div>
        </section>
      )}

      <div className="h-20 md:hidden" aria-hidden="true" />
      <StickyCta />
    </>
  );
}
