import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Check } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getRoomTypes, searchAvailability } from "@/lib/bk/catalogue";
import { getPublicSettings } from "@/lib/bk/settings";
import { muscatToday } from "@/lib/booking-engine/dates";
import { addDays, nightsBetween, quoteFromNightly } from "@/lib/booking-engine/pricing";
import type { AvailabilityRow } from "@/lib/bk/types";
import { cn } from "@/lib/utils";
import { PriceSummary } from "@/components/guest/price-summary";
import { Reveal } from "@/components/guest/reveal";
import { SearchSummary } from "@/components/guest/search-summary";
import { pageMetadata } from "@/components/guest/metadata";
import { localizeRoom, n, waLink } from "@/components/guest/lib";
import { parseSearchQuery, searchParamsFor, type SearchQuery } from "@/components/guest/schemas";

export const dynamic = "force-dynamic";

type Props = { params: { locale: string }; searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ locale, path: "/book", title: t("bookTitle"), description: t("bookDescription"), noIndex: true });
}

export default async function BookPage({ params, searchParams }: Props) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, tc, tRooms, settings, roomTypes] = await Promise.all([
    getTranslations("search"),
    getTranslations("common"),
    getTranslations("rooms"),
    getPublicSettings(),
    getRoomTypes(),
  ]);
  const today = muscatToday();
  const { query, fallback } = parseSearchQuery(
    searchParams,
    { maxNights: settings.booking.max_nights, maxAdvanceDays: settings.booking.max_advance_days },
    today
  );
  const nights = nightsBetween(query.checkin, query.checkout);
  const result = await searchAvailability(query.checkin, query.checkout, query.adults, query.children);
  const rows = new Map<string, AvailabilityRow>((result.rows ?? []).map((r) => [r.room_type_id, r]));
  const rooms = roomTypes.map((rt) => ({ room: localizeRoom(rt, locale), avail: rows.get(rt.id) ?? null }));
  const bookable = rooms.filter((r) => r.avail && r.avail.available_count > 0 && r.avail.min_stay_ok && r.avail.fits_capacity);
  const nothing = result.error === null && bookable.length === 0;
  const widget = {
    today,
    maxNights: settings.booking.max_nights,
    maxAdvanceDays: settings.booking.max_advance_days,
    checkInTime: settings.times.check_in,
    checkOutTime: settings.times.check_out,
  };

  const shifts = [-2, -1, 1, 2]
    .map((d) => ({ d, q: shiftQuery(query, d, today, settings.booking.max_advance_days) }))
    .filter((s): s is { d: number; q: SearchQuery } => s.q !== null);

  return (
    <div className="g-page pb-24 sm:pb-32">
      <div className="g-container">
        <Reveal>
          <p className="g-eyebrow-gold">{t("eyebrow")}</p>
          <h1 className="g-h1 mt-5">{t("title")}</h1>
        </Reveal>

        <Reveal delay={120} className="mt-8 sm:mt-10">
          <SearchSummary query={query} locale={locale} widget={widget} defaultOpen={result.error !== null} />
        </Reveal>

        {fallback && (
          <p role="status" className="g-note mt-4">
            {t("invalidParams")}
          </p>
        )}

        {result.error && (
          <p role="alert" className="g-note-red mt-4">
            {t(`errors.${result.error}`, { n: n(settings.booking.max_nights) })}
          </p>
        )}

        {!result.error && (
          <>
            <Reveal delay={200} className="mt-14 flex flex-wrap items-end justify-between gap-x-10 gap-y-5 border-t border-ink-line pt-10 sm:mt-16">
              <div className="max-w-2xl">
                <h2 className="g-h2">{nothing ? t("noResultsTitle") : t("resultsTitle")}</h2>
                <p className="g-body mt-4">
                  {nothing
                    ? t("noResultsBody")
                    : t("resultsIntro", {
                        nights: tc("nights", { count: nights, n: n(nights) }),
                        guests: t("guestsSummary", { adults: query.adults, a: n(query.adults), children: query.children, c: n(query.children) }),
                      })}
                </p>
              </div>
              {!nothing && (
                <p className="g-note-green g-note-inline">
                  <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{t("payAtHotel")}</span>
                </p>
              )}
            </Reveal>

            {nothing && (
              <Reveal className="g-card mt-8 p-6 sm:p-8">
                <h3 className="g-h3">{t("tryDates")}</h3>
                <ul className="mt-5 flex flex-wrap gap-3">
                  {shifts.map(({ d, q }) => (
                    <li key={d}>
                      <Link href={{ pathname: "/book", query: searchParamsFor(q) }} className="g-btn-outline g-btn-sm">
                        {d < 0 ? t("shiftEarlier", { n: Math.abs(d), d: n(Math.abs(d)) }) : t("shiftLater", { n: d, d: n(d) })}
                      </Link>
                    </li>
                  ))}
                </ul>
                <p className="g-body mt-6">
                  {t("contactForHelp")}{" "}
                  <a href={waLink(settings.contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="g-inline">
                    {tc("whatsapp")}
                  </a>
                </p>
              </Reveal>
            )}

            <ul className="mt-8 space-y-6">
              {rooms.map(({ room, avail }, i) => {
                const soldOut = !avail || avail.available_count <= 0;
                const minStayFail = !!avail && !avail.min_stay_ok;
                const capacityFail = !!avail && !avail.fits_capacity;
                const ok = !soldOut && !minStayFail && !capacityFail;
                const quote = avail ? quoteFromNightly(avail.nightly, settings.taxes) : null;
                const fewLeft = ok && avail && avail.available_count <= 3;
                // One quiet line of facts under the tagline: who it sleeps, then size, beds and view.
                const facts = [
                  t("capacity", { adults: room.maxAdults, a: n(room.maxAdults), children: room.maxChildren, c: n(room.maxChildren) }),
                  room.sizeSqm ? tRooms("sizeSqm", { n: n(room.sizeSqm) }) : null,
                  room.bed || null,
                  room.view || null,
                ].filter(Boolean);
                return (
                  <Reveal as="li" key={room.id} delay={Math.min(i, 3) * 80} className="g-card overflow-hidden">
                    <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:grid-cols-[minmax(0,4fr)_minmax(0,5fr)_minmax(0,3.4fr)]">
                      <div className={cn("g-frame aspect-[4/3] rounded-none md:aspect-auto md:min-h-[260px]", ok && "g-zoom")}>
                        <Image
                          src={room.images[0]}
                          alt=""
                          fill
                          sizes="(min-width: 1024px) 420px, (min-width: 768px) 42vw, 100vw"
                          className={cn("object-cover", soldOut && "grayscale")}
                        />
                        {soldOut && <span className="g-tag-dark absolute start-4 top-4">{t("soldOut")}</span>}
                        {fewLeft && avail && (
                          <span className="g-tag-gold absolute start-4 top-4">{t("leftOnly", { count: avail.available_count, n: n(avail.available_count) })}</span>
                        )}
                      </div>

                      <div className="flex flex-col p-6 sm:p-8">
                        <h3 className="g-h3">
                          <Link
                            href={`/rooms/${room.slug}`}
                            className="rounded-sm transition-colors duration-300 hover:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                          >
                            {room.name}
                          </Link>
                        </h3>
                        {room.tagline && <p className="g-body mt-3">{room.tagline}</p>}
                        <p className="g-small mt-4">{facts.join(" · ")}</p>
                        {avail && avail.min_stay > 1 && (
                          <p className={minStayFail ? "g-error mt-3" : "g-small mt-3"}>
                            {t("minStay", { count: avail.min_stay, n: n(avail.min_stay) })}
                            {minStayFail && <span className="g-small mt-1 block font-normal">{t("minStayBody", { count: avail.min_stay, n: n(avail.min_stay) })}</span>}
                          </p>
                        )}
                        {capacityFail && <p className="g-error mt-3">{t("capacityBody")}</p>}
                        {soldOut && <p className="g-small mt-3">{t("soldOutBody", { name: room.name })}</p>}
                      </div>

                      <div className="flex flex-col border-t border-ink-line bg-paper-100 p-6 sm:p-8 md:col-span-2 lg:col-span-1 lg:border-s lg:border-t-0">
                        {quote ? <PriceSummary quote={{ ...quote, addons: [] }} taxes={settings.taxes} locale={locale} compact /> : null}
                        <div className="mt-auto pt-6">
                          {ok ? (
                            <Link href={{ pathname: `/book/${room.slug}`, query: searchParamsFor(query) }} className="g-btn-primary w-full">
                              {t("select")}
                              <ArrowRight className="g-btn-arrow" aria-hidden="true" />
                            </Link>
                          ) : (
                            <span aria-disabled="true" className="g-btn-outline w-full cursor-not-allowed opacity-50">
                              {soldOut ? t("soldOut") : t("select")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Reveal>
                );
              })}
            </ul>
            <p className="g-small mt-8">{t("weekendNote")}</p>
          </>
        )}
      </div>
    </div>
  );
}

function shiftQuery(q: SearchQuery, days: number, today: string, maxAdvance: number): SearchQuery | null {
  const checkin = addDays(q.checkin, days);
  if (checkin < today || checkin > addDays(today, maxAdvance)) return null;
  return { ...q, checkin, checkout: addDays(q.checkout, days) };
}
