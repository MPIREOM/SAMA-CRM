import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getBookingByRef } from "@/lib/bk/bookings";
import { getPublicSettings } from "@/lib/bk/settings";
import { verifyBookingToken } from "@/lib/booking-engine/tokens";
import { formatLongDate } from "@/lib/booking-engine/dates";
import { BookingAddons } from "@/components/guest/booking-addons";
import { BookingDetails } from "@/components/guest/booking-details";
import { ManageBooking } from "@/components/guest/manage-booking";
import { Reveal } from "@/components/guest/reveal";
import { pageMetadata } from "@/components/guest/metadata";
import { canCancelOnline, cancellationDeadline, formatMuscatDateTime, liveBookingAddons } from "@/components/guest/lib";
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
    <div className="g-page pb-24 sm:pb-32">
      <div className="g-container max-w-4xl">
        <Reveal>
          <Link href={{ pathname: `/booking/${booking.ref}`, query: { token } }} className="g-link">
            <ArrowLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden="true" />
            {t("backToBooking")}
          </Link>
          <p className="g-eyebrow-gold mt-10">{t("eyebrow")}</p>
          <h1 className="g-h1 mt-4">{t("title")}</h1>
          <p dir="ltr" className="mt-4 font-display text-2xl tracking-wider text-ink-soft lining-nums rtl:text-start">
            {booking.ref}
          </p>
        </Reveal>

        <Reveal delay={120} className="mt-10 sm:mt-12">
          <BookingDetails booking={booking} settings={settings} locale={locale} />
        </Reveal>

        {(booking.addons?.length ?? 0) > 0 && (
          <Reveal delay={100}>
            <BookingAddons addons={booking.addons ?? []} locale={locale} className="mt-6" />
          </Reveal>
        )}

        {/* No <Reveal> here: its will-change/transform would trap the fixed-position cancellation dialog inside the section. */}
        <section className="mt-6" aria-label={t("requestCancel")}>
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
            hasAddons={liveBookingAddons(booking.addons).length > 0}
            action={requestCancellationAction}
          />
        </section>

        <Reveal as="section" className="mt-12 border-t border-ink-line pt-8" aria-labelledby="manage-policy">
          <h2 id="manage-policy" className="g-h4">
            {t("policyTitle")}
          </h2>
          <p className="g-body mt-3 max-w-2xl text-[15px]">{locale === "ar" ? settings.cancellation.policy_ar : settings.cancellation.policy_en}</p>
        </Reveal>
      </div>
    </div>
  );
}
