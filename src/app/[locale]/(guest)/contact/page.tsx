import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { isLocale, type Locale } from "@/i18n/routing";
import { safePublicSettings } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { prettyPhone, telLink, waLink } from "@/components/guest/lib";

// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
export const revalidate = 600;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ locale, path: "/contact", title: t("contactTitle"), description: t("contactDescription") });
}

export default async function ContactPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, settings] = await Promise.all([getTranslations("contact"), safePublicSettings()]);
  const { contact, times } = settings;
  const mailto = `mailto:${contact.email}?subject=${encodeURIComponent(t("mailSubject"))}`;

  return (
    <section className="g-container grid gap-10 pt-12 sm:pt-16 lg:grid-cols-[1fr_1fr] lg:gap-16">
      <div>
        <p className="g-eyebrow">{t("eyebrow")}</p>
        <h1 className="g-h1 mt-3">{t("title")}</h1>
        <p className="g-lead mt-4">{t("intro")}</p>

        <div className="mt-8 flex flex-wrap gap-3">
          <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="g-btn-primary">
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            {t("whatsappCta")}
          </a>
          <a href={mailto} className="g-btn-outline">
            <Mail className="h-5 w-5" aria-hidden="true" />
            {t("emailCta")}
          </a>
        </div>

        <dl className="mt-10 divide-y divide-stone-200 rounded-2xl border border-stone-200 bg-white">
          <Row Icon={Phone} label={t("phone")}>
            <a href={telLink(contact.phone)} dir="ltr" className="g-link">
              {prettyPhone(contact.phone)}
            </a>
          </Row>
          <Row Icon={MessageCircle} label={t("whatsapp")}>
            <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" dir="ltr" className="g-link">
              {prettyPhone(contact.whatsapp)}
            </a>
          </Row>
          <Row Icon={Mail} label={t("email")}>
            <a href={mailto} className="g-link break-all">
              {contact.email}
            </a>
          </Row>
          <Row Icon={MapPin} label={t("address")}>
            <span className="block">{locale === "ar" ? contact.address_ar : contact.address_en}</span>
            <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="g-link mt-1 inline-block text-sm">
              {t("maps")}
            </a>
          </Row>
          <Row Icon={Clock} label={t("hoursLabel")}>
            <span className="block tabular-nums">{t("hours")}</span>
            <span className="block text-sm text-maroon-600 tabular-nums">{t("checkTimes", { checkIn: times.check_in, checkOut: times.check_out })}</span>
          </Row>
        </dl>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:pt-14">
        <div className="relative col-span-2 aspect-[16/10] overflow-hidden rounded-3xl bg-stone-100">
          <Image src="/images/hotel/entrance.jpg" alt="" fill priority sizes="(min-width: 1024px) 520px, 100vw" className="object-cover" />
        </div>
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-stone-100">
          <Image src="/images/hotel/lobby.jpg" alt="" fill sizes="(min-width: 1024px) 250px, 50vw" className="object-cover" />
        </div>
        <div className="relative aspect-square overflow-hidden rounded-3xl bg-stone-100">
          <Image src="/images/hotel/sign-sunset.jpg" alt="" fill sizes="(min-width: 1024px) 250px, 50vw" className="object-cover" />
        </div>
      </div>
    </section>
  );
}

function Row({ Icon, label, children }: { Icon: typeof Phone; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 px-5 py-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-100 text-gold-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{label}</dt>
        <dd className="mt-1 text-base text-maroon-900">{children}</dd>
      </div>
    </div>
  );
}
