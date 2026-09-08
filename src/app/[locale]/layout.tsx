import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { nunito, tajawal } from "@/fonts";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing, isLocale } from "@/i18n/routing";
import "../globals.css";

// Guest-site root layout (one of two root layouts — the CRM has its own under
// src/app/(crm)). <html lang dir> come from the URL locale.

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#3b171b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://sama-crm.vercel.app").replace(/\/$/, "");
  return {
    metadataBase: new URL(base),
    title: { default: t("siteTitle"), template: `%s · ${t("siteName")}` },
    description: t("siteDescription"),
    applicationName: t("siteName"),
    manifest: "/manifest.webmanifest",
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", ar: "/ar", "x-default": "/en" },
    },
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      title: t("siteTitle"),
      description: t("siteDescription"),
      locale: locale === "ar" ? "ar_OM" : "en_GB",
      images: [{ url: "/images/og.jpg", width: 1200, height: 630 }],
    },
    twitter: { card: "summary_large_image" },
    icons: { icon: "/favicon.ico", apple: "/apple-icon.png" },
  };
}

// Google Tag Manager is optional: set NEXT_PUBLIC_GTM_ID to enable it.
const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID?.trim();
const GTM_ID_SAFE = GTM_ID && /^GTM-[A-Z0-9]+$/i.test(GTM_ID) ? GTM_ID : undefined;

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} className={`${nunito.variable} ${tajawal.variable} guest`}>
      <body className="guest-body">
        {GTM_ID_SAFE && (
          <>
            <Script id="gtm" strategy="afterInteractive">
              {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID_SAFE}');`}
            </Script>
            <noscript>
              <iframe
                src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID_SAFE}`}
                height="0"
                width="0"
                style={{ display: "none", visibility: "hidden" }}
                title="Google Tag Manager"
              />
            </noscript>
          </>
        )}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
