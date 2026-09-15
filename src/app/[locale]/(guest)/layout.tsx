import { getTranslations, setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { siteCopy, siteImage } from "@/lib/bk/site-content";
import { SiteHeader } from "@/components/guest/site-header";
import { SiteFooter } from "@/components/guest/site-footer";
import { getSiteContent } from "@/components/guest/data";

// Guest-site chrome: fixed header (transparent over a page hero), page,
// ink-dark footer. Every page inside sets its own metadata and setRequestLocale.

export default async function GuestLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  const locale = isLocale(params.locale) ? params.locale : "en";
  setRequestLocale(locale);
  const [site, t] = await Promise.all([getSiteContent(), getTranslations("nav")]);
  const announcement = siteCopy(site, "announcement", locale);

  return (
    <div className="flex min-h-screen flex-col" style={announcement ? ({ "--g-header": "6.6rem" } as React.CSSProperties) : undefined}>
      <SiteHeader logo={siteImage(site, "brand_mark")} announcement={announcement} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <p className="sr-only">{t("brandWordmark")}</p>
    </div>
  );
}
