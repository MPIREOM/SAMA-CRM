import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight, ArrowUpRight, Footprints, MapPin, ShieldCheck, Users, Wallet } from "lucide-react";
import { Link, isLocale, type Locale } from "@/i18n/routing";
import { getAddonBySlug } from "@/lib/bk/catalogue";
import { logger } from "@/lib/logger";
import { pageMetadata } from "@/components/guest/metadata";
import { APEX_SLUG, formatRate, localizeAddon, n, type LocalizedAddon } from "@/components/guest/lib";

// APEX Zipline — the activity add-on guests can book with their stay.
// Copy, price and the stat strip come from the bk_addons record; the
// published facts below are the fallback when the catalogue is unavailable.
export const revalidate = 600;

const APEX_IMAGE = "/images/addons/apex-zipline.jpg";
const APEX_WEBSITE = "https://www.apexzipline.com";
const APEX_OPERATOR = "Al Jabal Adventures LLC";
const FACTS = { length_m: 310, height_m: 20, speed_kmh: 60, max_weight_kg: 120 } as const;

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  return pageMetadata({ locale, path: "/apex-zipline", title: t("apexTitle"), description: t("apexDescription"), image: APEX_IMAGE });
}

function stat(addon: LocalizedAddon | null, key: keyof typeof FACTS): string {
  const v = addon?.details[key];
  return n(typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : FACTS[key]);
}

export default async function ApexZiplinePage({ params }: { params: { locale: string } }) {
  const locale: Locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [t, tc] = await Promise.all([getTranslations("apex"), getTranslations("common")]);

  let addon: LocalizedAddon | null = null;
  try {
    const row = await getAddonBySlug(APEX_SLUG);
    addon = row ? localizeAddon(row, locale) : null;
  } catch (err) {
    logger.warn("guest.apex", "add-on record unavailable", { error: err instanceof Error ? err.message : String(err) });
  }

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
  const safety = [t("safety.shoes"), t("safety.weather"), t("safety.children"), t("safety.weight", { kg: stat(addon, "max_weight_kg") })];

  return (
    <>
      <section className="relative">
        <div className="relative h-[56svh] min-h-[400px] w-full">
          <Image src={addon?.image ?? APEX_IMAGE} alt={t("heroAlt")} fill priority sizes="100vw" className="object-cover object-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-maroon-950/85 via-maroon-950/25 to-transparent" aria-hidden="true" />
          <div className="g-container relative flex h-full flex-col justify-end pb-10">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-gold-300 rtl:text-base rtl:tracking-normal">{t("eyebrow")}</p>
            <h1 className="mt-3 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl rtl:tracking-normal">{t("title")}</h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-stone-100/90 sm:text-lg">{addon?.tagline || t("subtitle")}</p>
          </div>
        </div>
      </section>

      {/* Stat strip ------------------------------------------------------- */}
      <section className="g-container relative z-10 -mt-8" aria-label={t("stats.label")}>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-stone-200 bg-stone-200 shadow-card sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.key} className="flex flex-col-reverse bg-white px-5 py-6 text-center">
              <dt className="mt-1 text-xs font-bold uppercase tracking-wider text-maroon-600 rtl:text-sm rtl:tracking-normal">{s.label}</dt>
              <dd className="text-3xl font-extrabold text-maroon-900 tabular-nums sm:text-4xl" dir="ltr">
                {s.value}
                <span className="ms-1 text-base font-bold text-gold-700">{s.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="g-container grid gap-10 pt-14 sm:pt-16 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div>
          <p className="g-eyebrow">{t("aboutEyebrow")}</p>
          <h2 className="g-h2 mt-3">{t("aboutTitle")}</h2>
          <div className="g-prose mt-5 text-base leading-relaxed text-maroon-800">
            <p>{description}</p>
          </div>

          <h3 className="g-h3 mt-10">{t("routeTitle")}</h3>
          <ol className="mt-4 space-y-3">
            {route.map((text, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-100 text-sm font-extrabold text-gold-800 tabular-nums">{i + 1}</span>
                <p className="pt-1 text-maroon-800">{text}</p>
              </li>
            ))}
          </ol>

          <h3 className="g-h3 mt-10">{t("safetyTitle")}</h3>
          <ul className="mt-4 space-y-2.5">
            {safety.map((text, i) => (
              <li key={i} className="flex items-start gap-3 text-maroon-800">
                {i === 0 ? (
                  <Footprints className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
                ) : i === 2 ? (
                  <Users className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
                )}
                <span>{text}</span>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-sm text-maroon-600">
            {t("operatedBy", { operator })}{" "}
            <a href={website} target="_blank" rel="noopener noreferrer" className="g-link inline-flex items-center gap-1">
              {websiteLabel}
              <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
            </a>
          </p>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="g-card p-6">
            <p className="g-eyebrow">{t("priceEyebrow")}</p>
            {addon ? (
              <p className="mt-3 text-4xl font-extrabold text-maroon-900 tabular-nums" dir="ltr">
                {tc("omrAmount", { amount: formatRate(addon.price) })}
                <span className="ms-2 text-base font-bold text-maroon-600">{t("perRider")}</span>
              </p>
            ) : (
              <p className="mt-3 text-base text-maroon-800">{t("priceUnavailable")}</p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-maroon-700">{t("priceNote")}</p>
            <ul className="mt-5 space-y-3 text-sm text-maroon-800">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
                <span>{t("howStep1")}</span>
              </li>
              <li className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
                <span>{t("howStep2")}</span>
              </li>
              <li className="flex items-start gap-3">
                <Wallet className="mt-0.5 h-5 w-5 shrink-0 text-gold-700" aria-hidden="true" />
                <span>{t("howStep3")}</span>
              </li>
            </ul>
            <Link href={{ pathname: "/", hash: "availability" }} className="g-btn-gold mt-6 w-full">
              {t("cta")}
              <ArrowRight className="h-5 w-5 rtl:rotate-180" aria-hidden="true" />
            </Link>
            <p className="mt-3 text-center text-xs text-maroon-600">{t("ctaHint")}</p>
          </div>
        </aside>
      </section>
    </>
  );
}
