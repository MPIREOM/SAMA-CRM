import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, Clock } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { pageMetadata } from "@/components/guest/metadata";

// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
export const revalidate = 600;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ locale, path: "/the-peek", title: t("peekTitle"), description: t("peekDescription"), image: "/images/hotel/terrace-sunset.jpg" });
}

export default async function ThePeekPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const t = await getTranslations("peek");

  return (
    <>
      <section className="relative">
        <div className="relative h-[52svh] min-h-[380px] w-full">
          <Image src="/images/hotel/terrace-sunset.jpg" alt={t("imageAlt1")} fill priority sizes="100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-950/80 via-maroon-950/20 to-transparent" aria-hidden="true" />
          <div className="g-container relative flex h-full flex-col justify-end pb-10">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-gold-300 rtl:text-base rtl:tracking-normal">{t("eyebrow")}</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl rtl:tracking-normal">{t("title")}</h1>
          </div>
        </div>
      </section>

      <section className="g-container grid gap-10 pt-12 sm:pt-16 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div>
          <p className="g-lead">{t("intro")}</p>
          <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-gold-300 bg-gold-50 px-5 py-4">
            <Clock className="h-5 w-5 text-gold-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{t("hoursLabel")}</p>
              <p className="font-bold text-maroon-900 tabular-nums">{t("hours")}</p>
            </div>
          </div>
          <div className="g-prose mt-8 text-base leading-relaxed text-maroon-800">
            <p>{t("body1")}</p>
            <p>{t("body2")}</p>
          </div>
          <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-primary mt-8">
            {t("cta")}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="relative col-span-2 aspect-[4/3] overflow-hidden rounded-3xl bg-stone-100">
            <Image src="/images/hotel/terrace-evening.jpg" alt={t("imageAlt2")} fill sizes="(min-width: 1024px) 420px, 100vw" className="object-cover" />
          </div>
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-stone-100">
            <Image src="/images/hotel/courtyard.jpg" alt={t("imageAlt3")} fill sizes="(min-width: 1024px) 200px, 50vw" className="object-cover" />
          </div>
          <div className="relative aspect-square overflow-hidden rounded-3xl bg-stone-100">
            <Image src="/images/hotel/viewpoint.jpg" alt="" fill sizes="(min-width: 1024px) 200px, 50vw" className="object-cover" />
          </div>
        </div>
      </section>
    </>
  );
}
