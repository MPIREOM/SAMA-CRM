import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { AlertTriangle, ArrowRight, Check, Info, MessageCircle, Users } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getRoomTypes, searchAvailability } from "@/lib/bk/catalogue";
import { getPublicSettings } from "@/lib/bk/settings";
import { muscatToday } from "@/lib/booking-engine/dates";
import { addDays, nightsBetween, quoteFromNightly } from "@/lib/booking-engine/pricing";
import type { AvailabilityRow } from "@/lib/bk/types";
import { PriceSummary } from "@/components/guest/price-summary";
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
  const [t, tc, settings, roomTypes] = await Promise.all([
    getTranslations("search"),
    getTranslations("common"),
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
    <div className="g-container pt-8 sm:pt-12">
      <p className="g-eyebrow">{t("eyebrow")}</p>
      <h1 className="g-h1 mt-3 text-3xl sm:text-4xl">{t("title")}</h1>

      <div className="mt-6">
        <SearchSummary query={query} locale={locale} widget={widget} defaultOpen={result.error !== null} />
      </div>

      {fallback && (
        <p role="status" className="mt-4 flex items-start gap-2 rounded-xl border border-gold-300 bg-gold-50 px-4 py-3 text-sm text-maroon-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" aria-hidden="true" />
          {t("invalidParams")}
        </p>
      )}

      {result.error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-crimson-200 bg-crimson-50 px-4 py-3 text-sm font-semibold text-crimson-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`errors.${result.error}`, { n: n(settings.booking.max_nights) })}
        </p>
      )}

      {!result.error && (
        <>
          <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="g-h2 text-2xl sm:text-3xl">{nothing ? t("noResultsTitle") : t("resultsTitle")}</h2>
              <p className="mt-2 text-sm text-maroon-700">
                {nothing
                  ? t("noResultsBody")
                  : t("resultsIntro", {
                      nights: tc("nights", { count: nights, n: n(nights) }),
                      guests: t("guestsSummary", { adults: query.adults, a: n(query.adults), children: query.children, c: n(query.children) }),
                    })}
              </p>
            </div>
            <p className="inline-flex items-center gap-2 rounded-full bg-jabal-50 px-3.5 py-1.5 text-xs font-bold text-jabal-800">
              <Check className="h-4 w-4" aria-hidden="true" />
              {t("payAtHotel")}
            </p>
          </div>

          {nothing && (
            <div className="g-card mt-6 p-5 sm:p-6">
              <h3 className="g-h3">{t("tryDates")}</h3>
              <ul className="mt-4 flex flex-wrap gap-3">
                {shifts.map(({ d, q }) => (
                  <li key={d}>
                    <Link href={{ pathname: "/book", query: searchParamsFor(q) }} className="g-btn-outline g-btn-sm">
                      {d < 0 ? t("shiftEarlier", { n: Math.abs(d), d: n(Math.abs(d)) }) : t("shiftLater", { n: d, d: n(d) })}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-sm text-maroon-700">
                {t("contactForHelp")}{" "}
                <a href={waLink(settings.contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="g-link inline-flex items-center gap-1">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  {tc("whatsapp")}
                </a>
              </p>
            </div>
          )}

          <ul className="mt-6 space-y-5">
            {rooms.map(({ room, avail }) => {
              const soldOut = !avail || avail.available_count <= 0;
              const minStayFail = !!avail && !avail.min_stay_ok;
              const capacityFail = !!avail && !avail.fits_capacity;
              const ok = !soldOut && !minStayFail && !capacityFail;
              const quote = avail ? quoteFromNightly(avail.nightly, settings.taxes) : null;
              return (
                <li key={room.id} className={ok ? "g-card overflow-hidden" : "g-card overflow-hidden opacity-95"}>
                  <div className="grid md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr_300px]">
                    <div className="relative aspect-[4/3] bg-stone-100 md:aspect-auto md:min-h-[240px]">
                      <Image src={room.images[0]} alt="" fill sizes="(min-width: 1024px) 320px, (min-width: 768px) 280px, 100vw" className={ok ? "object-cover" : "object-cover grayscale-[35%]"} />
                      {soldOut && (
                        <span className="absolute start-3 top-3 rounded-full bg-maroon-900/90 px-3 py-1 text-xs font-bold text-gold-100">{t("soldOut")}</span>
                      )}
                      {ok && avail && avail.available_count <= 3 && (
                        <span className="absolute start-3 top-3 rounded-full bg-gold-500 px-3 py-1 text-xs font-bold text-maroon-950">
                          {t("leftOnly", { count: avail.available_count, n: n(avail.available_count) })}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col p-5 sm:p-6">
                      <h3 className="g-h3">
                        <Link href={`/rooms/${room.slug}`} className="hover:underline">
                          {room.name}
                        </Link>
                      </h3>
                      {room.tagline && <p className="mt-1.5 text-sm leading-relaxed text-maroon-700">{room.tagline}</p>}
                      <p className="mt-3 inline-flex items-center gap-2 text-sm text-maroon-700">
                        <Users className="h-4 w-4 text-gold-700" aria-hidden="true" />
                        {t("capacity", { a: n(room.maxAdults), c: n(room.maxChildren) })}
                      </p>
                      {avail && avail.min_stay > 1 && (
                        <p className={minStayFail ? "mt-3 text-sm font-semibold text-crimson-700" : "mt-3 text-sm text-maroon-700"}>
                          {t("minStay", { count: avail.min_stay, n: n(avail.min_stay) })}
                          {minStayFail && (
                            <span className="block font-normal text-maroon-700">{t("minStayBody", { count: avail.min_stay, n: n(avail.min_stay) })}</span>
                          )}
                        </p>
                      )}
                      {capacityFail && <p className="mt-3 text-sm font-semibold text-crimson-700">{t("capacityBody")}</p>}
                      {soldOut && <p className="mt-3 text-sm text-maroon-700">{t("soldOutBody", { name: room.name })}</p>}
                    </div>

                    <div className="border-t border-stone-200 bg-stone-50 p-5 sm:p-6 lg:border-s lg:border-t-0">
                      {quote ? <PriceSummary quote={quote} taxes={settings.taxes} locale={locale} compact /> : null}
                      <div className="mt-4">
                        {ok ? (
                          <Link href={{ pathname: `/book/${room.slug}`, query: searchParamsFor(query) }} className="g-btn-primary w-full">
                            {t("select")}
                            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                          </Link>
                        ) : (
                          <span aria-disabled="true" className="g-btn-outline w-full cursor-not-allowed opacity-60">
                            {soldOut ? t("soldOut") : t("select")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-6 text-sm text-maroon-600">{t("weekendNote")}</p>
        </>
      )}
    </div>
  );
}

function shiftQuery(q: SearchQuery, days: number, today: string, maxAdvance: number): SearchQuery | null {
  const checkin = addDays(q.checkin, days);
  if (checkin < today || checkin > addDays(today, maxAdvance)) return null;
  return { ...q, checkin, checkout: addDays(q.checkout, days) };
}
