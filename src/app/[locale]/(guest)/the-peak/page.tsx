import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { siteCopy, siteImage } from "@/lib/bk/site-content";
import { Reveal } from "@/components/guest/reveal";
import { getSiteContent } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";

// The Peak — the speciality coffee shop on the terrace. Photos come from the
// owner-managed slots (peak_hero, peak_1..3); the copy is translated.
// Rates, settings and photos change rarely: serve statically, refresh every 10 minutes.
export const revalidate = 600;

const MENU = ["espresso", "qahwa", "bites"] as const;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const [t, site] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSiteContent()]);
  return pageMetadata({ locale, path: "/the-peak", title: t("peakTitle"), description: t("peakDescription"), image: siteImage(site, "peak_hero") });
}

export default async function ThePeakPage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, site] = await Promise.all([getTranslations("peak"), getSiteContent()]);

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="relative isolate" data-hero>
        <div className="relative h-[80svh] min-h-[520px] w-full overflow-hidden lg:max-h-[860px]">
          <Image src={siteImage(site, "peak_hero")} alt={t("imageAlt1")} fill priority sizes="100vw" className="g-kenburns object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-ink/20" aria-hidden="true" />
          <div className="g-container relative flex h-full flex-col justify-end pb-14 sm:pb-20">
            <p className="g-eyebrow g-fade-up text-gold-300" style={{ "--g-delay": "200ms" } as React.CSSProperties}>
              {t("eyebrow")}
            </p>
            <h1 className="g-h1 g-fade-up mt-5 max-w-3xl text-paper [text-wrap:balance]" style={{ "--g-delay": "350ms" } as React.CSSProperties}>
              {t("title")}
            </h1>
          </div>
        </div>
      </section>

      {/* Story + photos ---------------------------------------------------- */}
      <section className="g-container g-section grid gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
        <Reveal>
          <p className="g-lead max-w-xl">{siteCopy(site, "peak_intro", locale) ?? t("intro")}</p>

          <dl className="mt-10 grid max-w-xl gap-2 border-y border-ink-line py-6 sm:grid-cols-[9rem_1fr] sm:items-baseline">
            <dt className="g-eyebrow">{t("hoursLabel")}</dt>
            <dd className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="g-price text-2xl sm:text-3xl" dir="ltr">
                {t("hoursTime")}
              </span>
              <span className="g-small">{t("hoursDays")}</span>
            </dd>
          </dl>

          <div className="g-body g-prose mt-10 max-w-xl">
            <p>{t("body1")}</p>
            <p>{t("body2")}</p>
          </div>

          <div className="mt-12 max-w-xl">
            <p className="g-eyebrow-gold">{t("menuEyebrow")}</p>
            <ul className="mt-4 border-b border-ink-line">
              {MENU.map((item) => (
                <li key={item} className="flex flex-col gap-y-1 border-t border-ink-line py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-x-6">
                  <span className="g-display text-xl">{t(`menu.${item}.name`)}</span>
                  <span className="g-small">{t(`menu.${item}.note`)}</span>
                </li>
              ))}
            </ul>
          </div>

          <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-outline mt-12">
            {t("cta")}
            <ArrowRight className="g-btn-arrow" aria-hidden="true" />
          </Link>
        </Reveal>

        <div className="grid grid-cols-2 gap-4 sm:gap-5 lg:pt-2">
          <Reveal className="g-frame g-zoom col-span-2 aspect-[4/3]">
            <Image src={siteImage(site, "peak_1")} alt={t("imageAlt2")} fill sizes="(min-width: 1024px) 560px, 100vw" className="object-cover" />
          </Reveal>
          <Reveal delay={150} className="g-frame g-zoom aspect-square">
            <Image src={siteImage(site, "peak_2")} alt={t("imageAlt3")} fill sizes="(min-width: 1024px) 270px, 50vw" className="object-cover" />
          </Reveal>
          <Reveal delay={300} className="g-frame g-zoom aspect-square">
            <Image src={siteImage(site, "peak_3")} alt="" fill sizes="(min-width: 1024px) 270px, 50vw" className="object-cover" />
          </Reveal>
        </div>
      </section>
    </>
  );
}
