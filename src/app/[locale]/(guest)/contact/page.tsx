import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/routing";
import { siteImage } from "@/lib/bk/site-content";
import { Reveal } from "@/components/guest/reveal";
import { getSiteContent, safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { prettyPhone, telLink, waLink } from "@/components/guest/lib";

// Contact — the reservations team's details from settings, three photos
// from the owner-managed slots (contact_1..3).
// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
export const revalidate = 600;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const [t, site] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSiteContent()]);
  return pageMetadata({ locale, path: "/contact", title: t("contactTitle"), description: t("contactDescription"), image: siteImage(site, "contact_1") });
}

export default async function ContactPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, settings, site] = await Promise.all([getTranslations("contact"), safePublicSettings(), getSiteContent()]);
  const { contact, times } = settings;
  const mailto = `mailto:${contact.email}?subject=${encodeURIComponent(t("mailSubject"))}`;

  return (
    <div className="g-page">
      <section className="g-container grid gap-14 pb-24 sm:pb-32 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <p className="g-eyebrow-gold">{t("eyebrow")}</p>
          <h1 className="g-h1 mt-5 [text-wrap:balance]">{t("title")}</h1>
          <p className="g-lead mt-6 max-w-lg">{t("intro")}</p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="g-btn-primary w-full sm:w-auto">
              {t("whatsappCta")}
            </a>
            <a href={mailto} className="g-btn-outline w-full sm:w-auto">
              {t("emailCta")}
            </a>
          </div>

          <dl className="mt-14 max-w-xl border-b border-ink-line">
            <Row label={t("phone")}>
              <a href={telLink(contact.phone)} dir="ltr" className="g-inline">
                {prettyPhone(contact.phone)}
              </a>
            </Row>
            <Row label={t("whatsapp")}>
              <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" dir="ltr" className="g-inline">
                {prettyPhone(contact.whatsapp)}
              </a>
            </Row>
            <Row label={t("email")}>
              <a href={mailto} className="g-inline break-all">
                {contact.email}
              </a>
            </Row>
            <Row label={t("address")}>
              <span className="block">{locale === "ar" ? contact.address_ar : contact.address_en}</span>
              <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="g-link mt-3">
                {t("maps")}
                <ArrowUpRight className="g-arrow-ext h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Row>
            <Row label={t("hoursLabel")}>
              <span className="block">{t("hours")}</span>
              <span className="g-small mt-1 block tabular-nums">{t("checkTimes", { checkIn: times.check_in, checkOut: times.check_out })}</span>
            </Row>
          </dl>
        </Reveal>

        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:pt-10">
          <Reveal className="g-frame g-zoom col-span-2 aspect-[3/2]">
            <Image src={siteImage(site, "contact_1")} alt="" fill priority sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />
          </Reveal>
          <Reveal delay={150} className="g-frame g-zoom aspect-square">
            <Image src={siteImage(site, "contact_2")} alt="" fill sizes="(min-width: 1024px) 290px, 50vw" className="object-cover" />
          </Reveal>
          <Reveal delay={300} className="g-frame g-zoom aspect-square">
            <Image src={siteImage(site, "contact_3")} alt="" fill sizes="(min-width: 1024px) 290px, 50vw" className="object-cover" />
          </Reveal>
        </div>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-t border-ink-line py-5 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <dt className="g-eyebrow sm:pt-1.5">{label}</dt>
      <dd className="g-body min-w-0 text-ink">{children}</dd>
    </div>
  );
}
