import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Baby, Ban, Car, CigaretteOff, Clock, Receipt, Sparkles, Wallet, XCircle } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getAddons } from "@/lib/bk/catalogue";
import { logger } from "@/lib/logger";
import { safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { APEX_SLUG, TRANSFER_UP_SLUG, formatRate, localizeAddon, n, pct, type LocalizedAddon } from "@/components/guest/lib";

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
  const [t, ta, tc, settings] = await Promise.all([getTranslations("policies"), getTranslations("addons"), getTranslations("common"), safePublicSettings()]);
  const { times, cancellation, booking, taxes } = settings;

  // Transfer and zipline prices come from the catalogue; the section still renders without them.
  let transfer: LocalizedAddon | null = null;
  let apex: LocalizedAddon | null = null;
  try {
    const addons = (await getAddons()).map((a) => localizeAddon(a, locale));
    transfer = addons.find((a) => a.slug === TRANSFER_UP_SLUG) ?? null;
    apex = addons.find((a) => a.slug === APEX_SLUG) ?? null;
  } catch (err) {
    logger.warn("guest.policies", "add-ons unavailable", { error: err instanceof Error ? err.message : String(err) });
  }
  const omr = (value: number) => tc("omrAmount", { amount: formatRate(value) });
  const maxGuests = typeof transfer?.details.max_guests_per_car === "number" ? transfer.details.max_guests_per_car : 4;
  const maxWeight = typeof apex?.details.max_weight_kg === "number" ? apex.details.max_weight_kg : 120;

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

  const transferRules = [
    ta("policy.checkpoint"),
    transfer ? ta("policy.transferPriced", { price: omr(transfer.price), guests: n(maxGuests) }) : ta("policy.transfer", { guests: n(maxGuests) }),
    apex ? ta("policy.apexPriced", { price: omr(apex.price), kg: n(maxWeight) }) : ta("policy.apex", { kg: n(maxWeight) }),
    ta("policy.confirmation"),
    ta("policy.cancellation"),
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

        <article id="transfers" className="g-card scroll-mt-24 p-5 sm:col-span-2 sm:p-6" aria-labelledby="policies-transfers">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gold-100 text-gold-700">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="policies-transfers" className="g-h3 mt-4">
            {ta("policy.title")}
          </h2>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-maroon-800">
            {transferRules.map((rule, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
                <span>{rule}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/apex-zipline" className="g-btn-outline g-btn-sm">
              {ta("policy.apexLink")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-primary g-btn-sm">
              {ta("policy.bookLink")}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
