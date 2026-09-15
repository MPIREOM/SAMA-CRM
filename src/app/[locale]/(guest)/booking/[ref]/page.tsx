import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, ArrowUpRight, CalendarPlus } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getBookingByRef, type BookingWithRelations } from "@/lib/bk/bookings";
import { verifyBookingToken } from "@/lib/booking-engine/tokens";
import { logger } from "@/lib/logger";
import { BookingAddons } from "@/components/guest/booking-addons";
import { BookingDetails } from "@/components/guest/booking-details";
import { Reveal } from "@/components/guest/reveal";
import { safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { TRANSFER_UP_SLUG, hasAddon, prettyPhone, telLink, waLink } from "@/components/guest/lib";

export const dynamic = "force-dynamic";

type Props = { params: { locale: string; ref: string }; searchParams: { token?: string } };

const REF_RE = /^[A-Z0-9-]{6,24}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  const ref = decodeURIComponent(params.ref).toUpperCase();
  return pageMetadata({ locale, path: `/booking/${ref}`, title: t("confirmationTitle", { ref }), description: t("siteDescription"), noIndex: true });
}

export default async function ConfirmationPage({ params, searchParams }: Props) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const ref = decodeURIComponent(params.ref).trim().toUpperCase();
  const token = searchParams.token ?? null;
  if (!REF_RE.test(ref) || !verifyBookingToken(ref, token)) notFound();

  const [t, settings] = await Promise.all([getTranslations("confirmation"), safePublicSettings()]);

  let booking: BookingWithRelations | null = null;
  let loadFailed = false;
  try {
    booking = await getBookingByRef(ref);
  } catch (err) {
    loadFailed = true;
    logger.error("guest.confirmation", "booking read failed", { ref, error: err instanceof Error ? err.message : String(err) });
  }
  if (!loadFailed && !booking) notFound();

  const { contact } = settings;
  const waText = t("waText", { ref });
  const contactLinks = (
    <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
      <a href={waLink(contact.whatsapp, waText)} target="_blank" rel="noopener noreferrer" className="g-link">
        {t("whatsapp")}
        <ArrowUpRight className="g-arrow-ext h-3.5 w-3.5" aria-hidden="true" />
      </a>
      <a href={telLink(contact.phone)} className="g-link">
        <span>{t("call")}</span>
        <span dir="ltr" className="font-normal normal-case tracking-normal text-ink-soft">
          {prettyPhone(contact.phone)}
        </span>
      </a>
    </div>
  );

  if (loadFailed || !booking) {
    return (
      <div className="g-page pb-24 sm:pb-32">
        <div className="g-container max-w-4xl">
          <Reveal>
            <p className="g-eyebrow-gold">{t("refLabel")}</p>
            <p dir="ltr" className="mt-3 font-display text-3xl tracking-wider text-ink lining-nums rtl:text-start">
              {ref}
            </p>
            <h1 className="g-h2 mt-8">{t("unavailableTitle")}</h1>
            <p className="g-lead mt-5 max-w-2xl">{t("unavailableBody")}</p>
            <div className="mt-10">{contactLinks}</div>
          </Reveal>
        </div>
      </div>
    );
  }

  const cancelled = booking.status === "cancelled" || booking.status === "no_show";
  const icsHref = `/api/bk/ics/${encodeURIComponent(booking.ref)}?token=${encodeURIComponent(token ?? "")}&locale=${locale}`;
  const addons = booking.addons ?? [];
  const transferUp = !cancelled && hasAddon(addons, TRANSFER_UP_SLUG);
  const nextSteps = [t("next1"), ...(transferUp ? [t("nextTransfer")] : []), t("next2"), t("next3")];

  return (
    <div className="g-page pb-24 sm:pb-32">
      <div className="g-container max-w-4xl">
        <Reveal>
          <p className={cancelled ? "g-eyebrow" : "g-eyebrow-gold"}>{cancelled ? t("cancelledEyebrow") : t("eyebrow")}</p>
          <h1 className="g-h1 mt-4 max-w-3xl [text-wrap:balance]">{cancelled ? t("cancelledTitle") : t("title")}</h1>
          <p className="g-lead mt-5 max-w-2xl">{cancelled ? t("cancelledBody", { ref: booking.ref }) : t("subtitle")}</p>
        </Reveal>

        <Reveal delay={120} className="mt-10 flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-y border-ink-line py-6 sm:mt-12">
          <dl>
            <dt className="g-eyebrow">{t("refLabel")}</dt>
            <dd dir="ltr" className="mt-2 font-display text-3xl tracking-wider text-ink lining-nums rtl:text-start sm:text-4xl">
              {booking.ref}
            </dd>
          </dl>
          {cancelled ? <span className="g-tag-dark">{t("statusCancelled")}</span> : <p className="g-small max-w-xs">{t("keepRef")}</p>}
        </Reveal>

        <Reveal delay={200} className="mt-8">
          <BookingDetails booking={booking} settings={settings} locale={locale} />
        </Reveal>

        {addons.length > 0 && (
          <Reveal delay={100}>
            <BookingAddons addons={addons} locale={locale} className="mt-6" />
          </Reveal>
        )}

        {!cancelled && (
          <>
            <Reveal as="section" className="mt-16" aria-labelledby="what-next">
              <h2 id="what-next" className="g-h2">
                {t("whatNext")}
              </h2>
              <ol className="mt-8 border-b border-ink-line">
                {nextSteps.map((text, i) => (
                  <li key={i} className="flex gap-5 border-t border-ink-line py-5">
                    <span className="w-8 shrink-0 font-display text-2xl leading-none text-gold-700 lining-nums tabular-nums" aria-hidden="true">
                      {i + 1}
                    </span>
                    <p className="g-body -mt-1">{text}</p>
                  </li>
                ))}
              </ol>
            </Reveal>

            <Reveal className={transferUp ? "g-note-green mt-8" : "g-note-gold mt-8"}>
              <h2 className="font-semibold text-inherit">{transferUp ? t("transferBookedTitle") : t("fourWdTitle")}</h2>
              <p className="mt-1.5">{transferUp ? t("transferBookedBody") : t("fourWdBody")}</p>
              {!transferUp && (
                <Link href={{ pathname: "/policies", hash: "transfers" }} className="g-inline mt-2 inline-block">
                  {t("transferLink")}
                </Link>
              )}
            </Reveal>

            <Reveal className="mt-10 flex flex-wrap gap-3">
              <a href={icsHref} className="g-btn-primary">
                <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                {t("addToCalendar")}
              </a>
              <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="g-btn-outline">
                {t("directions")}
                <ArrowUpRight className="g-arrow-ext h-3.5 w-3.5" aria-hidden="true" />
              </a>
              <Link href={{ pathname: `/booking/${booking.ref}/manage`, query: { token: token ?? "" } }} className="g-btn-outline">
                {t("manage")}
              </Link>
            </Reveal>
          </>
        )}

        <Reveal className="mt-12 border-t border-ink-line pt-8">{contactLinks}</Reveal>
        <p className="mt-14">
          <Link href="/" className="g-link">
            <ArrowLeft className="g-arrow-back h-3.5 w-3.5" aria-hidden="true" />
            {t("backHome")}
          </Link>
        </p>
      </div>
    </div>
  );
}
