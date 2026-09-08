import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Link } from "@/i18n/routing";
import { safePublicSettings } from "./data";
import { prettyPhone, telLink, waLink } from "./lib";

export async function SiteFooter() {
  const [t, tNav, locale, settings] = await Promise.all([
    getTranslations("footer"),
    getTranslations("nav"),
    getLocale(),
    safePublicSettings(),
  ]);
  const ar = locale === "ar";
  const { contact } = settings;
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 bg-maroon-900 text-gold-100">
      <div className="g-container grid gap-12 py-14 md:grid-cols-[1.4fr_1fr_1fr] md:gap-8">
        <div>
          <div className="flex items-center gap-3">
            <Image src="/images/brand/logo-mark.png" alt="" width={44} height={43} className="h-11 w-auto" />
            <div className="leading-none">
              <p className="text-xl font-extrabold text-gold-200">{tNav("brandWordmark")}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-gold-400/90 rtl:text-sm rtl:tracking-normal">
                {tNav("brandSub")}
              </p>
            </div>
          </div>
          <p className="mt-5 max-w-sm text-base leading-relaxed text-gold-100/80">{t("tagline")}</p>
          <div className="mt-6 rounded-2xl border border-gold-500/30 bg-maroon-800/60 p-4">
            <p className="text-sm font-bold text-gold-300">{t("payAtHotel")}</p>
            <p className="mt-1 text-sm leading-relaxed text-gold-100/75">{t("payAtHotelBody")}</p>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gold-400 rtl:tracking-normal">{t("contact")}</h2>
          <ul className="mt-4 space-y-3 text-base">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold-400" aria-hidden="true" />
              <a href={contact.maps_link} target="_blank" rel="noopener noreferrer" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {ar ? contact.address_ar : contact.address_en}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-5 w-5 shrink-0 text-gold-400" aria-hidden="true" />
              <a href={telLink(contact.phone)} dir="ltr" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {prettyPhone(contact.phone)}
              </a>
            </li>
            <li className="flex items-center gap-3">
              <MessageCircle className="h-5 w-5 shrink-0 text-gold-400" aria-hidden="true" />
              <a href={waLink(contact.whatsapp)} target="_blank" rel="noopener noreferrer" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {t("whatsapp")} <span dir="ltr">{prettyPhone(contact.whatsapp)}</span>
              </a>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="h-5 w-5 shrink-0 text-gold-400" aria-hidden="true" />
              <a href={`mailto:${contact.email}`} className="break-all text-gold-100/85 hover:text-gold-100 hover:underline">
                {contact.email}
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-gold-400 rtl:tracking-normal">{t("explore")}</h2>
          <ul className="mt-4 space-y-2.5 text-base">
            <li>
              <Link href="/rooms" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {tNav("rooms")}
              </Link>
            </li>
            <li>
              <Link href="/the-peak" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {tNav("peak")}
              </Link>
            </li>
            <li>
              <Link href="/apex-zipline" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {tNav("apex")}
              </Link>
            </li>
            <li>
              <Link href="/contact" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {tNav("contact")}
              </Link>
            </li>
            <li>
              <Link href="/policies" className="text-gold-100/85 hover:text-gold-100 hover:underline">
                {t("policies")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-gold-500/20">
        <div className="g-container flex flex-col gap-2 py-5 text-xs text-gold-100/60 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {t("rights", { year: String(year) })} <span className="hidden sm:inline">· {t("legal")}</span>
          </p>
          <a href="/login" className="hover:text-gold-100 hover:underline">
            {t("staffLogin")}
          </a>
        </div>
      </div>
    </footer>
  );
}
