import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getRoomTypeBySlug, getRoomTypes } from "@/lib/bk/catalogue";
import { muscatToday } from "@/lib/booking-engine/dates";
import { AvailabilityWidget } from "@/components/guest/availability-widget";
import { AmenityList } from "@/components/guest/amenity-list";
import { Reveal } from "@/components/guest/reveal";
import { RoomCard } from "@/components/guest/room-card";
import { RoomGallery } from "@/components/guest/room-gallery";
import { StickyCta } from "@/components/guest/sticky-cta";
import { safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { formatRate, localizeRoom, n } from "@/components/guest/lib";

// Rendered per request: room data lives in Supabase and must never make a build fail.
export const dynamic = "force-dynamic";

type Props = { params: { locale: string; slug: string } };

/** Keep an em dash on the line of the word before it ("Sama Suite —" / "City View"). */
const bindDash = (s: string) => s.replace(/ — /g, " — ");

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

  // One hairline strip of facts: View / Beds / Size / Sleeps.
  const facts = [
    { key: "view", label: t("view"), value: room.view },
    { key: "bed", label: t("bed"), value: room.bed },
    { key: "size", label: t("size"), value: room.sizeSqm ? t("sizeSqm", { n: n(room.sizeSqm) }) : "" },
    { key: "capacity", label: t("capacity"), value: t("sleepsShort", { a: n(room.maxAdults), c: n(room.maxChildren), adults: room.maxAdults, children: room.maxChildren }) },
  ].filter((f) => f.value);
  const paragraphs = room.description.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const price = `${tc("omr")} ${formatRate(room.baseRate)}`;
  const extraBed = t("extraBedNote", { price: n(settings.booking.extra_bed_omr), age: n(settings.booking.child_free_under) });

  return (
    <div className="g-page">
      <div className="g-container">
        <Link href="/rooms" className="g-link">
          <ArrowLeft className="g-arrow-back h-3.5 w-3.5" aria-hidden="true" />
          {t("backToRooms")}
        </Link>

        <div className="mt-8 sm:mt-10">
          <RoomGallery images={room.images} name={room.name} />
        </div>

        {/* Story on the left; the price stays in view on the right. The
            booking form is a full-width band further down: its five-column
            desktop layout needs more room than a sidebar can give. */}
        <div className="mt-12 grid gap-12 lg:mt-16 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
          <div>
            <p className="g-eyebrow-gold">{t("eyebrow")}</p>
            <h1 className="g-h1 mt-5 [text-wrap:balance]">{bindDash(room.name)}</h1>
            {room.tagline && <p className="g-lead mt-6 max-w-2xl">{room.tagline}</p>}
            {/* Phones and tablets: the price sits with the name; desktop shows the card instead. */}
            <p className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 lg:hidden">
              <span className="g-eyebrow">{t("from")}</span>
              <span className="g-price text-[2rem] leading-none" dir="ltr">
                {price}
              </span>
              <span className="g-small">/ {t("perNight")}</span>
            </p>

            <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-7 border-y border-ink-line py-7 sm:grid-cols-4 sm:gap-x-8" aria-label={t("detailsTitle")}>
              {facts.map((f) => (
                <div key={f.key}>
                  <dt className="g-eyebrow">{f.label}</dt>
                  <dd className="g-display mt-2 text-xl leading-snug sm:text-[1.35rem]">{f.value}</dd>
                </div>
              ))}
            </dl>

            {paragraphs.length > 0 && (
              <Reveal className="g-body g-prose mt-10 max-w-2xl">
                {paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </Reveal>
            )}

            {room.amenities.length > 0 && (
              <Reveal as="section" className="mt-12 border-t border-ink-line pt-10" aria-labelledby="room-amenities">
                <h2 id="room-amenities" className="g-h3">
                  {t("amenitiesTitle")}
                </h2>
                <div className="mt-7">
                  <AmenityList amenities={room.amenities} columns={3} />
                </div>
              </Reveal>
            )}

            <div className="mt-10 max-w-2xl space-y-2">
              <p className="g-small">{extraBed}</p>
              <p className="g-small lg:hidden">{t("taxesNote")}</p>
            </div>
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="g-card hidden p-7 lg:block">
              <p className="g-eyebrow">{t("from")}</p>
              <p className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="g-price text-[2.75rem] leading-none" dir="ltr">
                  {price}
                </span>
                <span className="g-small">/ {t("perNight")}</span>
              </p>
              <p className="g-small mt-5 border-t border-ink-line pt-4">{t("taxesNote")}</p>
            </div>
            <h2 id="room-dates" className="g-h3 mb-5 lg:sr-only">
              {t("checkDates")}
            </h2>
            <div className="lg:mt-4">
              <AvailabilityWidget
                today={muscatToday()}
                maxNights={settings.booking.max_nights}
                maxAdvanceDays={settings.booking.max_advance_days}
                checkInTime={settings.times.check_in}
                checkOutTime={settings.times.check_out}
                roomSlug={room.slug}
                roomName={room.name}
                variant="stack"
              />
            </div>
          </aside>
        </div>

      </div>

      {/* Other rooms --------------------------------------------------------- */}
      {others.length > 0 && (
        <section className="g-container mt-16 sm:mt-24" aria-labelledby="other-rooms">
          <div className="border-t border-ink-line pb-20 pt-14 sm:pb-28 sm:pt-20">
            <Reveal className="max-w-2xl">
              <p className="g-eyebrow-gold">{t("otherRoomsEyebrow")}</p>
              <h2 id="other-rooms" className="g-h2 mt-4">
                {t("otherRooms")}
              </h2>
            </Reveal>
            <ul className="mt-12 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((r, i) => (
                <Reveal as="li" key={r.id} delay={i * 120}>
                  <RoomCard room={r} className="h-full" />
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      )}

      <div className="h-20 md:hidden" aria-hidden="true" />
      <StickyCta label={t("checkDates")} />
    </div>
  );
}
