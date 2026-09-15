import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getAddons } from "@/lib/bk/catalogue";
import { logger } from "@/lib/logger";
import { siteImage } from "@/lib/bk/site-content";
import { Reveal } from "@/components/guest/reveal";
import { getSiteContent, safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { APEX_SLUG, TRANSFER_UP_SLUG, formatRate, localizeAddon, n, pct, type LocalizedAddon } from "@/components/guest/lib";

// Policies — one hairline list; times, prices and percentages come from
// settings and the add-on catalogue, never hard-coded.
// Rendered per request: prices come from bk_addons and must never be frozen at build time.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const [t, site] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSiteContent()]);
  return pageMetadata({ locale, path: "/policies", title: t("policiesTitle"), description: t("policiesDescription"), image: siteImage(site, "policies_hero") });
}

const ARTICLE = "grid gap-3 border-t border-ink-line py-8 md:grid-cols-[16rem_1fr] md:gap-10";

export default async function PoliciesPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, ta, tc, settings, site] = await Promise.all([
    getTranslations("policies"),
    getTranslations("addons"),
    getTranslations("common"),
    safePublicSettings(),
    getSiteContent(),
  ]);
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
    { key: "times", title: t("checkTimesTitle"), body: t("checkTimesBody", { checkIn: times.check_in, checkOut: times.check_out }) },
    { key: "cancellation", title: t("cancellationTitle"), body: locale === "ar" ? cancellation.policy_ar : cancellation.policy_en },
    { key: "children", title: t("childrenTitle"), body: t("childrenBody", { age: n(booking.child_free_under), price: n(booking.extra_bed_omr) }) },
    { key: "pets", title: t("petsTitle"), body: t("petsBody") },
    { key: "smoking", title: t("smokingTitle"), body: t("smokingBody") },
    { key: "payment", title: t("paymentTitle"), body: t("paymentBody") },
    {
      key: "taxes",
      title: t("taxesTitle"),
      body: t("taxesBody", { service: pct(taxes.service_charge_pct), tourism: pct(taxes.tourism_fee_pct), vat: pct(taxes.vat_pct) }),
    },
    { key: "fourwd", title: t("fourWdTitle"), body: t("fourWdBody") },
  ];

  const transferRules = [
    ta("policy.checkpoint"),
    transfer ? ta("policy.transferPriced", { price: omr(transfer.price), guests: n(maxGuests) }) : ta("policy.transfer", { guests: n(maxGuests) }),
    apex ? ta("policy.apexPriced", { price: omr(apex.price), kg: n(maxWeight) }) : ta("policy.apex", { kg: n(maxWeight) }),
    ta("policy.confirmation"),
    ta("policy.cancellation"),
  ];

  return (
    <div className="g-page">
      <section className="g-container pb-24 sm:pb-32">
        <div className="mx-auto max-w-4xl">
          <Reveal>
            <p className="g-eyebrow-gold">{t("eyebrow")}</p>
            <h1 className="g-h1 mt-5">{t("title")}</h1>
            <p className="g-lead mt-6 max-w-2xl">{t("intro")}</p>
          </Reveal>

          <Reveal delay={150} className="g-frame mt-12 aspect-[3/1] sm:mt-16">
            <Image src={siteImage(site, "policies_hero")} alt="" fill priority sizes="(min-width: 1024px) 896px, 100vw" className="object-cover" />
          </Reveal>

          <div className="mt-14 border-b border-ink-line sm:mt-20">
            {sections.map((s) => (
              <Reveal as="article" key={s.key} className={ARTICLE}>
                <h2 className="g-h4">{s.title}</h2>
                <p className="g-body">{s.body}</p>
              </Reveal>
            ))}

            <Reveal as="article" id="transfers" aria-labelledby="policies-transfers" className={`${ARTICLE} scroll-mt-28`}>
              <h2 id="policies-transfers" className="g-h4">
                {ta("policy.title")}
              </h2>
              <div>
                <ul className="space-y-4">
                  {transferRules.map((rule, i) => (
                    <li key={i} className="flex gap-4">
                      <span className="mt-[0.75em] h-1 w-1 shrink-0 rounded-full bg-gold-500" aria-hidden="true" />
                      <p className="g-body">{rule}</p>
                    </li>
                  ))}
                </ul>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <Link href="/apex-zipline" className="g-btn-outline g-btn-sm w-full sm:w-auto">
                    {ta("policy.apexLink")}
                    <ArrowRight className="g-btn-arrow" aria-hidden="true" />
                  </Link>
                  <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-primary g-btn-sm w-full sm:w-auto">
                    {ta("policy.bookLink")}
                    <ArrowRight className="g-btn-arrow" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}
