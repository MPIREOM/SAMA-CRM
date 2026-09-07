import type { Metadata } from "next";
import { nunito, tajawal } from "@/fonts";
import { cookies } from "next/headers";
import { LangProvider } from "@/components/providers/lang-provider";
import { dirFor, LANG_COOKIE, type Lang } from "@/lib/i18n";
import "../globals.css";

export const metadata: Metadata = {
  title: "Sama CRM | سما",
  description: "Sama Hotel guest CRM — bookings, contacts, WhatsApp & campaigns",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieLang = cookies().get(LANG_COOKIE)?.value;
  const lang: Lang = cookieLang === "ar" ? "ar" : "en";

  return (
    <html lang={lang} dir={dirFor(lang)} className={`${nunito.variable} ${tajawal.variable}`}>
      <body>
        <LangProvider initialLang={lang}>{children}</LangProvider>
      </body>
    </html>
  );
}
