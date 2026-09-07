import type { Metadata } from "next";
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

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale = isLocale(params.locale) ? params.locale : "en";
  const t = await getTranslations({ locale, namespace: "meta" });
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://sama-crm.vercel.app").replace(/\/$/, "");
  return {
    metadataBase: new URL(base),
    title: { default: t("siteTitle"), template: `%s · ${t("siteName")}` },
    description: t("siteDescription"),
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
    icons: { icon: "/favicon.ico" },
  };
}

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
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
