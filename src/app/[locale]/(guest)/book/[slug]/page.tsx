import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link, isLocale, redirect, type Locale } from "@/i18n/routing";
import { getAddons, getQuote, getRoomTypeBySlug } from "@/lib/bk/catalogue";
import { getPublicSettings } from "@/lib/bk/settings";
import { muscatToday } from "@/lib/booking-engine/dates";
import { logger } from "@/lib/logger";
import { BookingFlow } from "@/components/guest/booking-flow";
import { pageMetadata } from "@/components/guest/metadata";
import { localizeAddon, localizeRoom, n } from "@/components/guest/lib";
import { parseSearchQuery, searchParamsFor } from "@/components/guest/schemas";
import { createBookingAction, getQuoteAction } from "./actions";

export const dynamic = "force-dynamic";

type Props = { params: { locale: string; slug: string }; searchParams: Record<string, string | string[] | undefined> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  // notFound() here (before streaming starts) gives crawlers a real 404 status.
  const rt = await getRoomTypeBySlug(params.slug);
  if (!rt) notFound();
  const t = await getTranslations({ locale, namespace: "meta" });
  const room = localizeRoom(rt, locale);
  return pageMetadata({ locale, path: `/book/${room.slug}`, title: t("bookRoomTitle", { name: room.name }), description: t("bookDescription"), noIndex: true });
}

export default async function BookRoomPage({ params, searchParams }: Props) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [rt, settings, t] = await Promise.all([getRoomTypeBySlug(params.slug), getPublicSettings(), getTranslations("booking")]);
  if (!rt) notFound();
  const room = localizeRoom(rt, locale);

  const { query, fallback } = parseSearchQuery(
    searchParams,
    { maxNights: settings.booking.max_nights, maxAdvanceDays: settings.booking.max_advance_days },
    muscatToday()
  );
  // Broken or missing dates → back to the results page, which explains itself.
  if (fallback) redirect({ href: { pathname: "/book", query: searchParamsFor(query) }, locale });

  const quoteRes = await getQuote({
    roomTypeId: rt.id,
    checkIn: query.checkin,
    checkOut: query.checkout,
    adults: query.adults,
    children: query.children,
  });
  if (quoteRes.error !== null) throw new Error(`bk_quote failed: ${quoteRes.error}`);
  const quote = quoteRes.quote;

  // Add-ons are optional extras: if the catalogue is unavailable the room can still be booked.
  let addons: ReturnType<typeof localizeAddon>[] = [];
  try {
    addons = (await getAddons()).map((a) => localizeAddon(a, locale));
  } catch (err) {
    logger.warn("guest.book", "add-ons unavailable", { error: err instanceof Error ? err.message : String(err) });
  }

  const soldOut = quote.available_count <= 0;
  const minStayFail = quote.nights < quote.min_stay;
  const capacityFail = !quote.fits_capacity;

  return (
    <div className="g-container pt-8 sm:pt-12">
      <p className="g-eyebrow">{t("eyebrow")}</p>
      <h1 className="g-h1 mt-3 text-3xl sm:text-4xl">{t("title")}</h1>

      {soldOut || minStayFail || capacityFail ? (
        <div className="g-card mt-8 max-w-2xl p-6 sm:p-8">
          <h2 className="g-h3">{soldOut ? t("soldOutTitle") : t("notAvailableTitle")}</h2>
          <p className="mt-3 text-maroon-800">
            {soldOut
              ? t("soldOutBody", { name: room.name })
              : minStayFail
                ? t("unavailableReason.min_stay", { count: quote.min_stay, n: n(quote.min_stay) })
                : t("unavailableReason.capacity", { a: n(room.maxAdults), c: n(room.maxChildren) })}
          </p>
          <Link href={{ pathname: "/book", query: searchParamsFor(query) }} className="g-btn-primary mt-6">
            {t("searchAgain")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="mt-8">
          <BookingFlow
            locale={locale}
            room={room}
            query={query}
            initialQuote={quote}
            taxes={settings.taxes}
            times={settings.times}
            cancellationPolicy={locale === "ar" ? settings.cancellation.policy_ar : settings.cancellation.policy_en}
            maxAdvanceDays={settings.booking.max_advance_days}
            whatsapp={settings.contact.whatsapp}
            addons={addons}
            actions={{ getQuote: getQuoteAction, createBooking: createBookingAction }}
          />
        </div>
      )}
    </div>
  );
}
