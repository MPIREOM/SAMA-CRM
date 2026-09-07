import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getBookingByRef } from "@/lib/bk/bookings";
import { getPublicSettings } from "@/lib/bk/settings";
import { verifyBookingToken } from "@/lib/booking-engine/tokens";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { BookingDetails } from "@/components/guest/booking-details";
import { ManageBooking } from "@/components/guest/manage-booking";
import { pageMetadata } from "@/components/guest/metadata";
import { canCancelOnline, cancellationDeadline, formatMuscatDateTime } from "@/components/guest/lib";
import { requestCancellationAction } from "./actions";

export const dynamic = "force-dynamic";

type Props = { params: { locale: string; ref: string }; searchParams: { token?: string } };

const REF_RE = /^[A-Z0-9-]{6,24}$/;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  const ref = decodeURIComponent(params.ref).toUpperCase();
  return pageMetadata({ locale, path: `/booking/${ref}/manage`, title: t("manageTitle", { ref }), description: t("siteDescription"), noIndex: true });
}

export default async function ManagePage({ params, searchParams }: Props) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const ref = decodeURIComponent(params.ref).trim().toUpperCase();
  const token = searchParams.token ?? "";
  if (!REF_RE.test(ref) || !verifyBookingToken(ref, token)) notFound();

  const [t, tSearch, settings, booking] = await Promise.all([
    getTranslations("manage"),
    getTranslations("search"),
    getPublicSettings(),
    getBookingByRef(ref),
  ]);
  if (!booking) notFound();

  const live = booking.status === "confirmed" || booking.status === "pending";
  const canCancel = canCancelOnline(booking, settings);
  const deadline = cancellationDeadline(booking.check_in, settings.times.check_in, settings.cancellation.hours_before);
  const deadlineLabel = live ? formatMuscatDateTime(deadline, locale) : null;
  const datesLabel = tSearch("summary", { checkIn: formatLongDate(booking.check_in, locale), checkOut: formatLongDate(booking.check_out, locale) });

  return (
    <div className="g-container max-w-4xl pt-12 sm:pt-16">
      <Link href={{ pathname: `/booking/${booking.ref}`, query: { token } }} className="g-link inline-flex items-center gap-1.5 text-sm no-underline hover:underline">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
        {t("backToBooking")}
      </Link>
      <p className="g-eyebrow mt-6">{t("eyebrow")}</p>
      <h1 className="g-h1 mt-2 text-3xl sm:text-4xl">{t("title")}</h1>
      <p dir="ltr" className="mt-2 font-mono text-lg font-bold tracking-wider text-maroon-700 rtl:text-start">
        {booking.ref}
      </p>

      <div className="mt-8">
        <BookingDetails booking={booking} settings={settings} locale={locale} />
      </div>

      <section className="mt-8" aria-label={t("requestCancel")}>
        <ManageBooking
          bookingRef={booking.ref}
          token={token}
          datesLabel={datesLabel}
          canCancel={canCancel}
          alreadyCancelled={booking.status === "cancelled"}
          deadlineLabel={deadlineLabel}
          hoursBefore={settings.cancellation.hours_before}
          whatsapp={settings.contact.whatsapp}
          phone={settings.contact.phone}
          action={requestCancellationAction}
        />
      </section>

      <section className="mt-8 rounded-2xl border border-stone-200 bg-white p-5 text-sm leading-relaxed text-maroon-800">
        <h2 className="font-extrabold text-maroon-900">{t("policyTitle")}</h2>
        <p className="mt-1.5">{locale === "ar" ? settings.cancellation.policy_ar : settings.cancellation.policy_en}</p>
      </section>
    </div>
  );
}
