import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Baby, Ban, Car, CigaretteOff, Clock, Receipt, Wallet, XCircle } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/routing";
import { safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { n, pct } from "@/components/guest/lib";

// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
export const revalidate = 600;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ locale, path: "/policies", title: t("policiesTitle"), description: t("policiesDescription") });
}

export default async function PoliciesPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations("policies"), safePublicSettings()]);
  const { times, cancellation, booking, taxes } = settings;

  const sections = [
    { Icon: Clock, title: t("checkTimesTitle"), body: t("checkTimesBody", { checkIn: times.check_in, checkOut: times.check_out }) },
    { Icon: XCircle, title: t("cancellationTitle"), body: locale === "ar" ? cancellation.policy_ar : cancellation.policy_en },
    { Icon: Baby, title: t("childrenTitle"), body: t("childrenBody", { age: n(booking.child_free_under), price: n(booking.extra_bed_omr) }) },
    { Icon: Ban, title: t("petsTitle"), body: t("petsBody") },
    { Icon: CigaretteOff, title: t("smokingTitle"), body: t("smokingBody") },
    { Icon: Wallet, title: t("paymentTitle"), body: t("paymentBody") },
    {
      Icon: Receipt,
      title: t("taxesTitle"),
      body: t("taxesBody", { service: pct(taxes.service_charge_pct), tourism: pct(taxes.tourism_fee_pct), vat: pct(taxes.vat_pct) }),
    },
    { Icon: Car, title: t("fourWdTitle"), body: t("fourWdBody") },
  ];

  return (
    <section className="g-container max-w-4xl pt-12 sm:pt-16">
      <p className="g-eyebrow">{t("eyebrow")}</p>
      <h1 className="g-h1 mt-3">{t("title")}</h1>
      <p className="g-lead mt-4">{t("intro")}</p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {sections.map(({ Icon, title, body }) => (
          <article key={title} className="g-card p-5 sm:p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 text-gold-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h2 className="g-h3 mt-4">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-maroon-800">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
