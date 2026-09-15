import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/routing";
import { siteImage } from "@/lib/bk/site-content";
import { getSiteContent, safePublicSettings } from "./data";
import { prettyPhone, telLink, waLink } from "./lib";

// Ink-dark footer: the wordmark, three quiet columns, one hairline row.

export async function SiteFooter() {
  const [t, tNav, locale, settings, site] = await Promise.all([
    getTranslations("footer"),
    getTranslations("nav"),
    getLocale(),
    safePublicSettings(),
    getSiteContent(),
  ]);
  const ar = locale === "ar";
  const { contact } = settings;
  const year = new Date().getFullYear();
  const instagram = contact.instagram?.trim();
  const instagramHref = instagram ? (instagram.startsWith("http") ? instagram : `https://instagram.com/${instagram.replace(/^@/, "")}`) : null;

  const columnTitle = "g-eyebrow text-paper/50";
  const link = "text-paper/80 transition-colors duration-300 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 rounded-sm";

  return (
    <footer className="bg-ink text-paper">
      <div className="g-container">
        <div className="grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.3fr_1fr_1fr_1fr] lg:gap-10">
          <div>
            <Link href="/" className="inline-flex items-center gap-4 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
              <Image src={siteImage(site, "brand_mark")} alt="" width={44} height={43} className="h-10 w-auto brightness-0 invert opacity-90" />
              <span className="font-display text-3xl leading-none rtl:font-display-ar">{tNav("brandWordmark")}</span>
            </Link>
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-paper/65">{t("tagline")}</p>
          </div>

          <div>
            <h2 className={columnTitle}>{t("visit")}</h2>
            <p className="mt-5 text-sm leading-relaxed text-paper/80">{ar ? contact.address_ar : contact.address_en}</p>
            <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="g-link-light mt-4">
              {t("directions")}
              <ArrowUpRight className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden="true" />
            </a>
          </div>

          <div>
            <h2 className={columnTitle}>{t("talk")}</h2>
            <ul className="mt-5 space-y-2.5 text-sm">
              <li>
                <a href={telLink(contact.phone)} dir="ltr" className={link}>
                  {prettyPhone(contact.phone)}
                </a>
              </li>
              <li>
                <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className={link}>
                  {t("whatsapp")} <span dir="ltr">{prettyPhone(contact.whatsapp)}</span>
                </a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`} className={cn(link, "break-all")}>
                  {contact.email}
                </a>
              </li>
              {instagramHref && (
                <li>
                  <a href={instagramHref} target="_blank" rel="noopener noreferrer" className={link}>
                    Instagram
                  </a>
                </li>
              )}
            </ul>
          </div>

          <div>
            <h2 className={columnTitle}>{t("explore")}</h2>
            <ul className="mt-5 space-y-2.5 text-sm">
              {(
                [
                  ["/rooms", tNav("rooms")],
                  ["/the-peak", tNav("peak")],
                  ["/apex-zipline", tNav("apex")],
                  ["/contact", tNav("contact")],
                  ["/policies", t("policies")],
                ] as const
              ).map(([href, label]) => (
                <li key={href}>
                  <Link href={href} className={link}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-paper/15 py-6 text-xs text-paper/50 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {t("rights", { year: String(year) })} <span className="hidden sm:inline">· {t("legal")}</span>
          </p>
          <p className="flex items-center gap-5">
            <span>{t("payAtHotel")}</span>
            <a href="/login" className="transition-colors hover:text-paper">
              {t("staffLogin")}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}

function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
