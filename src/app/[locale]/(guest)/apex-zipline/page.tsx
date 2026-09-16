import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getAddonBySlug } from "@/lib/bk/catalogue";
import { logger } from "@/lib/logger";
import { siteImage } from "@/lib/bk/site-content";
import { Reveal } from "@/components/guest/reveal";
import { getSiteContent } from "@/components/guest/data";
import { pageMetadata } from "@/components/guest/metadata";
import { APEX_SLUG, formatRate, localizeAddon, n, type LocalizedAddon } from "@/components/guest/lib";

// APEX Zipline — the activity add-on guests can book with their stay.
// Copy, price and the stat strip come from the bk_addons record; the
// published facts below are the fallback when the catalogue is unavailable.
// Rendered per request: prices come from bk_addons and must never be frozen at build time.
export const dynamic = "force-dynamic";

const APEX_IMAGE = "/images/addons/apex-zipline.jpg";
const APEX_WEBSITE = "https://www.apexzipline.com";
const APEX_OPERATOR = "Al Jabal Adventures LLC";
const FACTS = { length_m: 310, height_m: 20, speed_kmh: 60, max_weight_kg: 120 } as const;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const [t, site] = await Promise.all([getTranslations({ locale, namespace: "meta" }), getSiteContent()]);
  return pageMetadata({ locale, path: "/apex-zipline", title: t("apexTitle"), description: t("apexDescription"), image: siteImage(site, "apex_hero") || APEX_IMAGE });
}

function stat(addon: LocalizedAddon | null, key: keyof typeof FACTS): string {
  const v = addon?.details[key];
  return n(typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : FACTS[key]);
}

/** "01", "02" … — serif ordinals for the route and the how-it-works steps. */
function ordinal(i: number): string {
  return String(i + 1).padStart(2, "0");
}

