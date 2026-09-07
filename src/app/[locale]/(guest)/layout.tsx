import { setRequestLocale } from "next-intl/server";
import { isLocale } from "@/i18n/routing";
import { SiteHeader } from "@/components/guest/site-header";
import { SiteFooter } from "@/components/guest/site-footer";

// Guest-site chrome: sticky maroon header, page, footer with live contact
// details. Every page inside sets its own metadata and setRequestLocale.

export default function GuestLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  if (isLocale(params.locale)) setRequestLocale(params.locale);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
