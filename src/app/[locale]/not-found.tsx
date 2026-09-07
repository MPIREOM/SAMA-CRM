import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-gold-600">404</p>
      <h1 className="mt-3 text-3xl font-extrabold text-maroon-900">{t("notFoundTitle")}</h1>
      <p className="mt-3 text-maroon-600">{t("notFoundBody")}</p>
      <Link href="/" className="mt-8 rounded-full bg-maroon-800 px-6 py-3 text-sm font-bold text-gold-200">
        {t("backHome")}
      </Link>
    </main>
  );
}
