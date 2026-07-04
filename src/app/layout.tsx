import type { Metadata } from "next";
import { Nunito_Sans, Tajawal } from "next/font/google";
import { cookies } from "next/headers";
import { LangProvider } from "@/components/providers/lang-provider";
import { dirFor, LANG_COOKIE, type Lang } from "@/lib/i18n";
import "./globals.css";

const nunito = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito",
  weight: ["400", "600", "700", "800"],
});

const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  variable: "--font-tajawal",
  weight: ["400", "500", "700", "800"],
});

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
