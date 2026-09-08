import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Car, Coffee, Flower2, MapPin, Mountain, Sparkles, Waves, Wallet } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getAddons, getRoomTypes } from "@/lib/bk/catalogue";
import { muscatToday } from "@/lib/booking-engine/dates";
import { logger } from "@/lib/logger";
import { AvailabilityWidget } from "@/components/guest/availability-widget";
import { RoomCard } from "@/components/guest/room-card";
import { StickyCta } from "@/components/guest/sticky-cta";
import { JsonLd } from "@/components/guest/json-ld";
import { safePublicSettings, siteUrl } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { APEX_SLUG, TRANSFER_UP_SLUG, addonUnitKey, formatRate, localizeAddon, localizeRoom, prettyPhone, telLink, waLink, type LocalizedAddon } from "@/components/guest/lib";
import type { BkRoomType } from "@/lib/database.types";

// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
// Rendered per request: room data lives in Supabase and must never make a build fail.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ locale, path: "/", title: t("homeTitle"), description: t("siteDescription") });
}

const FACILITIES = [
  { key: "pool", src: "/images/hotel/pool-wide.jpg" },
  { key: "restaurant", src: "/images/hotel/restaurant-new.jpg" },
  { key: "kids", src: "/images/hotel/kids-park-new.jpg" },
  { key: "gym", src: "/images/hotel/gym.jpg" },
  { key: "peak", src: "/images/hotel/peak-4.jpg" },
  { key: "majlis", src: "/images/hotel/majlis.jpg" },
] as const;

const HIGHLIGHTS = [
  { key: "altitude", Icon: Mountain },
  { key: "peak", Icon: Coffee },
  { key: "season", Icon: Flower2 },
  { key: "cool", Icon: Sparkles },
  { key: "pool", Icon: Waves },
] as const;