export default async function ApexZiplinePage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, tc, site] = await Promise.all([getTranslations("apex"), getTranslations("common"), getSiteContent()]);

  let addon: LocalizedAddon | null = null;
  try {
    const row = await getAddonBySlug(APEX_SLUG);
    addon = row ? localizeAddon(row, locale) : null;
  } catch (err) {
    logger.warn("guest.apex", "add-on record unavailable", { error: err instanceof Error ? err.message : String(err) });
  }

  const hero = siteImage(site, "apex_hero") || addon?.image || APEX_IMAGE;
  const website = typeof addon?.details.website === "string" && addon.details.website.startsWith("https://") ? addon.details.website : APEX_WEBSITE;
  const operator = typeof addon?.details.operator === "string" && addon.details.operator ? addon.details.operator : APEX_OPERATOR;
  const websiteLabel = website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const description = addon?.description || t("fallbackDescription");

  const stats = [
    { key: "length", value: stat(addon, "length_m"), unit: t("stats.metres"), label: t("stats.length") },
    { key: "height", value: stat(addon, "height_m"), unit: t("stats.metres"), label: t("stats.height") },
    { key: "speed", value: stat(addon, "speed_kmh"), unit: t("stats.kmh"), label: t("stats.speed") },
    { key: "weight", value: stat(addon, "max_weight_kg"), unit: t("stats.kg"), label: t("stats.weight") },
  ];

  const route = [t("route.start"), t("route.over"), t("route.end")];
  // Plain hairline rows: each line is a full sentence, so no pictogram is needed beside it.
  const safety = [t("safety.shoes"), t("safety.weather"), t("safety.children"), t("safety.weight", { kg: stat(addon, "max_weight_kg") })];
  const steps = [t("howStep1"), t("howStep2"), t("howStep3")];

  return (
    <>
      {/* Hero ------------------------------------------------------------- */}
      <section className="relative isolate" data-hero>
        <div className="relative h-[80svh] min-h-[520px] w-full overflow-hidden lg:max-h-[860px]">
          <Image src={hero} alt={t("heroAlt")} fill priority sizes="100vw" className="g-kenburns object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-ink/20" aria-hidden="true" />
          <div className="g-container relative flex h-full flex-col justify-end pb-14 sm:pb-20">
            <p className="g-eyebrow g-fade-up text-gold-300" style={{ "--g-delay": "200ms" } as React.CSSProperties}>
              {t("eyebrow")}
            </p>
            <h1 className="g-h1 g-fade-up mt-5 max-w-3xl text-paper [text-wrap:balance]" style={{ "--g-delay": "350ms" } as React.CSSProperties}>
              {t("title")}
            </h1>
            <p className="g-fade-up mt-6 max-w-xl text-base leading-relaxed text-paper/80 sm:text-lg" style={{ "--g-delay": "550ms" } as React.CSSProperties}>
              {addon?.tagline || t("subtitle")}
            </p>
          </div>
        </div>
      </section>

      {/* Facts strip: one hairline row ------------------------------------- */}
      {/* The region role sits on the section, not the <dl>: a <dl> with an ARIA role stops being a description list. */}
      <Reveal as="section" aria-label={t("stats.label")} className="g-container pt-6 sm:pt-10">
        <dl className="grid grid-cols-2 gap-px border-y border-ink-line bg-ink-line md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.key} className="flex flex-col-reverse justify-end bg-paper px-4 py-7 sm:px-8 md:py-9">
              <dt className="g-eyebrow mt-2">{s.label}</dt>
              <dd className="g-price text-4xl rtl:text-right" dir="ltr">
                {s.value}
                <span className="g-unit">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Reveal>

      {/* About + booking card ---------------------------------------------- */}
      <section className="g-container g-section grid gap-14 lg:grid-cols-[1.25fr_1fr] lg:gap-20">
        <Reveal className="max-w-2xl">
          <p className="g-eyebrow-gold">{t("aboutEyebrow")}</p>
          <h2 className="g-h2 mt-4 [text-wrap:balance]">{t("aboutTitle")}</h2>
          <div className="g-body g-prose mt-6">
            <p>{description}</p>
          </div>

          <h3 className="g-h3 mt-14">{t("routeTitle")}</h3>
          <ol className="mt-6 border-b border-ink-line">
            {route.map((text, i) => (
              <li key={i} className="grid grid-cols-[3rem_1fr] gap-4 border-t border-ink-line py-5">
                <span className="g-ordinal" dir="ltr" aria-hidden="true">
                  {ordinal(i)}
                </span>
                <p className="g-body">{text}</p>
              </li>
            ))}
          </ol>

          <h3 className="g-h3 mt-14">{t("safetyTitle")}</h3>
          <ul className="mt-6 border-b border-ink-line">
            {safety.map((text, i) => (
              <li key={i} className="border-t border-ink-line py-4">
                <p className="g-body">{text}</p>
              </li>
            ))}
          </ul>

          <p className="g-small mt-10 flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>{t("operatedBy", { operator })}</span>
            <a href={website} target="_blank" rel="noopener noreferrer" className="g-inline inline-flex items-center gap-1" dir="ltr">
              {websiteLabel}
              <ArrowUpRight className="g-arrow-ext h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </p>
        </Reveal>

        <Reveal as="aside" delay={150} className="lg:sticky lg:top-28 lg:self-start">
          <div className="g-card p-8">
            <p className="g-eyebrow-gold">{t("priceEyebrow")}</p>
            {addon ? (
              <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="g-price text-4xl" dir="ltr">
                  {tc("omrAmount", { amount: formatRate(addon.price) })}
                </span>
                <span className="g-small">{t("perRider")}</span>
              </p>
            ) : (
              <p className="g-body mt-4 text-ink">{t("priceUnavailable")}</p>
            )}
            {/* The eyebrow already says whose rate this is, and step 03 says where it is paid. */}

            <p className="g-eyebrow mt-8">{t("howTitle")}</p>
            <ol className="mt-3 border-b border-ink-line">
              {steps.map((text, i) => (
                <li key={i} className="grid grid-cols-[2rem_1fr] gap-3 border-t border-ink-line py-4">
                  <span className="g-ordinal text-lg" dir="ltr" aria-hidden="true">
                    {ordinal(i)}
                  </span>
                  <p className="g-body">{text}</p>
                </li>
              ))}
            </ol>

            <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-gold mt-8 w-full">
              {t("cta")}
              <ArrowRight className="g-btn-arrow" aria-hidden="true" />
            </Link>
            <p className="g-small mt-4 text-center">{t("ctaHint")}</p>
          </div>
        </Reveal>
      </section>
    </>
  );
}
