import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarPlus, Car, Check, MapPin, MessageCircle, Phone, Settings2, XCircle } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getBookingByRef, type BookingWithRelations } from "@/lib/bk/bookings";
import { verifyBookingToken } from "@/lib/booking-engine/tokens";
import { logger } from "@/lib/logger";
import { BookingAddons } from "@/components/guest/booking-addons";
import { BookingDetails } from "@/components/guest/booking-details";
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
    <div className="flex flex-wrap gap-3">
      <a href={waLink(contact.whatsapp, waText)} target="_blank" rel="noopener noreferrer" className="g-btn-outline g-btn-sm">
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        {t("whatsapp")}
      </a>
      <a href={telLink(contact.phone)} className="g-btn-outline g-btn-sm">
        <Phone className="h-4 w-4" aria-hidden="true" />
        <span>{t("call")}</span>
        <span dir="ltr" className="text-maroon-600">
          {prettyPhone(contact.phone)}
        </span>
      </a>
    </div>
  );

  if (loadFailed || !booking) {
    return (
      <div className="g-container max-w-3xl pt-12 sm:pt-16">
        <p className="g-eyebrow">{t("refLabel")}</p>
        <p dir="ltr" className="mt-2 font-mono text-2xl font-extrabold tracking-wider text-maroon-900 rtl:text-start">
          {ref}
        </p>
        <h1 className="g-h2 mt-6">{t("unavailableTitle")}</h1>
        <p className="g-lead mt-3">{t("unavailableBody")}</p>
        <div className="mt-8">{contactLinks}</div>
      </div>
    );
  }

  const cancelled = booking.status === "cancelled" || booking.status === "no_show";
  const icsHref = `/api/bk/ics/${encodeURIComponent(booking.ref)}?token=${encodeURIComponent(token ?? "")}&locale=${locale}`;
  const addons = booking.addons ?? [];
  const transferUp = !cancelled && hasAddon(addons, TRANSFER_UP_SLUG);
  const nextSteps = [t("next1"), ...(transferUp ? [t("nextTransfer")] : []), t("next2"), t("next3")];

  return (
    <div className="g-container max-w-4xl pt-12 sm:pt-16">
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <span
          className={
            cancelled
              ? "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-stone-200 text-maroon-700"
              : "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-jabal-600 text-white"
          }
        >
          {cancelled ? <XCircle className="h-8 w-8" aria-hidden="true" /> : <Check className="h-9 w-9" strokeWidth={3} aria-hidden="true" />}
        </span>
        <div>
          <p className="g-eyebrow">{cancelled ? t("cancelledEyebrow") : t("eyebrow")}</p>
          <h1 className="g-h1 mt-2 text-3xl sm:text-4xl lg:text-5xl">{cancelled ? t("cancelledTitle") : t("title")}</h1>
          <p className="g-lead mt-3">{cancelled ? t("cancelledBody", { ref: booking.ref }) : t("subtitle")}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-gold-300 bg-gold-50 px-5 py-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("refLabel")}</p>
          <p dir="ltr" className="mt-1 font-mono text-2xl font-extrabold tracking-wider text-maroon-900 rtl:text-start">
            {booking.ref}
          </p>
        </div>
        <p className="text-sm text-maroon-700">{t("keepRef")}</p>
        {cancelled && <span className="ms-auto rounded-full bg-maroon-900 px-3 py-1 text-xs font-bold text-gold-100">{t("statusCancelled")}</span>}
      </div>

      <div className="mt-8">
        <BookingDetails booking={booking} settings={settings} locale={locale} />
      </div>

      {addons.length > 0 && <BookingAddons addons={addons} locale={locale} className="mt-6" />}

      {!cancelled && (
        <>
          <section className="mt-10" aria-labelledby="what-next">
            <h2 id="what-next" className="g-h2 text-2xl">
              {t("whatNext")}
            </h2>
            <ol className="mt-5 space-y-4">
              {nextSteps.map((text, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-maroon-800 text-sm font-extrabold text-gold-100 tabular-nums">{i + 1}</span>
                  <p className="pt-1 text-maroon-800">{text}</p>
                </li>
              ))}
            </ol>
          </section>

          <div className={transferUp ? "mt-8 flex items-start gap-4 rounded-2xl border-2 border-jabal-600 bg-jabal-50 p-5" : "mt-8 flex items-start gap-4 rounded-2xl border border-gold-300 bg-gold-50 p-5"}>
            <Car className={transferUp ? "mt-0.5 h-6 w-6 shrink-0 text-jabal-700" : "mt-0.5 h-6 w-6 shrink-0 text-gold-700"} aria-hidden="true" />
            <div>
              <h2 className="font-extrabold text-maroon-900">{transferUp ? t("transferBookedTitle") : t("fourWdTitle")}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-maroon-800">{transferUp ? t("transferBookedBody") : t("fourWdBody")}</p>
              {!transferUp && (
                <Link href={{ pathname: "/policies", hash: "transfers" }} className="g-link mt-2 inline-block text-sm">
                  {t("transferLink")}
                </Link>
              )}
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <a href={icsHref} className="g-btn-primary">
              <CalendarPlus className="h-5 w-5" aria-hidden="true" />
              {t("addToCalendar")}
            </a>
            <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="g-btn-outline">
              <MapPin className="h-5 w-5" aria-hidden="true" />
              {t("directions")}
            </a>
            <Link href={{ pathname: `/booking/${booking.ref}/manage`, query: { token: token ?? "" } }} className="g-btn-outline">
              <Settings2 className="h-5 w-5" aria-hidden="true" />
              {t("manage")}
            </Link>
          </div>
        </>
      )}

      <div className="mt-8">{contactLinks}</div>
      <p className="mt-10">
        <Link href="/" className="g-link text-sm">
          {t("backHome")}
        </Link>
      </p>
    </div>
  );
}