export default async function HomePage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, tRooms, tMeta, tc, ta, settings] = await Promise.all([
    getTranslations("home"),
    getTranslations("rooms"),
    getTranslations("meta"),
    getTranslations("common"),
    getTranslations("addons"),
    safePublicSettings(),
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

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["Hotel", "LodgingBusiness"],
    name: locale === "ar" ? hotel.name_ar : hotel.name_en,
    description: tMeta("siteDescription"),
    url: `${siteUrl()}/${locale}`,
    image: `${siteUrl()}/images/og.jpg`,
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
      <section className="relative isolate">
        <div className="relative h-[68svh] min-h-[520px] w-full sm:h-[72svh] lg:h-[78svh] lg:max-h-[860px]">
          <Image
            src="/images/hotel/canyon-view.jpg"
            alt={t("heroImageAlt")}
            fill
            priority
            sizes="100vw"
            className="object-cover object-[center_60%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-950/80 via-maroon-950/30 to-maroon-950/20" aria-hidden="true" />
          <div className="g-container relative flex h-full flex-col justify-end pb-40 sm:pb-36 lg:pb-32">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-gold-300 rtl:text-base rtl:tracking-normal">{t("heroEyebrow")}</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl rtl:tracking-normal rtl:leading-[1.25]">
              {t("heroTitle")}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-stone-100/90 sm:text-lg">{t("heroSubtitle")}</p>
          </div>
        </div>
        <div className="g-container relative z-10 -mt-32 sm:-mt-28 lg:-mt-24">
          <AvailabilityWidget
            today={today}
            maxNights={settings.booking.max_nights}
            maxAdvanceDays={settings.booking.max_advance_days}
            checkInTime={times.check_in}
            checkOutTime={times.check_out}
          />
        </div>
      </section>

      {/* Highlights -------------------------------------------------------- */}
      <section className="g-container pt-20 sm:pt-24">
        <p className="g-eyebrow">{t("highlightsEyebrow")}</p>
        <h2 className="g-h2 mt-3 max-w-2xl">{t("highlightsTitle")}</h2>
        <ul className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-x-6">
          {HIGHLIGHTS.map(({ key, Icon }) => (
            <li key={key} className="flex gap-4 lg:flex-col lg:gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold-100 text-gold-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-maroon-900">{t(`highlights.${key}.title`)}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-maroon-700">{t(`highlights.${key}.body`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Rooms ------------------------------------------------------------- */}
      <section className="g-container pt-20 sm:pt-24" aria-labelledby="home-rooms">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="g-eyebrow">{t("roomsEyebrow")}</p>
            <h2 id="home-rooms" className="g-h2 mt-3">
              {t("roomsTitle")}
            </h2>
            <p className="g-lead mt-3 max-w-2xl">{t("roomsIntro")}</p>
          </div>
          <Link href="/rooms" className="g-btn-outline g-btn-sm">
            {t("viewAllRooms")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
        {rooms ? (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.map((room, i) => (
              <li key={room.id}>
                <RoomCard room={room} priority={i < 3} className="h-full" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="g-card mt-10 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-maroon-800">{t("roomsUnavailable")}</p>
            <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="g-btn-primary g-btn-sm">
              {tc("whatsapp")}
            </a>
          </div>
        )}
        <p className="mt-6 text-sm text-maroon-600">{tRooms("taxesNote")}</p>
      </section>

      {/* Facilities -------------------------------------------------------- */}
      <section className="pt-20 sm:pt-24" aria-labelledby="home-facilities">
        <div className="g-container">
          <p className="g-eyebrow">{t("facilitiesEyebrow")}</p>
          <h2 id="home-facilities" className="g-h2 mt-3">
            {t("facilitiesTitle")}
          </h2>
        </div>
        <ul className="g-container mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 scrollbar-thin lg:grid lg:grid-cols-6 lg:overflow-visible">
          {FACILITIES.map(({ key, src }) => (
            <li key={key} className="w-[72vw] shrink-0 snap-start sm:w-[44vw] lg:w-auto">
              <figure>
                <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-stone-100">
                  {/* The figcaption carries the name — an identical alt would be read twice. */}
                  <Image src={src} alt="" fill sizes="(min-width: 1024px) 190px, 72vw" className="object-cover" />
                </div>
                <figcaption className="mt-3 text-sm font-bold text-maroon-800">{t(`facilities.${key}`)}</figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>

      {/* Add to your stay -------------------------------------------------- */}
      <section className="g-container pt-20 sm:pt-24" aria-labelledby="home-addons">
        <p className="g-eyebrow">{ta("homeEyebrow")}</p>
        <h2 id="home-addons" className="g-h2 mt-3">
          {ta("homeTitle")}
        </h2>
        <p className="g-lead mt-3 max-w-2xl">{ta("homeIntro")}</p>
        <ul className="mt-10 grid gap-6 md:grid-cols-2">
          {addonCards.map((card) => (
            <li key={card.key} className="g-card flex flex-col overflow-hidden sm:flex-row">
              <div className="relative aspect-[16/10] bg-stone-100 sm:aspect-auto sm:w-2/5 sm:shrink-0">
                <Image src={card.src} alt="" fill sizes="(min-width: 1024px) 240px, (min-width: 640px) 40vw, 100vw" className="object-cover" />
              </div>
              <div className="flex flex-1 flex-col p-5 sm:p-6">
                <h3 className="text-lg font-extrabold text-maroon-900">{card.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-maroon-700">{card.body}</p>
                {card.price && (
                  <p className="mt-3 text-sm font-bold text-maroon-800 tabular-nums" dir="ltr">
                    {card.price}
                  </p>
                )}
                <Link href={card.href} className="g-link mt-auto inline-flex items-center gap-1.5 pt-4 text-sm no-underline hover:underline">
                  {card.cta}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-maroon-600">{ta("homeFootnote")}</p>
      </section>

      {/* Location ---------------------------------------------------------- */}
      <section className="g-container grid items-center gap-10 pt-20 sm:pt-24 lg:grid-cols-2 lg:gap-16" aria-labelledby="home-location">
        <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-stone-100 lg:order-2">
          <Image src="/images/hotel/aerial-canyon-pool.jpg" alt="" fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
        </div>
        <div className="lg:order-1">
          <p className="g-eyebrow">{t("locationEyebrow")}</p>
          <h2 id="home-location" className="g-h2 mt-3">
            {t("locationTitle")}
          </h2>
          <p className="g-lead mt-4">{t("locationBody")}</p>
          <div className="mt-6 rounded-2xl border border-gold-300 bg-gold-50 p-5">
            <div className="flex items-start gap-3">
              <Car className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
              <div>
                <h3 className="font-extrabold text-maroon-900">{t("fourWdTitle")}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-maroon-800">{t("fourWdBody")}</p>
                <p className="mt-2 text-sm leading-relaxed text-maroon-800">
                  {transfer ? ta("transferTeaserPriced", { price: tc("omrAmount", { amount: formatRate(transfer.price) }) }) : ta("transferTeaser")}{" "}
                  <Link href={{ pathname: "/policies", hash: "transfers" }} className="g-link">
                    {ta("transferTeaserLink")}
                  </Link>
                </p>
                <p className="mt-2 text-sm leading-relaxed text-maroon-700">{t("fuelTip")}</p>
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="g-btn-primary g-btn-sm">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {t("openMaps")}
            </a>
            <a href={telLink(contact.phone)} className="g-btn-outline g-btn-sm" dir="ltr">
              {prettyPhone(contact.phone)}
            </a>
          </div>
        </div>
      </section>

      {/* Pay at hotel ------------------------------------------------------ */}
      <section className="g-container pt-20 sm:pt-24">
        <div className="flex flex-col gap-5 rounded-3xl bg-maroon-900 p-8 text-gold-100 sm:flex-row sm:items-center sm:gap-8 sm:p-10">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gold-500 text-maroon-950">
            <Wallet className="h-7 w-7" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-2xl font-extrabold text-gold-200">{t("payAtHotelTitle")}</h2>
            <p className="mt-2 max-w-2xl leading-relaxed text-gold-100/85">{t("payAtHotelBody")}</p>
          </div>
        </div>
      </section>

      <div className="h-20 md:hidden" aria-hidden="true" />
      <StickyCta />
    </>
  );
}
