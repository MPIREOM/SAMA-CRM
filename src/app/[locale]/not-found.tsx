import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";

// Localized 404. Rendered inside the guest chrome (header + <main> + footer)
// via (guest)/not-found.tsx, so this is a section, never its own <main>.
export default function NotFound() {
  const t = useTranslations("errors");
  return (
    <section className="g-page g-container pb-24 sm:pb-32">
      <div className="mx-auto flex min-h-[40vh] max-w-2xl flex-col items-center justify-center text-center">
        <p className="g-eyebrow-gold">404</p>
        <h1 className="g-h2 mt-5 [text-wrap:balance]">{t("notFoundTitle")}</h1>
        <p className="g-lead mt-5 max-w-lg">{t("notFoundBody")}</p>
        <Link href="/" className="g-btn-primary mt-10">
          {t("backHome")}
          <ArrowRight className="g-btn-arrow" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
